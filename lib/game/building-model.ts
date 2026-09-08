import * as T from './scene-data'
import { generateBuilding, type BuildingPart, type BuildingPartKind, type BuildingPreset } from './building-system'
import { createInteriorWindowMaterial } from './interior-window-material'
import { createWireSpriteMaterial } from './building-detail-material'

const X_AXIS = new T.Vector3(1, 0, 0), Y_AXIS = new T.Vector3(0, 1, 0), Z_AXIS = new T.Vector3(0, 0, 1), PART_TILT = new T.Quaternion(), PART_ROLL = new T.Quaternion()

export const BUILDING_PART_CAPACITY: Record<BuildingPartKind, number> = {
  wall: 120000, gable: 12000, window: 40000, 'window-flat': 120000, 'window-frame': 40000, door: 16000, floor: 80000, roof: 80000,
  trim: 120000, accent: 120000, awning: 24000, rooftop: 12000, 'detail-box': 40000, 'detail-cylinder': 24000, 'detail-dome': 4000, 'detail-cooling-tower': 4000, 'detail-plane': 24000, wire: 40000,
}

export function applyBuildingPartTransform(target: T.Object3D, item: BuildingPart, origin = { x: 0, y: 0, z: 0 }, buildingRotation = 0) {
  const cos = Math.cos(buildingRotation), sin = Math.sin(buildingRotation)
  target.position.set(origin.x + item.x * cos - item.y * sin, origin.y + item.x * sin + item.y * cos, origin.z + item.z)
  target.quaternion.setFromAxisAngle(Z_AXIS, buildingRotation + item.rotation)
  if (item.tilt) target.quaternion.multiply(PART_TILT.setFromAxisAngle(X_AXIS, item.tilt))
  if (item.roll) target.quaternion.multiply(PART_ROLL.setFromAxisAngle(Y_AXIS, item.roll))
  target.scale.set(item.width, item.primitive === 'vertical-plane' || item.primitive === 'triangle-plane' ? 1 : item.depth, item.primitive === 'horizontal-plane' ? 1 : item.height)
  target.updateMatrix()
  return target
}

export function buildingGeometry(kind: BuildingPartKind) {
  if (kind === 'wall' || kind === 'window' || kind === 'window-flat' || kind === 'detail-plane') { const geometry = new T.PlaneGeometry(1, 1); geometry.rotateX(Math.PI / 2); return geometry }
  if (kind === 'wire') { const geometry = new T.PlaneGeometry(1, 1); geometry.rotateX(Math.PI / 2); return geometry }
  if (kind === 'detail-cylinder') { const geometry = new T.CylinderGeometry(.5, .5, 1, 8, 1); geometry.rotateX(Math.PI / 2); return geometry }
  if (kind === 'detail-dome') { const geometry = new T.SphereGeometry(.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); geometry.rotateX(Math.PI / 2); return geometry }
  if (kind === 'detail-cooling-tower') { const geometry = new T.LatheGeometry([new T.Vector2(.5, -.5), new T.Vector2(.43, -.28), new T.Vector2(.3, .22), new T.Vector2(.35, .5)], 12); geometry.rotateX(Math.PI / 2); return geometry }
  if (kind === 'window-frame') {
    const shape = new T.Shape(); shape.moveTo(-.5, -.5); shape.lineTo(.5, -.5); shape.lineTo(.5, .5); shape.lineTo(-.5, .5); shape.closePath()
    const opening = new T.Path(); opening.moveTo(-.41, -.41); opening.lineTo(-.41, .41); opening.lineTo(.41, .41); opening.lineTo(.41, -.41); opening.closePath(); shape.holes.push(opening)
    const geometry = new T.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 1 }); geometry.translate(0, 0, -.5); geometry.rotateX(Math.PI / 2); return geometry
  }
  if (kind === 'gable') { const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute([-.5, 0, -1/3, .5, 0, -1/3, 0, 0, 2/3], 3)); geometry.setIndex([0, 1, 2]); geometry.computeVertexNormals(); return geometry }
  if (kind === 'floor') return new T.PlaneGeometry(1, 1)
  return new T.BoxGeometry(1, 1, 1)
}

const materialFor = (kind: BuildingPartKind, color: string, material: string) => new T.MeshStandardMaterial({
  color,
  flatShading: true,
  roughness: material.includes('glass') ? .18 : material.includes('metal') || material.includes('steel') || material.includes('panel') || material.includes('seam') ? .48 : material.includes('brick') || material.includes('shingle') ? .94 : kind === 'roof' ? .72 : .86,
  metalness: material.includes('glass') ? .24 : material.includes('metal') || material.includes('steel') || material.includes('panel') || material.includes('seam') ? .42 : .03,
  emissive: kind === 'window' ? new T.Color(color).multiplyScalar(.08) : new T.Color('#000000'),
  transparent: material.includes('glass'),
  opacity: material.includes('glass') ? .88 : 1,
  side: kind === 'gable' ? T.DoubleSide : T.FrontSide,
})

export function createBuildingModel(preset: BuildingPreset) {
  const group = new T.Group(), geometries = new Map<BuildingPartKind, T.BufferGeometry>(), materials = new Map<string, T.Material>()
  group.name = `building:${preset.id}`
  for (const item of generateBuilding(preset).parts) {
    let geometry = geometries.get(item.kind); if (!geometry) { geometry = buildingGeometry(item.kind); geometries.set(item.kind, geometry) }
    const roomKey = item.room ? `:${item.room.type}:${item.room.span}:${item.room.offset}:${item.room.seed}` : '', materialKey = `${item.kind}:${item.material}:${item.color}${roomKey}`; let material = materials.get(materialKey); if (!material) { material = item.kind === 'window' ? createInteriorWindowMaterial(item.color, false, item.room) : item.kind === 'wire' ? createWireSpriteMaterial(item.color) : materialFor(item.kind, item.color, item.material); materials.set(materialKey, material) }
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

