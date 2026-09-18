import * as T from './scene-data'
import { assetPath } from '../asset-path'
import type { Role } from './types'
import weapons from './generated/aircraft_weapons.json'
import { AIRCRAFT_HARDPOINTS, rocketTube, type AircraftLoadoutState } from './aircraft-loadout'

type WeaponPart = typeof weapons.bomb
type Decoder = (parts: WeaponPart[]) => T.BufferGeometry

/** One standard receiver and atlas per weapon family; the aircraft only owns mounts. */
export function attachAircraftWeapons(root: T.Object3D, role: Role, decode: Decoder) {
  const points = AIRCRAFT_HARDPOINTS[role]
  if (!points) return
  const material = new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .78, map: assetPath('/models/aircraft_weapons_albedo.png') })
  root.userData.materials.push(material)
  const geometries = { bomb: decode([weapons.bomb]), rocket_pod: decode([weapons.rocket_pod]), rocket: decode([weapons.rocket]) }
  root.userData.createWeaponProjectile = (kind: 'bomb' | 'rocket') => new T.Mesh(geometries[kind], material)
  for (const point of points) {
    const attachment = new T.Group(); attachment.name = point.id; attachment.position.set(...point.position)
    attachment.userData.weaponAttachment = true; attachment.userData.hardpoint = point.id
    const mesh = new T.Mesh(geometries[point.asset], material); mesh.name = point.id + '_weapon_mesh'; mesh.userData.weaponAttachment = true; attachment.add(mesh)
    if (point.asset === 'rocket_pod') for (let round = 0; round < point.capacity; round++) {
      const rocket = new T.Mesh(geometries.rocket, material); rocket.name = `${point.id}_round_${round}`
      rocket.userData.weaponAttachment = true; const [x, y, z] = rocketTube(round); rocket.position.set(x, y - .18, z); attachment.add(rocket)
    }
    root.add(attachment)
  }
}

export function createAircraftProjectile(root: T.Object3D | undefined, kind: 'bomb' | 'rocket'): T.Mesh | undefined {
  const mesh = root?.userData.createWeaponProjectile?.(kind) as T.Mesh | undefined
  if (mesh) mesh.name = 'aircraft-projectile-' + kind
  return mesh
}

/** Absolute sampling supports reverse scrubbing without changing game ammunition. */
export function poseAircraftWeapons(root: T.Object3D, clip: string, time: number) {
  const points = AIRCRAFT_HARDPOINTS[root.name as Role]
  if (!points) return
  let bomb = 0, pod = 0
  for (const point of points) {
    const object = root.getObjectByName(point.id); if (!object) continue
    object.position.set(...point.position); object.visible = true
    if (point.asset === 'bomb') {
      const age = time - (.4 + bomb++ * 1.2)
      if (clip === 'bombs' && age >= 0) { object.position.y += age * .6; object.position.z -= 4.9 * age * age; object.visible = age < 1.1 }
    } else {
      for (let round = 0; round < point.capacity; round++) {
        const rocket = root.getObjectByName(`${point.id}_round_${round}`)!; const [x, y, z] = rocketTube(round)
        rocket.position.set(x, y - .18, z); rocket.visible = true
        const age = time - (.2 + (round * 2 + pod) * .24)
        if ((clip === 'rockets' || clip === 'shoot') && age >= 0) { rocket.position.y += age * 8; rocket.visible = age < 1.0 }
      }
      pod++
    }
  }
}

/** Game state is authoritative; engine animation must never refill weapons. */
export function syncAircraftWeapons(root: T.Object3D, state?: AircraftLoadoutState) {
  if (!state) return
  for (const point of AIRCRAFT_HARDPOINTS[root.name as Role] || []) {
    const object = root.getObjectByName(point.id); if (!object) continue
    object.position.set(...point.position)
    const remaining = state.remaining[point.id] || 0
    object.visible = point.asset === 'rocket_pod' || remaining > 0
    if (point.asset === 'rocket_pod') for (let round = 0; round < point.capacity; round++) {
      const rocket = root.getObjectByName(`${point.id}_round_${round}`)!
      const [x, y, z] = rocketTube(round); rocket.position.set(x, y - .18, z); rocket.visible = round >= point.capacity - remaining
    }
  }
}
