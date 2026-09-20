/** Run with the browser project's existing tsx, MVT, earcut and Babylon dependencies. */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { encodeTile, sha256, type Address, type Batch } from './format'

async function main() {
  const args = process.argv.slice(2), option = (name: string, fallback: string) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1] }
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [process.cwd(), path.resolve(here, '../../..'), path.resolve(here, '../../../grid_command')]
  const source = path.resolve(option('--source', candidates.find(root => existsSync(path.join(root, 'lib/game/geo-tile-geometry.ts'))) ?? ''))
  if (!existsSync(path.join(source, 'lib/game/geo-tile-geometry.ts'))) throw Error('Supply --source with the browser repository root')
  const output = path.resolve(option('--output', path.resolve(here, '../../data/generated/geographic')))
  const theaterFile = path.resolve(option('--theater', path.resolve(here, '../../data/theater.json')))
  const theaterData = JSON.parse(await readFile(theaterFile, 'utf8'))
  const origin: [number,number] = option('--origin', theaterData.origin.join(',')).split(',').map(Number) as [number,number]
  if(origin.length!==2 || !origin.every(Number.isFinite) || Math.abs(origin[1])>85.05112878) throw Error('Invalid theater origin')
  const zooms = option('--zooms', '9,11,13').split(',').map(Number).sort((a,b) => a-b)
  const points: number[][] = [...Object.values(theaterData.bases??{}),...Object.values(theaterData.airbases??{}),...(theaterData.objectives??[]).map((row:any[])=>[row[2],row[3]])] as number[][]
  if(!points.length) points.push(origin)
  const lonPadding=10000/(111320*Math.cos(origin[1]*Math.PI/180)),latPadding=10000/111320
  const defaultBounds=[Math.min(...points.map(p=>p[0]))-lonPadding,Math.min(...points.map(p=>p[1]))-latPadding,Math.max(...points.map(p=>p[0]))+lonPadding,Math.max(...points.map(p=>p[1]))+latPadding]
  const bounds = option('--bounds', defaultBounds.join(',')).split(',').map(Number)
  if (bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3] || zooms.some(z => !Number.isInteger(z) || z < 0 || z > 14)) throw Error('Invalid zoom levels or geographic bounds')
  const concurrency = Math.max(1, Math.min(8, Number(option('--concurrency', '4'))))
  const require = createRequire(path.join(source, 'package.json'))
  const { VectorTile } = require('@mapbox/vector-tile'), Pbf = require('pbf')
  const geometry = await import(pathToFileURL(path.join(source, 'lib/game/geo-tile-geometry.ts')).href)
  const geography = await import(pathToFileURL(path.join(source, 'lib/game/geography.ts')).href)
  const installations = await import(pathToFileURL(path.join(source, 'lib/game/installation-footprints.ts')).href)
  const originCoordinate=geography.MercatorCoordinate.fromLngLat(origin),scale=originCoordinate.meterInMercatorCoordinateUnits()
  const toPoint=(longitude:number,latitude:number)=>{const p=geography.MercatorCoordinate.fromLngLat([longitude,latitude]);return {x:(p.x-originCoordinate.x)/scale,y:(originCoordinate.y-p.y)/scale}}
  const exclusions=Object.values(theaterData.bases??{}).map((value:any)=>installations.installationFootprint('MOB',3,toPoint(value[0],value[1]),3)).concat(Object.values(theaterData.airbases??{}).map((value:any)=>installations.installationFootprint('AIRFIELD',3,toPoint(value[0],value[1]),3)))
  await mkdir(path.join(output, 'tiles'), { recursive: true })
  const fetchBytes = async (url: string): Promise<Buffer> => {
    let last: unknown
    for (let attempt = 0; attempt < 4; attempt++) {
      try { const response = await fetch(url, { signal: AbortSignal.timeout(45000) }); if (!response.ok) throw Error(`${response.status} ${url}`); return Buffer.from(await response.arrayBuffer()) }
      catch (error) { last = error; if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt)) }
    }
    throw last
  }
  const metadata = JSON.parse((await fetchBytes(geography.VECTOR_TILEJSON)).toString())
  if (!Array.isArray(metadata.tiles) || !metadata.tiles[0]?.startsWith('https://')) throw Error('Invalid OpenFreeMap TileJSON')
  const addresses: Address[] = []
  for (const z of zooms) {
    const nw = geography.tileAt([bounds[0],bounds[3]],z), se = geography.tileAt([bounds[2],bounds[1]],z)
    for (let y=nw.y; y<=se.y; y++) for(let x=nw.x; x<=se.x; x++) addresses.push({z,x,y})
  }
  const entries: any[] = [], errors: string[] = []
  let next = 0, completed = 0
  await Promise.all(Array.from({length:concurrency}, async () => {
    while (next < addresses.length) {
      const address = addresses[next++], key = `${address.z}/${address.x}/${address.y}`, filename = `tiles/${address.z}_${address.x}_${address.y}.bin`
      try {
        const mvt = await fetchBytes(geography.tileURL(metadata.tiles[0], address))
        const vector = new VectorTile(new Pbf(mvt)), positions: number[] = [], extent = 2 ** address.z
        for (let row=0; row<=1; row++) for(let col=0; col<=1; col++) {
          const ll = new geography.MercatorCoordinate((address.x+col)/extent,(address.y+row)/extent).toLngLat(), point=toPoint(ll.lng,ll.lat)
          positions.push(point.x,point.y,0)
        }
        const ground: Batch = {positions,indices:[0,2,1,1,2,3],colors:[]}
        const batches = geometry.buildGeographicBatches(vector.layers,{positions,resolution:1},exclusions)
        const encoded = encodeTile(address,{ground,...batches})
        await writeFile(path.join(output,filename),encoded.bytes)
        entries.push({key,z:address.z,x:address.x,y:address.y,file:filename,bytes:encoded.bytes.length,sha256:sha256(encoded.bytes),pieces:encoded.pieces,triangles:encoded.triangles,bounds:[positions[0]/100,-positions[1]/100,positions[3]/100,-positions[7]/100]})
        completed++
        if (completed % 10 === 0 || completed === addresses.length) process.stdout.write(`GEOGRAPHIC_BUILD ${completed}/${addresses.length}\n`)
      } catch(error) { errors.push(`${key}: ${error}`) }
    }
  }))
  if(errors.length) throw Error(`Catalog is incomplete. ${errors.length} tile(s) failed:\n${errors.slice(0,10).join('\n')}`)
  entries.sort((a,b)=>a.z-b.z||a.y-b.y||a.x-b.x)
  const sourceFiles = ['lib/game/geography.ts','lib/game/geo-tile-geometry.ts','lib/game/theater.ts','lib/game/installation-footprints.ts']
  const sources = await Promise.all(sourceFiles.map(async file=>({file,sha256:sha256(await readFile(path.join(source,file)))})))
  const manifest = {schema:1,format:'GCGEO001',complete:true,projection:'browser local Mercator; metres / 100; +X east, -Z north',origin,bounds,zooms,terrain:false,tile_template:metadata.tiles[0],palette:geometry.GEOGRAPHIC_PALETTE,attribution:'© OpenStreetMap contributors · OpenFreeMap',attribution_urls:['https://www.openstreetmap.org/copyright','https://openfreemap.org'],sources,tile_count:entries.length,total_bytes:entries.reduce((n,e)=>n+e.bytes,0),tiles:entries}
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest))
  process.stdout.write(`GEOGRAPHIC_CATALOG_OK ${entries.length} tiles, ${manifest.total_bytes} bytes, ${output}\n`)
}
main().catch(error=>{ console.error(error); process.exitCode=1 })
