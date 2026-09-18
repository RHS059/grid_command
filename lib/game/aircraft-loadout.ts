import type { Role } from './types'

export type AircraftWeaponKind = 'rocket' | 'bomb'
export interface AircraftHardpoint { id: string; asset: 'rocket_pod' | 'bomb'; position: [number, number, number]; capacity: number }
export interface AircraftLoadoutState { remaining: Record<string, number>; cursor: number }
export interface AircraftRelease { hardpoint: string; kind: AircraftWeaponKind; round: number; position: [number, number, number] }

/** Vehicle-local metres, +Y forward and +Z up. Weapons own their mesh and texture. */
export const AIRCRAFT_HARDPOINTS: Partial<Record<Role, readonly AircraftHardpoint[]>> = {
  JET: [
    { id: 'bomb_L_0', asset: 'bomb', position: [-1.815, -1.65, .59], capacity: 1 },
    { id: 'bomb_L_1', asset: 'bomb', position: [-1.445, -1.65, .59], capacity: 1 },
    { id: 'pod_R_0', asset: 'rocket_pod', position: [1.445, -1.65, .59], capacity: 8 },
    { id: 'pod_R_1', asset: 'rocket_pod', position: [1.815, -1.65, .59], capacity: 8 },
  ],
}
export function createAircraftLoadout(role: Role): AircraftLoadoutState {
  return { remaining: Object.fromEntries((AIRCRAFT_HARDPOINTS[role] || []).map(p => [p.id, p.capacity])), cursor: 0 }
}
export function aircraftRounds(role: Role, state: AircraftLoadoutState, kind?: AircraftWeaponKind) {
  return (AIRCRAFT_HARDPOINTS[role] || []).filter(p => !kind || (p.asset === 'bomb' ? 'bomb' : 'rocket') === kind).reduce((sum, p) => sum + (state.remaining[p.id] || 0), 0)
}
export function aircraftAmmoPercent(role: Role, state: AircraftLoadoutState) {
  const points = AIRCRAFT_HARDPOINTS[role] || [], weight = (p: AircraftHardpoint) => p.asset === 'bomb' ? 4.5 : 1
  const capacity = points.reduce((sum, p) => sum + p.capacity * weight(p), 0)
  return capacity ? points.reduce((sum, p) => sum + (state.remaining[p.id] || 0) * weight(p), 0) / capacity * 100 : 0
}
export function rocketTube(round: number): [number, number, number] {
  const angle = (round % 8) * Math.PI / 4
  return [Math.cos(angle) * .09, .83, Math.sin(angle) * .09]
}
/** A command consumes one round. A pod itself can never be released. */
export function releaseAircraftWeapon(role: Role, state: AircraftLoadoutState, kind: AircraftWeaponKind): AircraftRelease | undefined {
  const points = (AIRCRAFT_HARDPOINTS[role] || []).filter(p => (p.asset === 'bomb' ? 'bomb' : 'rocket') === kind)
  if (!points.length) return
  for (let n = 0; n < points.length; n++) {
    const index = (state.cursor + n) % points.length, point = points[index], remaining = state.remaining[point.id] || 0
    if (remaining <= 0) continue
    const round = point.capacity - remaining, tube = kind === 'rocket' ? rocketTube(round) : [0, 0, 0]
    state.remaining[point.id] = remaining - 1; state.cursor = (index + 1) % points.length
    return { hardpoint: point.id, kind, round, position: point.position.map((v, i) => v + tube[i]) as [number, number, number] }
  }
}
