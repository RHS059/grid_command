import * as T from './scene-data'
import { decodeVehicleGeometry, type PackedVehiclePart } from './blender-vehicles'
import { assetPath } from '../asset-path'
import type { Role, Side } from './types'
import type { BreakupEvent, BreakupSectionDefinition } from './vehicle-breakup'
import fighterBreakup from './generated/fighter_breakup.json'

interface SectionAsset {
  id: string
  pivot: number[]
  massFraction: number
  collider: { halfExtents: number[] }
  detachThreshold: number
  geometry: PackedVehiclePart
}
interface Template { definitions: BreakupSectionDefinition[]; root: T.Group }
interface Visual { root: T.Group; pieces: Map<string, T.Object3D>; key: string }
const vector = (v: number[]) => ({ x: v[0], y: v[1], z: v[2] })

// These logical regions are declared before destruction. Legacy vehicles use grouped
// source faces plus a closed internal core; the FQ-44 uses offline capped fracture meshes.
const REGIONS = {
  air: [ ['nose', 0, .7, 0], ['center', 0, 0, 0], ['engine', 0, -.45, 0], ['tail', 0, -.85, .3], ['wing_L', -.7, 0, 0], ['wing_R', .7, 0, 0], ['gear_L', -.2, -.1, -.8], ['gear_R', .2, -.1, -.8] ],
  ground: [ ['front-hull', 0, .7, -.1], ['rear-hull', 0, -.7, -.1], ['turret', 0, 0, .75], ['engine', 0, -.35, .25], ['left-front', -.8, .55, -.5], ['right-front', .8, .55, -.5], ['left-rear', -.8, -.55, -.5], ['right-rear', .8, -.55, -.5] ],
} as const

function authoredFighter(): Template {
  const root = new T.Group(), definitions: BreakupSectionDefinition[] = []
  const material = new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .95, map: assetPath('/models/fighter_albedo.png') })
  for (const section of fighterBreakup.sections as SectionAsset[]) {
    const geometry = decodeVehicleGeometry([section.geometry]); geometry.translate(-section.pivot[0], -section.pivot[1], -section.pivot[2])
    const piece = new T.Mesh(geometry, material); piece.name = section.id; root.add(piece)
    definitions.push({ id: section.id, center: vector(section.pivot), halfExtents: vector(section.collider.halfExtents), mass: section.massFraction * 100, detachThreshold: section.detachThreshold })
  }
  return { definitions, root }
}

function legacySections(source: T.Object3D, role: Role): Template {
  const root = new T.Group(), definitions: BreakupSectionDefinition[] = []
  // Work in vehicle local space without modifying its live pose or animation hierarchy.
  source.updateMatrixWorld(true)
  const inverse = source.matrixWorld.clone().invert(), bounds = new T.Box3()
  const sources: { geometry: T.BufferGeometry; material: T.Material }[] = []
  const excluded = (node: T.Object3D) => {
    for (let parent: T.Object3D | null = node; parent && parent !== source; parent = parent.parent) if (!parent.visible || parent.userData.vehicleEffect || /flash|occupant|soldier|seat/i.test(parent.name)) return true
    return false
  }
  source.traverse(node => {
    if (!(node instanceof T.Mesh) || node instanceof T.InstancedMesh || excluded(node)) return
    const geometry = node.geometry.toNonIndexed().applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, node.matrixWorld))
    const positions = geometry.getAttribute('position')
    for (let index = 0; positions && index < positions.count; index++) bounds.expandByPoint(new T.Vector3().fromBufferAttribute(positions, index))
    sources.push({ geometry, material: Array.isArray(node.material) ? node.material[0] : node.material })
  })
  const center = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3()).multiplyScalar(.5)
  const regions = ['JET', 'CAS_FIGHTER', 'ATTACK_HELI', 'TRANSPORT_HELI', 'HEAVY_LIFT_HELI', 'CARGO_PLANE', 'RECON_UAV'].includes(role) ? REGIONS.air : REGIONS.ground
  const groups = regions.map(region => ({ id: region[0], center: new T.Vector3(center.x + region[1] * size.x, center.y + region[2] * size.y, center.z + region[3] * size.z), root: new T.Group(), bounds: new T.Box3() }))
  const materials = new Map<T.Material, T.Material>()
  for (const sourceMesh of sources) {
    const geometry = sourceMesh.geometry, positions = geometry.getAttribute('position'), values = groups.map(() => new Map<string, number[]>())
    for (let triangle = 0; triangle < positions.count; triangle += 3) {
      const centroid = new T.Vector3()
      for (let vertex = 0; vertex < 3; vertex++) centroid.add(new T.Vector3().fromBufferAttribute(positions, triangle + vertex))
      centroid.multiplyScalar(1 / 3)
      let selected = 0, nearest = Infinity
      groups.forEach((group, index) => {
        const distance = ((centroid.x - group.center.x) / Math.max(.1, size.x)) ** 2 + ((centroid.y - group.center.y) / Math.max(.1, size.y)) ** 2 + ((centroid.z - group.center.z) / Math.max(.1, size.z)) ** 2
        if (distance < nearest) { selected = index; nearest = distance }
      })
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        let output = values[selected].get(name)
        if (!output) { output = []; values[selected].set(name, output) }
        for (let component = triangle * attribute.itemSize; component < (triangle + 3) * attribute.itemSize; component++) output.push(attribute.array[component])
      }
      for (let vertex = 0; vertex < 3; vertex++) groups[selected].bounds.expandByPoint(new T.Vector3().fromBufferAttribute(positions, triangle + vertex))
    }
    let material = materials.get(sourceMesh.material)
    if (!material) { material = sourceMesh.material.clone(); materials.set(sourceMesh.material, material) }
    values.forEach((attributes, index) => {
      if (!attributes.size) return
      const part = new T.BufferGeometry()
      for (const [name, data] of attributes) part.setAttribute(name, new T.Float32BufferAttribute(data, geometry.attributes[name].itemSize))
      groups[index].root.add(new T.Mesh(part, material!))
    })
    geometry.dispose()
  }
  const interior = new T.MeshStandardMaterial({ color: '#26231e', roughness: 1, metalness: .25 })
  for (const group of groups) {
    // A section is one rigid body. Keep material boundaries, but do not retain
    // every source track link/trim object as another draw mesh on that body.
    const byMaterial = new Map<T.Material, T.Mesh[]>()
    for (const child of group.root.children) if (child instanceof T.Mesh) {
      const material = child.material as T.Material, parts = byMaterial.get(material) || []
      parts.push(child); byMaterial.set(material, parts)
    }
    for (const [material, parts] of byMaterial) if (parts.length > 1) {
      const geometry = T.mergeGeometries(parts.map(part => part.geometry))
      group.root.remove(...parts)
      for (const part of parts) part.geometry.dispose()
      group.root.add(new T.Mesh(geometry, material))
    }
    const pivot = group.bounds.isEmpty() ? group.center : group.bounds.getCenter(new T.Vector3())
    const half = group.bounds.isEmpty() ? new T.Vector3(.1, .1, .1) : group.bounds.getSize(new T.Vector3()).multiplyScalar(.5)
    group.root.traverse(node => { if (node instanceof T.Mesh) node.geometry.translate(-pivot.x, -pivot.y, -pivot.z) })
    // A closed charred core gives the legacy grouped-face asset an interior at tears.
    group.root.add(new T.Mesh(new T.BoxGeometry(Math.max(.1, half.x * 1.3), Math.max(.1, half.y * 1.3), Math.max(.1, half.z * 1.3)), interior))
    group.root.name = group.id; root.add(group.root)
    definitions.push({ id: group.id, center: { x: pivot.x, y: pivot.y, z: pivot.z }, halfExtents: { x: Math.max(.05, half.x), y: Math.max(.05, half.y), z: Math.max(.05, half.z) }, mass: Math.max(.1, half.x * half.y * half.z), detachThreshold: .35 })
  }
  return { root, definitions }
}

