import { BASES, CATALOG, isVehicle, type BattleState, type ContactMemory, type MovementIntent, type Objective, type Point, type StrategicAction, type StrategicTask, type TacticalAction, type Unit } from './types'
import { distance } from './movement'
import { Navigation } from './navigation'
import { Perception } from './perception'
import { Visibility } from './visibility'

const DECISION_TICKS = 10
const hash = (id: string) => [...id].reduce((value, char) => (Math.imul(value, 33) + char.charCodeAt(0)) >>> 0, 5381)
const validAction = (action: string): StrategicAction => ['ASSEMBLE', 'MASS', 'FLANK', 'SEIZE', 'RESUPPLY'].includes(action) ? action as StrategicAction : 'SEIZE'
export const aiInfantry = (unit: Unit) => !isVehicle(unit.role) && !['COMMAND', 'PILOT', 'LOGISTICS'].includes(unit.role) && unit.hp > 0 && !!unit.soldiers?.some(s => s.status === 'active')
const taskFor = (unit: Unit): StrategicTask => unit.role === 'MEDIC' ? 'SUPPORT' : ['RIFLE', 'SCOUT', 'AT'].includes(unit.role) ? 'CAPTURE' : 'OVERWATCH'
const display = (action: TacticalAction) => ({ ADVANCE: 'ADVANCING', HOLD: 'HOLDING', ENGAGE: 'ENGAGING', COVER: 'TAKING COVER', SUPPRESS: 'SUPPRESSING', LOCAL_FLANK: 'LOCAL FLANK', WITHDRAW: 'WITHDRAWING', RESCUE: 'CASUALTY RECOVERY', RESUPPLY: 'RESUPPLY', MOUNT: 'WAITING FOR TRANSPORT' }[action])
const destinationFor = (unit: Unit, objective: Objective, action: StrategicAction) => {
  const side = unit.side === 'BLU' ? -1 : 1, slot = hash(unit.id) % 7 - 3
  if (unit.role === 'MEDIC') return { x: objective.x + slot * 18, y: objective.y + side * 115 }
  if (['MG', 'MORTAR', 'AA_TEAM'].includes(unit.role)) return { x: objective.x + slot * 28, y: objective.y + side * (unit.role === 'MORTAR' ? 380 : 170) }
  const flank = action === 'FLANK' ? (hash(unit.id) % 2 ? 1 : -1) * 95 : 0
  return { x: objective.x + slot * 22 + flank, y: objective.y + side * (Math.abs(slot) % 2) * 24 }
}

export function issueInfantryOrder(unit: Unit, action: StrategicAction, task: StrategicTask, target: string, destination: Point, revision: number, time: number) {
  const changed = unit.strategicOrder?.target !== target || unit.strategicOrder?.action !== action || unit.strategicOrder?.task !== task
  unit.strategicOrder = { revision, action, task, target, destination: { ...destination }, issuedAt: time }
  if (changed) { unit.tacticalIntent = undefined; unit.movementIntent = undefined }
  unit.target = target
}

type Candidate = { action: TacticalAction; score: number; destination?: Point; targetId?: string; commitment: number }

export class InfantryDirector {
  private coverClaims = new Map<string, { unitId: string; until: number }>()

  reset() { this.coverClaims.clear() }

  private ensureOrder(state: BattleState, unit: Unit) {
    const force = state.forces[unit.side], objective = state.objectives.find(o => o.id === force.target)
    if (!objective) return
    const action = validAction(force.action)
    if (unit.strategicOrder && unit.strategicOrder.revision === force.cycles && unit.strategicOrder.target === objective.id) return
    issueInfantryOrder(unit, action, taskFor(unit), objective.id, destinationFor(unit, objective, action), force.cycles, state.time)
  }

  private cover(unit: Unit, threat: ContactMemory, state: BattleState, visibility: Visibility, nav: Navigation) {
    for (const point of visibility.coverPoints(unit, threat.position, 55)) {
      const safe = nav.nearest(point), key = `${Math.round(safe.x / 2)},${Math.round(safe.y / 2)}`, claim = this.coverClaims.get(key)
      if (!nav.clear(unit, safe) || claim && claim.unitId !== unit.id && claim.until > state.time) continue
      return safe
    }
  }

