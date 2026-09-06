import { isAir, isVehicle, type BattleState, type Point, type Unit } from './types'

export const angleBetween = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const mix = (a: number, b: number, t: number) => a + (b - a) * t

export class DisplayPoses {
  private previous?: BattleState
  private current?: BattleState
  private arrival = 0
  private interval = 50
  sample(snapshot: BattleState, now: number): BattleState {
    if (snapshot !== this.current) {
      const reset = !this.current || snapshot.tick <= this.current.tick || now - this.arrival > 250 || snapshot.paused || snapshot.speed !== this.current.speed
      this.previous = reset ? snapshot : this.current
      this.interval = reset ? 50 : Math.max(16, Math.min(100, now - this.arrival))
      this.current = snapshot
      this.arrival = now
    }
    if (snapshot.paused || !this.previous || this.previous === snapshot) return snapshot
    const t = Math.min(1, Math.max(0, (now - this.arrival) / this.interval))
    const old = new Map(this.previous.units.map(u => [u.id, u]))
    return { ...snapshot, units: snapshot.units.map(u => {
      const p = old.get(u.id)
      if (!p || u.hp <= 0 || u.carrier !== p.carrier) return u
      const soldiers = new Map(p.soldiers?.map(s => [s.id, s]))
      return { ...u, x: mix(p.x, u.x, t), y: mix(p.y, u.y, t), altitude: mix(p.altitude || 0, u.altitude || 0, t), heading: p.heading + angleBetween(p.heading, u.heading) * t,
        soldiers: u.soldiers?.map(s => { const b = soldiers.get(s.id); return !b || s.status !== b.status ? s : { ...s, x: mix(b.x, s.x, t), y: mix(b.y, s.y, t), heading: b.heading + angleBetween(b.heading, s.heading) * t } }) }
    }) }
  }
}

export function followSubject(state: BattleState, selected: string | null) {
  let unit = state.units.find(u => u.id === selected && u.hp > 0)
  if (unit?.carrier) unit = state.units.find(u => u.id === unit?.carrier && u.hp > 0)
  if (!unit) return null
  const soldier = unit.soldiers?.find(s => s.status === 'active')
  return { unit, point: soldier || unit, heading: soldier?.heading ?? unit.heading }
}

export function chaseView(unit: Unit, point: Point, heading: number, scale: number, ground: (p: Point) => number) {
  const air = isAir(unit.role), vehicle = isVehicle(unit.role)
  const distance = (air ? unit.role === 'CARGO_PLANE' ? 110 : (unit.role === 'JET' || unit.role === 'CAS_FIGHTER') ? 65 : 40 : vehicle ? 15 : 6) * scale
  const shoulder = vehicle ? 0 : 1.1 * scale
  const target = { x: point.x + Math.sin(heading) * (vehicle ? 2 : 1), y: point.y + Math.cos(heading) * (vehicle ? 2 : 1) }
  const from = { x: point.x - Math.sin(heading) * distance + Math.cos(heading) * shoulder, y: point.y - Math.cos(heading) * distance - Math.sin(heading) * shoulder }
  const targetZ = ground(point) + (unit.altitude || 0) + (vehicle ? 2 : 1.4)
  const fromZ = Math.max(ground(from) + 2, targetZ + distance * .42)
  return { from, fromZ, to: target, toZ: targetZ, target, targetZ }
}
