import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Material } from '@babylonjs/core/Materials/material'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import type { Scene } from '@babylonjs/core/scene'
import { ELEVATION_TEMPLATE, MercatorCoordinate, fetchVectorTile, tileAt, tileKey, tileURL, type TileAddress, type LngLatLike } from './geography'
import { toPoint } from './theater'

type Tile = { address: TileAddress; mesh: Mesh; texture: DynamicTexture; material: PBRMaterial; dem?: ImageData }
type TilePoint = { x: number; y: number }
const layerColors: Record<string, string> = { landcover: '#20322e', landuse: '#293332', park: '#203c34', water: '#102d42', building: '#3a4950' }
/** Bounded geographic tile cache. Tile textures and terrain are ordinary native GPU meshes. */
export class GeographicTiles {
  private tiles = new Map<string, Tile>()
  private wanted = new Set<string>()
  private pending = new Map<string, AbortController>()
  private queued: TileAddress[] = []
  private disposed = false
  private signature = ''
  private terrain = false
  private labels = true
  constructor(private scene: Scene, private changed: (elevation: boolean) => void) {}
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
        this.changed(!!result.dem)
      }).catch(error => { if (!controller.signal.aborted) console.warn('Geographic tile unavailable', key, error) }).finally(() => { if (this.pending.get(key) === controller) this.pending.delete(key); this.pump() })
    }
  }
  private async load(address: TileAddress, terrain: boolean, labels: boolean, signal: AbortSignal): Promise<Tile> {
    const [bytes, dem] = await Promise.all([fetchVectorTile(address, signal), terrain ? this.loadElevation(address, signal).catch(() => undefined) : undefined])
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')!; context.fillStyle = '#1b2a32'; context.fillRect(0, 0, 512, 512)
    const vector = new VectorTile(new Pbf(new Uint8Array(bytes)))
    for (const name of ['landcover', 'landuse', 'park', 'water', 'waterway', 'transportation', 'building']) {
      const layer = vector.layers[name]; if (!layer) continue
      context.lineJoin = 'round'; context.lineCap = 'round'
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i), paths = feature.loadGeometry() as TilePoint[][], scale = 512 / layer.extent
        context.beginPath()
        for (const path of paths) { path.forEach((point, index) => index ? context.lineTo(point.x * scale, point.y * scale) : context.moveTo(point.x * scale, point.y * scale)); if (feature.type === 3) context.closePath() }
        if (name === 'transportation' || name === 'waterway') {
          const major = ['motorway', 'trunk', 'primary'].includes(String(feature.properties.class))
          context.strokeStyle = name === 'waterway' ? '#23465b' : major ? '#687264' : '#414e51'
          context.lineWidth = name === 'waterway' ? 1 : major ? 2.8 : 1.1; context.stroke()
        } else { context.fillStyle = layerColors[name]; context.fill('evenodd') }
      }
    }
    if (labels) {
      const layer = vector.layers.place
      context.font = '600 12px system-ui'; context.textAlign = 'center'; context.fillStyle = '#adbac1'; context.strokeStyle = '#182833'; context.lineWidth = 3
      for (let i = 0; layer && i < layer.length; i++) { const feature = layer.feature(i), point = feature.loadGeometry()[0]?.[0], name = feature.properties['name:en'] || feature.properties.name; if (!point || !name) continue; const x = point.x * 512 / layer.extent, y = point.y * 512 / layer.extent; context.strokeText(String(name), x, y); context.fillText(String(name), x, y) }
    }
    const texture = new DynamicTexture(`geography-${tileKey(address)}`, canvas, this.scene, true)
    const material = new PBRMaterial(`ground-${tileKey(address)}`, this.scene); material.albedoTexture = texture; material.roughness = .92; material.metallic = .02; material.backFaceCulling = false; material.albedoColor = Color3.White(); material.maxSimultaneousLights = 8
    const mesh = new Mesh(`terrain-${tileKey(address)}`, this.scene), data = new VertexData(), positions: number[] = [], uvs: number[] = [], indices: number[] = [], resolution = terrain ? 24 : 1, extent = 2 ** address.z
    for (let row = 0; row <= resolution; row++) for (let col = 0; col <= resolution; col++) {
      const u = col / resolution, v = row / resolution, ll = new MercatorCoordinate((address.x + u) / extent, (address.y + v) / extent).toLngLat(), point = toPoint(ll.lng, ll.lat)
      positions.push(point.x, point.y, dem ? this.sampleDEM(dem, u, v) : 0); uvs.push(u, 1 - v)
    }
    for (let row = 0; row < resolution; row++) for (let col = 0; col < resolution; col++) { const a = row * (resolution + 1) + col, b = a + resolution + 1; indices.push(a, b, a + 1, a + 1, b, b + 1) }
    data.positions = positions; data.indices = indices; data.uvs = uvs; const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals, { useRightHandedSystem: true }); data.normals = normals; data.applyToMesh(mesh); mesh.material = material; mesh.sideOrientation = Material.CounterClockWiseSideOrientation; mesh.receiveShadows = true
    return { address, mesh, texture, material, dem }
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
    for (const tile of this.tiles.values()) { if (!tile.dem) continue; const size = 2 ** tile.address.z, u = coordinate.x * size - tile.address.x, v = coordinate.y * size - tile.address.y; if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return this.sampleDEM(tile.dem, u, v) }
    return null
  }
  get elevationReady() { return [...this.tiles.values()].some(tile => !!tile.dem) }
  private disposeTile(tile: Tile) { tile.mesh.dispose(); tile.material.dispose(); tile.texture.dispose() }
  dispose() { this.disposed = true; for (const controller of this.pending.values()) controller.abort(); this.pending.clear(); for (const tile of this.tiles.values()) this.disposeTile(tile); this.tiles.clear() }
}
