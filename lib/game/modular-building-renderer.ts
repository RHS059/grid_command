import * as T from 'three'
import { generateBuilding, presetFromFeature, type BuildingPartKind, type PlacedBuilding } from './building-system'
import { applyBuildingPartTransform, BUILDING_PART_CAPACITY, buildingGeometry } from './building-model'
import { createInteriorWindowMaterial } from './interior-window-material'
import { createColoredBuildingMaterial, createWireSpriteMaterial } from './building-detail-material'
import type { GeometryPacket, Graphics } from './types'

export class ModularBuildingRenderer {
  private features = new Map<string, GeometryPacket['features'][number]>()
  private sectors = new Map<string, string[]>()
  private meshes = new Map<BuildingPartKind, T.InstancedMesh>()
  private dummy = new T.Object3D()
  private revision = 0
  private signature = ''
  private catalog: PlacedBuilding[] | null = null
  private revealStarted = performance.now()
  constructor(private scene: T.Scene) {
    for (const kind of Object.keys(BUILDING_PART_CAPACITY) as BuildingPartKind[]) {
      const material = kind === 'window' ? createInteriorWindowMaterial('#ffffff', true)
        : kind === 'wire' ? createWireSpriteMaterial('#ffffff', true)
        : createColoredBuildingMaterial(kind)
      const geometry = buildingGeometry(kind), capacity = BUILDING_PART_CAPACITY[kind]
      geometry.setAttribute('buildingFade', new T.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1).setUsage(T.DynamicDrawUsage))
      geometry.setAttribute('buildingReveal', new T.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage))
      if (kind === 'window') geometry.setAttribute('roomData', new T.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(T.DynamicDrawUsage))
      if (kind !== 'window' && kind !== 'wire') geometry.setAttribute('buildingColor', new T.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3).setUsage(T.DynamicDrawUsage))
      const mesh = new T.InstancedMesh(geometry, material, capacity); if (kind === 'window' || kind === 'wire') mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3).setUsage(T.DynamicDrawUsage); mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.meshes.set(kind, mesh); scene.add(mesh)
    }
  }
  import(packet: GeometryPacket) {
    if (packet.evict) { for (const id of this.sectors.get(packet.evict) || []) this.features.delete(id); this.sectors.delete(packet.evict) }
    const sector = packet.sector || `legacy-${packet.version}`, ids: string[] = []
    for (const feature of packet.features) if (!feature.water) { this.features.set(feature.key, feature); ids.push(feature.key) }
    this.sectors.set(sector, ids); this.revision++; this.signature = ''
  }
  setFeatures(features: GeometryPacket['features']) {
    this.catalog = null
    this.features.clear(); this.sectors.clear()
    for (const feature of features) if (!feature.water) this.features.set(feature.key, feature)
    this.revision++; this.signature = ''; this.revealStarted = performance.now()
  }
  setCatalog(buildings: PlacedBuilding[]) { this.catalog = buildings; this.features.clear(); this.sectors.clear(); this.revision++; this.signature = ''; this.revealStarted = performance.now() }
  update(center: { x: number; y: number }, zoom: number, graphics: Graphics, terrain: boolean) {
    const smooth = (edge0: number, edge1: number, value: number) => { const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t) }
    const reveal = Math.min(1, (performance.now() - this.revealStarted) / 1100), globalFade = smooth(9.55, 10.35, zoom), enabled = graphics.buildings && globalFade > 0
    if (!enabled) { this.signature = ''; for (const mesh of this.meshes.values()) { mesh.count = 0; mesh.visible = false } return }
    for (const mesh of this.meshes.values()) { const uniforms = (mesh.material as T.ShaderMaterial).uniforms; if (uniforms.buildingGlobalFade) uniforms.buildingGlobalFade.value = globalFade; if (uniforms.buildingRevealProgress) uniforms.buildingRevealProgress.value = reveal }
    const closeZoom = smooth(16.4, 17.15, zoom), signature = `${this.revision}:${closeZoom > 0 ? Math.round(center.x/20) : 0}:${closeZoom > 0 ? Math.round(center.y/20) : 0}:${Math.round(closeZoom*24)}:${graphics.quality}:${terrain}`
    if (signature === this.signature) return
    this.signature = signature
    const buildings = (this.catalog || [...this.features.values()].map(presetFromFeature).filter((value): value is NonNullable<typeof value> => !!value))
      .sort((a,b)=>a.preset.id.localeCompare(b.preset.id))
    const counts = new Map<BuildingPartKind, number>()
    for (const building of buildings) {
      const stagger = Number(building.preset.seed.slice(0, 2)) / 99 * .48
      const layout = generateBuilding(building.preset), distance = Math.hypot(building.x - center.x, building.y - center.y), closeFade = smooth(16.4, 17.15, zoom) * (1 - smooth(315, 405, distance))
      for (const part of layout.parts) {
        const place = (renderKind: BuildingPartKind, fade: number) => {
          if (Math.abs(fade) <= .001) return
          const mesh = this.meshes.get(renderKind)!, index = counts.get(renderKind) || 0
          if (index >= BUILDING_PART_CAPACITY[renderKind]) return
          applyBuildingPartTransform(this.dummy, part, { x: building.x, y: building.y, z: terrain ? building.elevation : 0 }, building.rotation)
          mesh.setMatrixAt(index, this.dummy.matrix); (mesh.geometry.getAttribute('buildingFade') as T.InstancedBufferAttribute).setX(index, fade); (mesh.geometry.getAttribute('buildingReveal') as T.InstancedBufferAttribute).setX(index, stagger)
          const color = new T.Color(part.color), buildingColor = mesh.geometry.getAttribute('buildingColor') as T.InstancedBufferAttribute | undefined; if (buildingColor) buildingColor.setXYZ(index, color.r, color.g, color.b); else mesh.setColorAt(index, color); if (renderKind === 'window') { const room = part.room || { type: 2, span: 1, offset: 0, seed: .5 }; (mesh.geometry.getAttribute('roomData') as T.InstancedBufferAttribute).setXYZW(index, room.type, room.span, room.offset, room.seed) } counts.set(renderKind, index + 1)
        }
        const fade = part.lod === 'close' ? closeFade : 1
        if (part.kind === 'window') { place('window-flat', -(1 - closeFade)); place('window', closeFade) }
        else place(part.kind, fade)
      }
    }
    for (const [kind, mesh] of this.meshes) { mesh.count = counts.get(kind) || 0; mesh.visible = mesh.count > 0; if (mesh.count) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; (mesh.geometry.getAttribute('buildingFade') as T.InstancedBufferAttribute).needsUpdate = true; (mesh.geometry.getAttribute('buildingReveal') as T.InstancedBufferAttribute).needsUpdate = true; const buildingColor = mesh.geometry.getAttribute('buildingColor') as T.InstancedBufferAttribute | undefined; if (buildingColor) buildingColor.needsUpdate = true; if (kind === 'window') (mesh.geometry.getAttribute('roomData') as T.InstancedBufferAttribute).needsUpdate = true } }
  }
  dispose() { for (const mesh of this.meshes.values()) { this.scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as T.Material).dispose(); mesh.dispose() } this.meshes.clear(); this.features.clear(); this.sectors.clear(); this.catalog = null }
}