  private decide(state: BattleState, unit: Unit, perception: Perception, visibility: Visibility, nav: Navigation, downed: { unit: Unit; point: Point }[]) {
    if (state.tick % DECISION_TICKS !== hash(unit.id) % DECISION_TICKS) return
    const current = unit.tacticalIntent
    const threats = perception.contacts(state, unit.side, unit, 950), threat = threats[0]
    const order = unit.strategicOrder, destination = order?.destination
    const suppression = unit.suppression || 0, candidates: Candidate[] = []
    const casualty = downed.filter(entry => entry.unit.side === unit.side && distance(unit, entry.point) <= 40)
      .sort((a, b) => distance(unit, a.point) - distance(unit, b.point) || a.unit.id.localeCompare(b.unit.id))[0]
    if (unit.ammo < 12) candidates.push({ action: 'RESUPPLY', score: 96 + (12 - unit.ammo), destination: BASES[unit.side], commitment: 5 })
    if (threat && (suppression > .72 || unit.hp < 28)) {
      const dx = unit.x - threat.position.x, dy = unit.y - threat.position.y, d = Math.hypot(dx, dy) || 1
      candidates.push({ action: 'WITHDRAW', score: 92 + suppression * 20, destination: nav.nearest({ x: unit.x + dx / d * 85, y: unit.y + dy / d * 85 }), targetId: threat.unitId, commitment: 5 })
    }
    if (casualty && suppression < .7) candidates.push({ action: 'RESCUE', score: 66 + (unit.role === 'MEDIC' ? 16 : 0), destination: casualty.point, targetId: casualty.unit.id, commitment: 4 })
    if (threat && suppression > .28) {
      const cover = this.cover(unit, threat, state, visibility, nav)
      if (cover) candidates.push({ action: 'COVER', score: 68 + suppression * 28, destination: cover, targetId: threat.unitId, commitment: 4 })
    }
    if (threat) {
      const range = CATALOG[unit.role].range || 600, separation = distance(unit, threat.position)
      if (['MG', 'MORTAR', 'AA_TEAM'].includes(unit.role) && separation <= range) candidates.push({ action: 'SUPPRESS', score: 62 + threat.confidence * 18, targetId: threat.unitId, commitment: 3 })
      else if (separation <= range) candidates.push({ action: 'ENGAGE', score: 60 + threat.confidence * 20, targetId: threat.unitId, commitment: 2.5 })
      if (order?.task === 'CAPTURE' && suppression < .38 && separation < 650) {
        const dx = threat.position.x - unit.x, dy = threat.position.y - unit.y, d = Math.hypot(dx, dy) || 1, side = hash(unit.id) % 2 ? 1 : -1
        candidates.push({ action: 'LOCAL_FLANK', score: 58 + threat.confidence * 15,
          destination: nav.nearest({ x: threat.position.x + side * dy / d * 65 - dx / d * 35, y: threat.position.y - side * dx / d * 65 - dy / d * 35 }), targetId: threat.unitId, commitment: 5 })
      }
    }
    if (destination) {
      const remaining = distance(unit, destination)
      if (remaining > 500 && (unit.transportIntent || !unit.path.length)) candidates.push({ action: 'MOUNT', score: 52, commitment: 3 })
      candidates.push(remaining <= 35 ? { action: 'HOLD', score: 45, commitment: 3 } : { action: 'ADVANCE', score: 42, destination, commitment: 3 })
    } else candidates.push({ action: 'HOLD', score: 30, commitment: 3 })
    candidates.sort((a, b) => b.score - a.score || a.action.localeCompare(b.action))
    const chosen = candidates[0]
    if (!chosen) return
    if (current && current.committedUntil > state.time && chosen.score < current.score + 14 && !(chosen.action === 'WITHDRAW' && current.action !== 'WITHDRAW')) return
    if (chosen.action === 'COVER' && chosen.destination) this.coverClaims.set(`${Math.round(chosen.destination.x / 2)},${Math.round(chosen.destination.y / 2)}`, { unitId: unit.id, until: state.time + chosen.commitment + 2 })
    unit.tacticalIntent = { action: chosen.action, score: chosen.score, decidedAt: state.time, committedUntil: state.time + chosen.commitment,
      destination: chosen.destination ? { ...chosen.destination } : undefined, targetId: chosen.targetId }
  }

  update(state: BattleState, perception: Perception, visibility: Visibility, nav: Navigation) {
    for (const [key, claim] of this.coverClaims) if (claim.until <= state.time || !state.units.some(u => u.id === claim.unitId && u.hp > 0)) this.coverClaims.delete(key)
    const downed = state.units.flatMap(unit => (unit.soldiers || []).filter(s => s.status === 'downed').map(point => ({ unit, point })))
    const reserved = new Set(state.units.filter(unit => unit.hp > 0).flatMap(unit => unit.transport?.passengers || []))
    for (const unit of state.units.filter(aiInfantry).sort((a, b) => a.id.localeCompare(b.id))) {
      if (!unit.carrier && !reserved.has(unit.id)) this.ensureOrder(state, unit)
      if (unit.carrier || reserved.has(unit.id) || unit.emergency || unit.servicing || unit.deployment) { unit.movementIntent = undefined; continue }
      this.decide(state, unit, perception, visibility, nav, downed)
      const tactical = unit.tacticalIntent, order = unit.strategicOrder
      let destination = tactical?.destination, source: MovementIntent['source'] = 'tactical'
      if (!destination && tactical?.action === 'ADVANCE') destination = order?.destination
      if (!destination && !tactical) { destination = order?.destination; source = 'strategic' }
      if (tactical?.action === 'MOUNT' || ['HOLD', 'ENGAGE', 'SUPPRESS'].includes(tactical?.action || '')) destination = undefined
      unit.movementIntent = destination ? { source, destination: { ...destination }, speed: CATALOG[unit.role].speed * (unit.hp < 30 ? .65 : 1), arrival: tactical?.action === 'HOLD' ? 35 : 2, issuedAt: state.time } : undefined
      if (unit.movementIntent && distance(unit, unit.movementIntent.destination) <= unit.movementIntent.arrival) unit.movementIntent = undefined
      unit.mission = display(tactical?.action || 'ADVANCE')
      unit.target = tactical?.action === 'RESUPPLY' ? 'MOB' : order?.target || unit.target
      if (unit.movementIntent && (!unit.path.length || distance(unit.path.at(-1)!, unit.movementIntent.destination) > 4)) unit.path = nav.route(unit, unit.movementIntent.destination)
    }
  }

  movement(state: BattleState, unit: Unit) {
    if (!aiInfantry(unit) || unit.carrier || unit.emergency || unit.servicing || unit.deployment || state.units.some(carrier => carrier.hp > 0 && carrier.transport?.passengers?.includes(unit.id))) return undefined
    if (unit.transportIntent && !unit.path.length) return undefined
    return unit.movementIntent
  }
}