/** Geometry is cached per vehicle type; event visuals share it and are pooled on expiry. */
export class VehicleBreakupModels {
  private templates = new Map<string, Template>()
  private visuals = new Map<string, Visual>()
  private pool: Visual[] = []
  constructor(private readonly scene: T.Scene) {}
  prepare(role: Role, side: Side, source: T.Object3D) {
    const key = `${role}-${side}`
    let template = this.templates.get(key)
    if (!template) { template = role === 'JET' ? authoredFighter() : legacySections(source, role); this.templates.set(key, template) }
    return template.definitions
  }
  attach(event: BreakupEvent, role: Role, side: Side) {
    const key = `${role}-${side}`, template = this.templates.get(key)
    if (!template || this.visuals.has(event.id)) return
    const index = this.pool.findIndex(visual => visual.key === key)
    const visual = index >= 0 ? this.pool.splice(index, 1)[0] : { root: template.root.clone() as T.Group, pieces: new Map<string, T.Object3D>(), key }
    visual.root.name = `vehicle-breakup-${event.id}`
    visual.root.userData.unitSurface = true
    visual.root.userData.destroyed = true
    visual.root.userData.vehicleDamage = { damage: 1, destruction: .12, heat: .35, seed: event.seed % 1000 }
    for (const piece of visual.root.children) visual.pieces.set(piece.name, piece)
    this.visuals.set(event.id, visual); this.scene.add(visual.root)
    this.sync(event, true)
  }
  sync(event: BreakupEvent, visible: boolean, shadows = true) {
    const visual = this.visuals.get(event.id)
    if (!visual) return
    visual.root.visible = visible
    visual.root.userData.intactColliderEnabled = event.intactColliderEnabled
    for (const state of event.sections) {
      const piece = visual.pieces.get(state.id)
      if (!piece) continue
      piece.position.copy(state.position); piece.rotation.copy(state.rotation)
      piece.visible = state.phase !== 'removed'
      piece.userData.vehicleCollider = { enabled: state.colliderEnabled || event.intactColliderEnabled, halfExtents: state.halfExtents, phase: state.phase }
      piece.traverse(node => { node.userData.disableShadow = !shadows || state.phase === 'static'; node.userData.vehicleBreakupPiece = true })
    }
  }
  retain(events: ReadonlyMap<string, BreakupEvent>) {
    for (const [id, visual] of this.visuals) if (!events.has(id)) {
      this.scene.remove(visual.root); this.visuals.delete(id)
      if (this.pool.length < 16) this.pool.push(visual)
    }
  }
  dispose() {
    for (const visual of this.visuals.values()) this.scene.remove(visual.root)
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>()
    for (const template of this.templates.values()) template.root.traverse(node => { if (node instanceof T.Mesh) { geometries.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material) } })
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
    this.visuals.clear(); this.templates.clear(); this.pool.length = 0
  }
}
