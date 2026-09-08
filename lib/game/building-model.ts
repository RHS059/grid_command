import * as T from 'three'
import { generateBuilding, type BuildingPart, type BuildingPartKind, type BuildingPreset } from './building-system'

export const BUILDING_PART_CAPACITY: Record<BuildingPartKind, number> = {
  wall: 18000, window: 18000, door: 2000, floor: 6000, roof: 5000,
  trim: 26000, accent: 18000, awning: 3000, rooftop: 1500,
}

export function applyBuildingPartTransform(target: T.Object3D, item: BuildingPart, origin = { x: 0, y: 0, z: 0 }, buildingRotation = 0) {
  const cos = Math.cos(buildingRotation), sin = Math.sin(buildingRotation)
  target.position.set(origin.x + item.x * cos - item.y * sin, origin.y + item.x * sin + item.y * cos, origin.z + item.z)
  target.rotation.set(item.tilt || 0, 0, buildingRotation + item.rotation)
  target.scale.set(item.width, item.primitive === 'vertical-plane' ? 1 : item.depth, item.primitive === 'horizontal-plane' ? 1 : item.height)
  target.updateMatrix()
  return target
}

export function buildingGeometry(kind: BuildingPartKind) {
  if (['wall', 'window', 'door', 'trim'].includes(kind)) { const geometry = new T.PlaneGeometry(1, 1); geometry.rotateX(Math.PI / 2); return geometry }
  if (kind === 'floor' || kind === 'roof') return new T.PlaneGeometry(1, 1)
  return new T.BoxGeometry(1, 1, 1)
}

const materialFor = (kind: BuildingPartKind, color: string, material: string) => new T.MeshStandardMaterial({
  color,
  flatShading: true,
  roughness: material.includes('glass') ? .18 : material.includes('metal') || material.includes('steel') || material.includes('panel') || material.includes('seam') ? .48 : material.includes('brick') || material.includes('shingle') ? .94 : kind === 'roof' ? .72 : .86,
  metalness: material.includes('glass') ? .24 : material.includes('metal') || material.includes('steel') || material.includes('panel') || material.includes('seam') ? .42 : .03,
  emissive: kind === 'window' ? new T.Color(color).multiplyScalar(.08) : new T.Color('#000000'),
})

export function createBuildingModel(preset: BuildingPreset) {
  const group = new T.Group(), geometries = new Map<BuildingPartKind, T.BufferGeometry>(), materials = new Map<string, T.MeshStandardMaterial>()
  group.name = `building:${preset.id}`
  for (const item of generateBuilding(preset).parts) {
    let geometry = geometries.get(item.kind); if (!geometry) { geometry = buildingGeometry(item.kind); geometries.set(item.kind, geometry) }
    const materialKey = `${item.kind}:${item.material}:${item.color}`; let material = materials.get(materialKey); if (!material) { material = materialFor(item.kind, item.color, item.material); materials.set(materialKey, material) }
    const mesh = new T.Mesh(geometry, material)
    mesh.name = item.id
    mesh.userData.buildingPart = item
    applyBuildingPartTransform(mesh, item)
    group.add(mesh)
  }
  group.userData.geometries = [...geometries.values()]
  group.userData.materials = [...materials.values()]
  return group
}

export function disposeBuildingModel(group: T.Group) {
  for (const material of group.userData.materials || []) if (material instanceof T.Material) material.dispose()
  for (const geometry of group.userData.geometries || []) if (geometry instanceof T.BufferGeometry) geometry.dispose()
}

