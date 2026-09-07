import * as T from 'three'
import { SIDE_COLOR, type Objective } from './types'
import { objectiveFacilityPoint } from './objective-logistics'

export const objectiveFacilitySignature = (objective: Objective) => {
  const pad = objective.facilities.helipad, bay = objective.facilities.vehicleBay
  return `${objective.owner}-${pad ? `${Math.floor(pad.hp / 10)}-${!!pad.construction}` : 'x'}-${bay ? `${Math.floor(bay.hp / 10)}-${!!bay.construction}` : 'x'}`
}
export function createObjectiveFacilities(objective: Objective) {
  const root = new T.Group(); root.name = `objective-${objective.id}`
  const color = objective.owner ? SIDE_COLOR[objective.owner] : '#87919a'
  const material = (value: string | number, opacity = 1) => new T.MeshStandardMaterial({ color: value, roughness: .82, metalness: .12, transparent: opacity < 1, opacity })
  const add = (geometry: T.BufferGeometry, x: number, y: number, z: number, mat: T.Material) => { const mesh = new T.Mesh(geometry, mat); mesh.position.set(x - objective.x, y - objective.y, z); root.add(mesh) }
  const pad = objective.facilities.helipad
  if (pad) {
    const p = objectiveFacilityPoint(objective, 'helipad'), opacity = pad.construction ? .4 : pad.hp < 40 ? .55 : 1
    add(new T.CylinderGeometry(13, 13, .7, 36).rotateX(Math.PI / 2), p.x, p.y, .4, material(pad.hp < 40 ? '#343a3d' : '#596268', opacity))
    add(new T.RingGeometry(10.6, 11.3, 36), p.x, p.y, .78, material(color, opacity))
    add(new T.BoxGeometry(2, 12, .18), p.x - 3.7, p.y, .88, material(color, opacity)); add(new T.BoxGeometry(2, 12, .18), p.x + 3.7, p.y, .88, material(color, opacity)); add(new T.BoxGeometry(7.5, 2, .18), p.x, p.y, .88, material(color, opacity))
  }
  const bay = objective.facilities.vehicleBay
  if (bay) {
    const p = objectiveFacilityPoint(objective, 'vehicleBay'), opacity = bay.construction ? .4 : bay.hp < 40 ? .55 : 1, wall = material(bay.hp < 40 ? '#343a3d' : '#4b574d', opacity)
    add(new T.BoxGeometry(25, 22, .7), p.x, p.y, .4, material('#555d60', opacity)); add(new T.BoxGeometry(25, 3, 8), p.x, p.y + 9.5, 4.4, wall)
    add(new T.BoxGeometry(3, 19, 8), p.x - 11, p.y, 4.4, wall); add(new T.BoxGeometry(3, 19, 8), p.x + 11, p.y, 4.4, wall)
    add(new T.BoxGeometry(25, 22, 1), p.x, p.y, 8.8, wall); add(new T.BoxGeometry(15, .5, 6.5), p.x, p.y - 9.7, 4, material(color, opacity))
  }
  root.userData.signature = objectiveFacilitySignature(objective)
  return root
}

