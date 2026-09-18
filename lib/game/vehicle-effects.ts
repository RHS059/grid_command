import * as T from './scene-data'
import type { Role, Side } from './types'

type Point = [number, number, number]
export interface VehicleEffectAttachments {
  sensor?: { position: Point; tilt: number; radius: number }
  exhaust?: { position: Point; radius: number; aspect: number; length: number }
}

/** Attachment coordinates follow the source mesh: +Y forward, +Z up. */
export const VEHICLE_EFFECT_ATTACHMENTS: Partial<Record<Role, VehicleEffectAttachments>> = {
  JET: {
    // Centre of the inclined front window, just clear of its surface.
    sensor: { position: [0, 3.597, 1.852], tilt: -Math.atan(.7), radius: .031 },
    exhaust: { position: [0, -5.625, (630 - 394) * 10.8 / (1768 - 111)], radius: .285, aspect: .66, length: 1.8 },
  },
}
export const VEHICLE_SENSOR_COLOR: Record<Side, string> = { BLU: '#82d8ff', RED: '#ff7548' }
const ENGINE_CLIPS = new Set(['fly', 'shoot', 'rockets', 'bombs'])

interface Effects {
  sensor?: T.Group
  exhaust?: T.Group
  core?: T.Mesh
  haze?: T.Mesh
}

function effectMesh(name: string, geometry: T.BufferGeometry, material: T.Material, root: T.Object3D) {
  const mesh = new T.Mesh(geometry, material)
  mesh.name = `vehicle-fx-${name}`
  mesh.userData.vehicleEffect = true
  mesh.castShadow = false
  mesh.receiveShadow = false
  root.add(mesh)
  return mesh
}

/** Four small meshes per aircraft; no particles, lights or per-frame allocations. */
export function attachVehicleEffects(root: T.Object3D, role: Role, side: Side, attachments = VEHICLE_EFFECT_ATTACHMENTS[role]) {
  if (!attachments || root.userData.vehicleEffects) return
  const effects: Effects = {}
  if (attachments.sensor) {
    const { position, tilt, radius } = attachments.sensor
    const sensor = new T.Group(); sensor.name = 'vehicle-fx-sensor'; sensor.position.set(...position); sensor.rotation.x = tilt
    sensor.userData.vehicleEffect = true; root.add(sensor); effects.sensor = sensor
    const tint = VEHICLE_SENSOR_COLOR[side]
    effectMesh('sensor-lens', new T.CircleGeometry(radius, 16), new T.MeshBasicMaterial({ color: tint, emissive: tint, emissiveIntensity: .45, side: T.DoubleSide }), sensor)
    effectMesh('sensor-glow', new T.RingGeometry(radius, radius * 1.65, 16), new T.MeshBasicMaterial({ color: tint, transparent: true, opacity: .2, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), sensor)
  }
  if (attachments.exhaust) {
    const { position, radius, aspect, length } = attachments.exhaust
    const exhaust = new T.Group(); exhaust.name = 'vehicle-fx-exhaust'; exhaust.position.set(...position)
    exhaust.scale.z = aspect; exhaust.userData.vehicleEffect = true; root.add(exhaust); effects.exhaust = exhaust
    // Lathe rings run aft along -Y and taper to a point. The base stays inside the nozzle.
    const plume = (r: number, l: number) => new T.LatheGeometry([
      new T.Vector2(r, 0), new T.Vector2(r * .85, -l * .22),
      new T.Vector2(r * .42, -l * .62), new T.Vector2(0, -l),
    ], 12)
    effects.core = effectMesh('exhaust-core', plume(radius * .7, length * .65), new T.MeshBasicMaterial({ color: '#a7d9ff', transparent: true, opacity: .4, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), exhaust)
    effects.haze = effectMesh('exhaust-haze', plume(radius, length), new T.MeshBasicMaterial({ color: '#8c91c8', transparent: true, opacity: .12, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), exhaust)
  }
  root.userData.vehicleEffects = effects
  updateVehicleEffects(root, 'idle', 0)
}

/** Absolute time makes viewer scrubbing and restart repeatable. */
export function updateVehicleEffects(root: T.Object3D, clip: string, time: number, engineActive?: boolean) {
  const effects = root.userData.vehicleEffects as Effects | undefined
  if (!effects) return
  const destroyed = root.userData.destroyed === true
  if (effects.sensor) effects.sensor.visible = !destroyed
  if (!effects.exhaust) return
  effects.exhaust.visible = !destroyed && (engineActive ?? ENGINE_CLIPS.has(clip))
  if (!effects.exhaust.visible) return
  const pulse = Math.sin(time * 31) * .035 + Math.sin(time * 47) * .02
  if (effects.core) {
    effects.core.scale.y = 1 + pulse
    const material = effects.core.material as T.Material
    material.opacity = .4 + pulse
  }
  if (effects.haze) {
    effects.haze.scale.y = 1 - pulse * .7
    const material = effects.haze.material as T.Material
    material.opacity = .14 + pulse * .35
  }
}
