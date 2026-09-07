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
  target.scale.set(item.width, item.depth, item.height)
  target.updateMatrix()
  return target
}

const materialFor = (kind: BuildingPartKind, color: string) => new T.MeshStandardMaterial({
  color,
  flatShading: true,
  roughness: kind === 'window' ? .2 : kind === 'roof' ? .72 : .86,
  metalness: kind === 'window' ? .22 : kind === 'accent' || kind === 'rooftop' ? .14 : .03,
  emissive: kind === 'window' ? new T.Color(color).multiplyScalar(.08) : new T.Color('#000000'),
})

export function createBuildingModel(preset: BuildingPreset) {
  const group = new T.Group(), geometry = new T.BoxGeometry(1, 1, 1)
  group.name = `building:${preset.id}`
  for (const item of generateBuilding(preset).parts) {
    const mesh = new T.Mesh(geometry, materialFor(item.kind, item.color))
    mesh.name = item.id
    mesh.userData.buildingPart = item
    applyBuildingPartTransform(mesh, item)
    group.add(mesh)
  }
  group.userData.sharedGeometry = geometry
  return group
}

export function disposeBuildingModel(group: T.Group) {
  group.traverse(object => { if (object instanceof T.Mesh) (object.material as T.Material).dispose() })
  const geometry = group.userData.sharedGeometry
  if (geometry instanceof T.BufferGeometry) geometry.dispose()
}

