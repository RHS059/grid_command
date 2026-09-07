import { type BattleState, type ContactMemory, type Point, type Side, type Unit } from './types'

const CELL = 500
export const CONTACT_MEMORY_SECONDS = 18
const key = (p: Point) => `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`

export class Perception {
  private cells = new Map<string, Unit[]>()
  private visible: Record<Side, Set<string>> = { BLU: new Set(), RED: new Set() }

  rebuild(state: BattleState) {
    this.cells.clear()
    for (const unit of state.units.filter(u => u.hp > 0 && !u.carrier).sort((a, b) => a.id.localeCompare(b.id))) {
      const k = key(unit)
      if (!this.cells.has(k)) this.cells.set(k, [])
      this.cells.get(k)!.push(unit)
    }
  }

  units(point: Point, range: number, predicate?: (unit: Unit) => boolean) {
    const result: Unit[] = [], radius = Math.ceil(range / CELL)
    const cx = Math.floor(point.x / CELL), cy = Math.floor(point.y / CELL)
    for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
      for (const unit of this.cells.get(`${x},${y}`) || []) {
        if ((!predicate || predicate(unit)) && Math.hypot(unit.x - point.x, unit.y - point.y) <= range) result.push(unit)
      }
    }
    return result.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y) || a.id.localeCompare(b.id))
  }

  enemies(side: Side, point: Point, range: number) {
    return this.units(point, range, unit => unit.side !== side)
  }

  update(state: BattleState, sees: (observer: Unit, target: Unit) => boolean) {
    this.rebuild(state)
    state.contacts ??= { BLU: [], RED: [] }
    this.visible = { BLU: new Set(), RED: new Set() }
    const observers = new Map<string, string[]>(), living = state.units.filter(u => u.hp > 0 && !u.carrier).sort((a, b) => a.id.localeCompare(b.id)), byId = new Map(living.map(unit => [unit.id, unit]))
    for (const observer of living) {
      for (const target of this.enemies(observer.side, observer, 2500)) {
        if (!sees(observer, target)) continue
        this.visible[observer.side].add(target.id)
        const observation = `${observer.side}:${target.id}`
        const list = observers.get(observation) || []
        list.push(observer.id); observers.set(observation, list)
      }
    }
    for (const side of ['BLU', 'RED'] as Side[]) {
      const old = new Map((state.contacts[side] || []).map(contact => [contact.unitId, contact]))
      for (const id of this.visible[side]) {
        const unit = byId.get(id)
        if (!unit) continue
        old.set(id, { unitId: id, role: unit.role, position: { x: unit.x, y: unit.y }, lastSeen: state.time, confidence: 1,
          observers: (observers.get(`${side}:${id}`) || []).sort() })
      }
      const contacts: ContactMemory[] = []
      for (const contact of old.values()) {
        const age = state.time - contact.lastSeen
        if (age > CONTACT_MEMORY_SECONDS || !byId.has(contact.unitId)) continue
        if (!this.visible[side].has(contact.unitId)) contact.observers = []
        contact.confidence = Math.max(0, 1 - age / CONTACT_MEMORY_SECONDS)
        contacts.push(contact)
      }
      state.contacts[side] = contacts.sort((a, b) => a.unitId.localeCompare(b.unitId))
    }
    for (const unit of state.units) unit.spotted = this.visible[unit.side === 'BLU' ? 'RED' : 'BLU'].has(unit.id)
  }

  contacts(state: BattleState, side: Side, point: Point, range: number) {
    return (state.contacts?.[side] || []).filter(contact => Math.hypot(contact.position.x - point.x, contact.position.y - point.y) <= range)
      .sort((a, b) => Math.hypot(a.position.x - point.x, a.position.y - point.y) - Math.hypot(b.position.x - point.x, b.position.y - point.y) || a.unitId.localeCompare(b.unitId))
  }

  visibleTo(side: Side, unitId: string) { return this.visible[side].has(unitId) }
}

