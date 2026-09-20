import { mkdir,writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

async function main(){
  const here=path.dirname(fileURLToPath(import.meta.url)),root=process.cwd(),require=createRequire(path.join(root,'package.json'))
  const {VectorTile}=require('@mapbox/vector-tile'),Pbf=require('pbf')
  const output=path.resolve(here,'../../data/generated/geographic-fixtures')
  await mkdir(output,{recursive:true})
  const metadata=await fetch('https://tiles.openfreemap.org/planet').then(r=>{if(!r.ok)throw Error(String(r.status));return r.json()}) as any
  const reference:any[]=[]
  for(const [name,lon,lat,z] of [['paris',2.3522,48.8566,12],['tokyo',139.6917,35.6895,12],['paris_buildings',2.3522,48.8566,14]] as const){
    const x=Math.floor((lon+180)/360*2**z),y=Math.floor((1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2*2**z)
    const url=metadata.tiles[0].replace('{z}',z).replace('{x}',x).replace('{y}',y)
    const response=await fetch(url);if(!response.ok)throw Error(`${response.status} ${name}`)
    const bytes=Buffer.from(await response.arrayBuffer()),tile=new VectorTile(new Pbf(bytes))
    const layers=Object.fromEntries(Object.entries(tile.layers).filter(([name])=>['water','waterway','transportation','building','place'].includes(name)).map(([name,layer]:any)=>[name,layer.length]))
    await writeFile(path.join(output,`${name}.pbf`),bytes)
    reference.push({name,origin:[lon,lat],address:[z,x,y],layers})
  }
  await writeFile(path.join(output,'reference.json'),JSON.stringify(reference))
  console.log(reference)
}
main().catch(error=>{console.error(error);process.exitCode=1})
