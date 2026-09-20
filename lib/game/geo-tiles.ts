import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Material } from '@babylonjs/core/Materials/material'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import type { Scene } from '@babylonjs/core/scene'
import { ELEVATION_TEMPLATE, LngLat, MercatorCoordinate, fetchVectorTile, tileAt, tileKey, tileURL, type TileAddress, type LngLatLike } from './geography'
import { fromPoint, toPoint } from './theater'
import { buildGeographicBatches, GEOGRAPHIC_LABEL_SIZE, GEOGRAPHIC_PALETTE, selectGeographicLabels, type GeographicBatch, type GeographicBatchKind } from './geo-tile-geometry'

type Tile = { address: TileAddress; mesh: Mesh; features: Mesh[]; label?: { texture: DynamicTexture; material: PBRMaterial }; dem?: ImageData }
export type GeographicTileEvent = { address: TileAddress; elevation: boolean; error?: Error }
export type TerrainBounds = { minX: number; maxX: number; minY: number; maxY: number }
type TerrainVertex={x:number;y:number;z:number}
export function clippedTriangleRange(triangle:TerrainVertex[],bounds:TerrainBounds){
  let polygon=triangle
  const clips:[keyof Pick<TerrainVertex,'x'|'y'>,number,boolean][]=[['x',bounds.minX,true],['x',bounds.maxX,false],['y',bounds.minY,true],['y',bounds.maxY,false]]
  for(const[axis,edge,minimum]of clips){const input=polygon;polygon=[];for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],aIn=minimum?a[axis]>=edge:a[axis]<=edge,bIn=minimum?b[axis]>=edge:b[axis]<=edge;if(aIn)polygon.push(a);if(aIn!==bIn){const t=(edge-a[axis])/(b[axis]-a[axis]);polygon.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t})}}if(!polygon.length)return undefined}
  return{high:Math.max(...polygon.map(v=>v.z)),low:Math.min(...polygon.map(v=>v.z))}
}
export const terrainTriangleHeightAt=(a:TerrainVertex,b:TerrainVertex,c:TerrainVertex,p:{x:number;y:number})=>{const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y),u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/den,v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/den,w=1-u-v;return u>=-1e-7&&v>=-1e-7&&w>=-1e-7?a.z*u+b.z*v+c.z*w:undefined}
/** Upload a canvas whose rows run north-to-south into Babylon's bottom-left UV space. */
export function uploadGeographicTexture(texture: Pick<DynamicTexture, 'update'>) { texture.update(true) }
/** Tile row zero is north; after Babylon's Y inversion it belongs at the top of the mesh (v=1). */
export function geographicTileUV(column: number, row: number, resolution: number): [number, number] { return [column / resolution, 1 - row / resolution] }
/** Bounded geographic tile cache with one shared-material mesh per visual role. */
export class GeographicTiles {
  private tiles = new Map<string, Tile>()
  private wanted = new Set<string>()
  private pending = new Map<string, AbortController>()
  private queued: TileAddress[] = []
  private disposed = false
  private signature = ''
  private terrain = false
  private labels = true
  private materials = new Map<keyof typeof GEOGRAPHIC_PALETTE, PBRMaterial>()
  constructor(private scene: Scene, private changed: (event: GeographicTileEvent) => void) {}
  update(center: LngLatLike, zoom: number, terrain: boolean, labels: boolean) {
    const address = tileAt(center, Math.max(7, Math.min(14, Math.floor(zoom) - 1)))
    const signature = `${tileKey(address)}:${terrain}:${labels}`
    if (signature === this.signature) return
    this.signature = signature
    if (terrain !== this.terrain || labels !== this.labels) {
      for (const tile of this.tiles.values()) this.disposeTile(tile)
      this.tiles.clear()
      for (const request of this.pending.values()) request.abort()
      this.pending.clear()
    }
    this.terrain = terrain; this.labels = labels; this.wanted.clear(); this.queued = []
    const radius = 3, extent = 2 ** address.z
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      const tile = { z: address.z, x: (address.x + x + extent) % extent, y: address.y + y }
      if (tile.y < 0 || tile.y >= extent) continue
      this.wanted.add(tileKey(tile)); if (!this.tiles.has(tileKey(tile)) && !this.pending.has(tileKey(tile))) this.queued.push(tile)
    }
    this.queued.sort((a, b) => Math.hypot(a.x - address.x, a.y - address.y) - Math.hypot(b.x - address.x, b.y - address.y))
    // Retain the previous zoom until the replacement center arrives, avoiding an empty frame.
    for (const [key, tile] of this.tiles) if (!this.wanted.has(key) && tile.address.z === address.z) { this.disposeTile(tile); this.tiles.delete(key) }
    for (const [key, request] of this.pending) if (!this.wanted.has(key)) { request.abort(); this.pending.delete(key) }
    this.pump()
  }
  private pump() {
    while (!this.disposed && this.pending.size < 4 && this.queued.length) {
      const tile = this.queued.shift()!, key = tileKey(tile), controller = new AbortController(), terrain = this.terrain, labels = this.labels
      this.pending.set(key, controller)
      this.load(tile, terrain, labels, controller.signal).then(result => {
        if (this.disposed || controller.signal.aborted || !this.wanted.has(key)) { this.disposeTile(result); return }
        this.tiles.set(key, result)
        for (const [oldKey, old] of this.tiles) if (old.address.z !== tile.z) { this.disposeTile(old); this.tiles.delete(oldKey) }
        this.changed({ address: tile, elevation: !!result.dem })
      }).catch(error => {
        if (!controller.signal.aborted) {
          const failure = error instanceof Error ? error : new Error(String(error))
          console.warn('Geographic tile unavailable', key, failure)
          this.changed({ address: tile, elevation: false, error: failure })
        }
      }).finally(() => { if (this.pending.get(key) === controller) this.pending.delete(key); this.pump() })
    }
  }
  private async load(address: TileAddress, terrain: boolean, labels: boolean, signal: AbortSignal): Promise<Tile> {
    const [bytes, dem] = await Promise.all([fetchVectorTile(address, signal), terrain ? this.loadElevation(address, signal).catch(() => undefined) : undefined])
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const vector = new VectorTile(new Pbf(new Uint8Array(bytes)))
    const mesh = new Mesh(`terrain-${tileKey(address)}`, this.scene), data = new VertexData(), positions: number[] = [], uvs: number[] = [], indices: number[] = [], resolution = terrain ? 24 : 1, extent = 2 ** address.z
    for (let row = 0; row <= resolution; row++) for (let col = 0; col <= resolution; col++) {
      const u = col / resolution, v = row / resolution, ll = new MercatorCoordinate((address.x + u) / extent, (address.y + v) / extent).toLngLat(), point = toPoint(ll.lng, ll.lat)
      positions.push(point.x, point.y, dem ? this.sampleDEM(dem, u, v) : 0); uvs.push(...geographicTileUV(col, row, resolution))
    }
    for (let row = 0; row < resolution; row++) for (let col = 0; col < resolution; col++) { const a = row * (resolution + 1) + col, b = a + resolution + 1; indices.push(a, b, a + 1, a + 1, b, b + 1) }
    data.positions = positions; data.indices = indices; data.uvs = uvs; const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals, { useRightHandedSystem: true }); data.normals = normals; data.applyToMesh(mesh); mesh.material = this.material('ground'); mesh.sideOrientation = Material.CounterClockWiseSideOrientation; mesh.receiveShadows = true; mesh.isPickable = false; mesh.freezeWorldMatrix()
    const tile: Tile = { address, mesh, features: [], dem }
    try {
      const batches = buildGeographicBatches(vector.layers, { positions, resolution })
      for (const kind of Object.keys(batches) as GeographicBatchKind[]) {
        if (batches[kind].indices.length) tile.features.push(this.featureMesh(`${kind}-${tileKey(address)}`, batches[kind], this.material(kind)))
      }
      // Rasterization is reserved for text. The transparent label overlay cannot
      // soften shorelines, roads or building footprints underneath it.
      const places = labels ? selectGeographicLabels(vector.layers.place, address.z) : []
      if (places.length) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = GEOGRAPHIC_LABEL_SIZE
        const context = canvas.getContext('2d')!
        context.font = '600 12px system-ui'; context.textAlign = 'center'; context.fillStyle = '#a1b6ce'; context.strokeStyle = GEOGRAPHIC_PALETTE.ground; context.lineWidth = 3
        for (const { text, x, y } of places) { context.strokeText(text, x, y); context.fillText(text, x, y) }
        // No mip chain: the 49-tile cache needs at most 49 MiB of label pixels,
        // and tiles with no ranked, non-overlapping labels allocate none.
        const texture = new DynamicTexture(`geography-labels-${tileKey(address)}`, canvas, this.scene, false)
        texture.hasAlpha = true; uploadGeographicTexture(texture)
        const material = new PBRMaterial(`geography-labels-${tileKey(address)}`, this.scene)
        material.albedoTexture = texture; material.useAlphaFromAlbedoTexture = true; material.transparencyMode = Material.MATERIAL_ALPHABLEND; material.disableDepthWrite = true; material.backFaceCulling = false; material.unlit = true; material.albedoColor = Color3.White()
        tile.label = { texture, material }
        const labelMesh = this.featureMesh(`labels-${tileKey(address)}`, { positions: positions.map((value, index) => index % 3 === 2 ? value + .32 : value), indices, colors: [] }, material)
        labelMesh.setVerticesData(VertexBuffer.UVKind, uvs); tile.features.push(labelMesh)
      }
      return tile
    } catch (error) { this.disposeTile(tile); throw error }
  }
  private material(kind: keyof typeof GEOGRAPHIC_PALETTE) {
    let material = this.materials.get(kind)
    if (!material) {
      material = new PBRMaterial(`geography-${kind}`, this.scene)
      material.albedoColor = Color3.FromHexString(GEOGRAPHIC_PALETTE[kind]).toLinearSpace(); material.roughness = .95; material.metallic = 0; material.backFaceCulling = false; material.unlit = true
      this.materials.set(kind, material)
    }
    return material
  }
  private featureMesh(name: string, batch: GeographicBatch, material: PBRMaterial) {
    const mesh = new Mesh(name, this.scene), data = new VertexData(), normals: number[] = []
    data.positions = batch.positions; data.indices = batch.indices
    if (batch.colors.length) data.colors = batch.colors
    VertexData.ComputeNormals(batch.positions, batch.indices, normals, { useRightHandedSystem: true }); data.normals = normals; data.applyToMesh(mesh)
    mesh.material = material; mesh.sideOrientation = Material.CounterClockWiseSideOrientation; mesh.isPickable = false; mesh.freezeWorldMatrix()
    return mesh
  }
  private async loadElevation(address: TileAddress, signal: AbortSignal) {
    const response = await fetch(tileURL(ELEVATION_TEMPLATE, address), { signal })
    if (!response.ok) throw new Error(`Elevation tile failed (${response.status})`)
    const bitmap = await createImageBitmap(await response.blob()), canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(bitmap, 0, 0); bitmap.close()
    return context.getImageData(0, 0, canvas.width, canvas.height)
  }
  private sampleDEM(image: ImageData, u: number, v: number) {
    const x = Math.max(0, Math.min(image.width - 1, u * (image.width - 1))), y = Math.max(0, Math.min(image.height - 1, v * (image.height - 1))), x0 = Math.floor(x), y0 = Math.floor(y)
    const read = (col: number, row: number) => { const offset = (Math.min(image.height - 1, row) * image.width + Math.min(image.width - 1, col)) * 4; return image.data[offset] * 256 + image.data[offset + 1] + image.data[offset + 2] / 256 - 32768 }
    const a = read(x0, y0) * (1 - (x - x0)) + read(x0 + 1, y0) * (x - x0), b = read(x0, y0 + 1) * (1 - (x - x0)) + read(x0 + 1, y0 + 1) * (x - x0)
    return a * (1 - (y - y0)) + b * (y - y0)
  }
  elevation(point: LngLatLike): number | null {
    if (!this.terrain) return 0
    const coordinate = MercatorCoordinate.fromLngLat(point)
    for (const tile of this.tiles.values()) { if (!tile.dem) continue; const size = 2 ** tile.address.z, u = coordinate.x * size - tile.address.x, v = coordinate.y * size - tile.address.y; if (u >= 0 && u <= 1 && v >= 0 && v <= 1){const positions=tile.mesh.getVerticesData(VertexBuffer.PositionKind);if(!positions)return null;const resolution=24,col=Math.min(resolution-1,Math.floor(u*resolution)),row=Math.min(resolution-1,Math.floor(v*resolution)),a=(row*(resolution+1)+col)*3,b=a+3,c=a+(resolution+1)*3,d=c+3,vertex=(offset:number)=>({x:positions[offset],y:positions[offset+1],z:positions[offset+2]}),ll=LngLat.convert(point),p=toPoint(ll.lng,ll.lat);return terrainTriangleHeightAt(vertex(a),vertex(c),vertex(b),p)??terrainTriangleHeightAt(vertex(b),vertex(c),vertex(d),p)??null} }
    return null
  }
  elevationRange(bounds:TerrainBounds){
    const terrainTiles=[...this.tiles.values()].filter((tile):tile is Tile&{dem:ImageData}=>!!tile.dem);if(!terrainTiles.length)return undefined
    const z=terrainTiles[0].address.z,size=2**z,coordinates=[fromPoint({x:bounds.minX,y:bounds.minY}),fromPoint({x:bounds.minX,y:bounds.maxY}),fromPoint({x:bounds.maxX,y:bounds.minY}),fromPoint({x:bounds.maxX,y:bounds.maxY})].map(value=>MercatorCoordinate.fromLngLat(value)),xs=coordinates.map(c=>c.x*size),ys=coordinates.map(c=>c.y*size)
    for(let x=Math.floor(Math.min(...xs));x<=Math.floor(Math.max(...xs));x++)for(let y=Math.floor(Math.min(...ys));y<=Math.floor(Math.max(...ys));y++)if(!terrainTiles.some(tile=>tile.address.z===z&&tile.address.x===x&&tile.address.y===y))return undefined
    let high=-Infinity,low=Infinity
    for(const tile of this.tiles.values()){
      const positions=tile.mesh.getVerticesData(VertexBuffer.PositionKind),indices=tile.mesh.getIndices();if(!tile.dem||!positions||!indices)continue
      for(let i=0;i<indices.length;i+=3){const triangle=[indices[i],indices[i+1],indices[i+2]].map(index=>({x:positions[index*3],y:positions[index*3+1],z:positions[index*3+2]})),range=clippedTriangleRange(triangle,bounds);if(range){high=Math.max(high,range.high);low=Math.min(low,range.low)}}
    }
    return Number.isFinite(high)&&Number.isFinite(low)?{high,low}:undefined
  }
  get elevationReady() { return [...this.tiles.values()].some(tile => !!tile.dem) }
  private disposeTile(tile: Tile) { tile.mesh.dispose(); for (const mesh of tile.features) mesh.dispose(); tile.label?.material.dispose(); tile.label?.texture.dispose() }
  dispose() { this.disposed = true; for (const controller of this.pending.values()) controller.abort(); this.pending.clear(); for (const tile of this.tiles.values()) this.disposeTile(tile); this.tiles.clear(); for (const material of this.materials.values()) material.dispose(); this.materials.clear() }
}
