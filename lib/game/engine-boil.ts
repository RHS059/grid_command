import * as T from './scene-data'

/** Ground motor vehicles only; static generators and amphibious/naval craft are excluded. */
export const hasEngineBoil = (role: string) => ['TANK','APC','CANNON_APC','IFV','TRUCK','TROOP_TRUCK','FORKLIFT','FUEL_TRUCK','TROOP_HEMTT','MEDICAL_HEMTT','REPAIR_HEMTT','FOB_HEMTT'].includes(role)

export class EngineBoil {
  private previous?: number
  private strength = 0
  private phase: number
  constructor(readonly role: string, id: string) {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 65521
    this.phase = (hash * 40503 % 65521) / 65521 * Math.PI * 2
  }
  sample(time: number, powered: boolean, moving = false, alive = true, length = 8) {
    const dt = Math.max(0, Math.min(.1, time - (this.previous ?? time)))
    this.previous = time
    const target = powered && alive && hasEngineBoil(this.role) ? moving ? .35 : 1 : 0
    this.strength += (target - this.strength) * (1 - Math.exp(-dt * 9))
    // Wrecks and unsupported roles must never inherit a residual running pose.
    if (!alive || !hasEngineBoil(this.role) || this.strength < .00001) this.strength = 0
    const p = this.phase, t = time * Math.PI * 2
    const wave = (a: number, b: number, phase: number) => .72 * Math.sin(t * a + phase) + .28 * Math.sin(t * b + phase * 1.7)
    const amount = this.strength, distance = Math.min(12, length) * .00035 * amount
    return {
      position: new T.Vector3(wave(7.3,10.7,p) * distance * .3, wave(8.1,11.3,p+1) * distance * .2, wave(8.7,10.1,p+2) * distance),
      rotation: new T.Vector3(wave(7.7,10.9,p+3) * .00035 * amount, wave(8.3,11.1,p+4) * .0003 * amount, wave(7.1,9.7,p+5) * .00012 * amount),
    }
  }
}

/** Call only on a fresh base transform, or on a dedicated identity wrapper. */
export function applyEngineBoil(root: T.Object3D, pose: ReturnType<EngineBoil['sample']>) {
  root.position.add(pose.position)
  // scene-data keeps Euler/quaternion state separately. Refresh the base even
  // when its Euler values match the preceding frame, then append the local shake.
  root.updateMatrix()
  root.quaternion.setFromEuler(root.rotation).multiply(new T.Quaternion().setFromEuler(pose.rotation))
}
