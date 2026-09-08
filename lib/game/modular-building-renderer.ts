import * as T from 'three'
import { generateBuilding, presetFromFeature, type BuildingPartKind } from './building-system'
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
  constructor(private scene: T.Scene) {
    for (const kind of Object.keys(BUILDING_PART_CAPACITY) as BuildingPartKind[]) {
      const material = kind === 'window' ? createInteriorWindowMaterial('#ffffff', true)
        : kind === 'window-flat' ? new T.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, toneMapped: true })
        : kind === 'wire' ? createWireSpriteMaterial('#ffffff', true)
        : createColoredBuildingMaterial(kind)
      const geometry = buildingGeometry(kind), capacity = BUILDING_PART_CAPACITY[kind]
      if (kind === 'window') geometry.setAttribute('roomData', new T.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(T.DynamicDrawUsage))
      const mesh = new T.InstancedMesh(geometry, material, capacity); mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3).setUsage(T.DynamicDrawUsage); mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.meshes.set(kind, mesh); scene.add(mesh)
    }
  }
  import(packet: GeometryPacket) {
    if (packet.evict) { for (const id of this.sectors.get(packet.evict) || []) this.features.delete(id); this.sectors.delete(packet.evict) }
    const sector = packet.sector || `legacy-${packet.version}`, ids: string[] = []
    for (const feature of packet.features) if (!feature.water) { this.features.set(feature.key, feature); ids.push(feature.key) }
    this.sectors.set(sector, ids); this.revision++; this.signature = ''
  }
  update(center: { x: number; y: number }, zoom: number, graphics: Graphics, terrain: boolean) {
    const enabled = graphics.buildings && !graphics.performanceMode && zoom >= 14.2
    if (!enabled) { this.signature = ''; for (const mesh of this.meshes.values()) { mesh.count = 0; mesh.visible = false } return }
    const radius = graphics.quality === 'high' ? 1700 : 1200, maxBuildings = graphics.quality === 'high' ? 220 : 120
    const signature = `${this.revision}:${Math.round(center.x/120)}:${Math.round(center.y/120)}:${Math.round(zoom*2)}:${graphics.quality}:${terrain}`
    if (signature === this.signature) return
    this.signature = signature
    const buildings = [...this.features.values()].map(presetFromFeature).filter((value): value is NonNullable<typeof value> => !!value && Math.hypot(value.x-center.x,value.y-center.y)<=radius)
      .sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y)||a.preset.id.localeCompare(b.preset.id)).slice(0,maxBuildings)
    const counts = new Map<BuildingPartKind, number>()
    for (const building of buildings) {
      const layout = generateBuilding(building.preset), distance = Math.hypot(building.x - center.x, building.y - center.y), close = zoom >= 17 && distance <= 360
      for (const part of layout.parts) {
        if (part.lod === 'close' && !close) continue
        const renderKind: BuildingPartKind = part.kind === 'window' && !close ? 'window-flat' : part.kind, mesh = this.meshes.get(renderKind)!, index = counts.get(renderKind) || 0
        if (index >= BUILDING_PART_CAPACITY[renderKind]) continue
        applyBuildingPartTransform(this.dummy, part, { x: building.x, y: building.y, z: terrain ? building.elevation : 0 }, building.rotation)
        mesh.setMatrixAt(index, this.dummy.matrix); mesh.setColorAt(index, new T.Color(part.color)); if (renderKind === 'window') { const room = part.room || { type: 2, span: 1, offset: 0, seed: .5 }; (mesh.geometry.getAttribute('roomData') as T.InstancedBufferAttribute).setXYZW(index, room.type, room.span, room.offset, room.seed) } counts.set(renderKind, index + 1)
      }
    }
    for (const [kind, mesh] of this.meshes) { mesh.count = counts.get(kind) || 0; mesh.visible = mesh.count > 0; if (mesh.count) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; if (kind === 'window') (mesh.geometry.getAttribute('roomData') as T.InstancedBufferAttribute).needsUpdate = true } }
  }
  dispose() { for (const mesh of this.meshes.values()) { this.scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as T.Material).dispose(); mesh.dispose() } this.meshes.clear(); this.features.clear(); this.sectors.clear() }
}

