import test from 'node:test'
import assert from 'node:assert/strict'
import { initialState, createUnit, BASES, type BattleState, type ContactMemory } from '../lib/game/types'
import { initializeHierarchy, updateBlackboards, rememberUnit } from '../lib/game/ai/blackboard'
import { updateHierarchy } from '../lib/game/ai/hierarchy'
import { planOperation } from '../lib/game/ai/commander'
import { assignFormations, configureFormations, decomposeMission } from '../lib/game/ai/subcommander'
import { decideSquad, updateHumanFactors } from '../lib/game/ai/squad-leader'
import { decideIndependentUnit } from '../lib/game/ai/unit-behavior'
import { defaultDoctrine, initialFactors, personality } from '../lib/game/ai/model'
import { Perception } from '../lib/game/perception'
import { InfantryDirector } from '../lib/game/infantry-ai'
import { Navigation } from '../lib/game/navigation'
import { Visibility } from '../lib/game/visibility'
import { applyBehaviorMission } from '../lib/game/ai/integration'
import { assignTransports } from '../lib/game/transport'
import { captureBodies } from '../lib/game/capture'

function fixture(seed = 3701) {
  const state = initialState(seed)
  for (let i = 0; i < 6; i++) state.units.push(createUnit('BLU', i === 1 ? 'MG' : 'RIFLE', `squad-${i}`, BASES.BLU))
  state.behavior = initializeHierarchy(state)
  for (const side of ['BLU', 'RED'] as const) state.behavior.sides[side].communications = { delay: 2, loss: 0, available: true }
  return state
}
const advance = (state: BattleState, time: number) => { state.time = time; state.tick = Math.round(time * 20); return updateHierarchy(state) }
function report(state: BattleState): ContactMemory {
  return { unitId: 'enemy', role: 'TANK', position: { x: BASES.BLU.x + 40, y: BASES.BLU.y + 40 }, lastSeen: state.time, confidence: 1, observers: ['squad-0'] }
}

test('hierarchy delivers commander intent through stable subcommand and delayed orders', () => {
  const state = fixture(), ai = state.behavior!
  assert.deepEqual(advance(state, 0), [])
  assert.equal(ai.sides.BLU.plan?.revision, 1)
  assert.equal(ai.sides.BLU.formations.length, 2)
  assert.equal(ai.orders.length, 6)
  assert.deepEqual(advance(state, 3.5), [])
  const orders = advance(state, 4)
  assert.equal(orders.length, 6)
  assert.ok(orders.every(o => o.issuer.startsWith('BLU:auto:') && o.revision === ai.sides.BLU.plan!.revision))
  assert.equal(orders.filter(o => o.task === 'RESERVE').length, 1)
  const membership = structuredClone(ai.sides.BLU.formations)
  state.units.find(u => u.id === 'squad-0')!.hp = 0
  assignFormations(ai.sides.BLU, state.units.filter(u => u.side === 'BLU' && u.role !== 'COMMAND' && u.hp > 0), 'BLU')
  assert.deepEqual(ai.sides.BLU.formations, membership)
})

test('same seed and observations replay identically despite unit array ordering', () => {
  const a = fixture(), b = fixture(); b.units.reverse()
  for (const t of [0, .5, 2, 4, 8, 30, 50]) { advance(a, t); advance(b, t) }
  assert.deepEqual(a.behavior, b.behavior)
  assert.notDeepEqual(personality(10, 'leader'), personality(11, 'leader'))
})

test('observer, command, and uninvolved squad learn a contact at distinct times', () => {
  const state = fixture(), ai = state.behavior!
  state.contacts = { BLU: [report(state)], RED: [] }
  advance(state, 0)
  assert.equal(ai.units['squad-0'].contacts.length, 1)
  assert.equal(ai.units['squad-2'].contacts.length, 0)
  assert.equal(ai.sides.BLU.contacts.length, 0)
  advance(state, 2)
  assert.equal(ai.sides.BLU.contacts.length, 1)
  assert.equal(ai.units['squad-2'].contacts.length, 0)
  advance(state, 4)
  assert.equal(ai.units['squad-2'].contacts.length, 1)
  assert.ok(ai.units['squad-2'].contacts[0].confidence < 1)
})

test('sustained reports do not starve delayed downstream delivery', () => {
  const state = fixture()
  for (let time = 0; time <= 8; time += .5) {
    state.time = time; state.contacts = { BLU: [report(state)], RED: [] }; advance(state, time)
  }
  const received = state.behavior!.units['squad-2'].contacts[0]
  assert.ok(received && received.lastSeen <= 4 && received.lastSeen >= 2)
})

test('hidden enemy movement and destruction cannot change commander knowledge or score', () => {
  const a = fixture(), b = fixture()
  a.units.push(createUnit('RED', 'TANK', 'hidden', BASES.BLU))
  const enemy = createUnit('RED', 'TANK', 'hidden', BASES.RED); enemy.hp = 0; b.units.push(enemy)
  advance(a, 0); advance(b, 0)
  assert.deepEqual(a.behavior!.sides.BLU.plan, b.behavior!.sides.BLU.plan)
  const perception = new Perception(), observed = a.units.find(u => u.id === 'hidden')!
  perception.update(a, (observer, target) => observer.id === 'squad-0' && target.id === 'hidden')
  const oldPosition = { ...a.contacts!.BLU[0].position }
  observed.hp = 0; observed.x += 1000; a.time = 1
  perception.update(a, () => false)
  assert.deepEqual(a.contacts!.BLU[0].position, oldPosition)
  assert.equal(a.contacts!.BLU.length, 1, 'unobserved destruction does not erase contact memory')
})

test('objective control requires friendly observation and report latency', () => {
  const state = fixture(), ai = state.behavior!, objective = state.objectives[0]
  objective.owner = 'RED'; advance(state, 0)
  assert.equal(ai.sides.BLU.objectives[0].owner, null)
  const observer = state.units.find(u => u.id === 'squad-0')!; observer.x = objective.x; observer.y = objective.y
  advance(state, .5); assert.equal(ai.sides.BLU.objectives[0].owner, null)
  advance(state, 2.5); assert.equal(ai.sides.BLU.objectives[0].owner, 'RED')
})

test('radio blackout preserves local observation and previous intent without remote knowledge', () => {
  const state = fixture(), ai = state.behavior!
  advance(state, 0); advance(state, 4)
  const mission = structuredClone(ai.units['squad-0'].mission)
  ai.sides.BLU.communications.available = false
  state.time = 5; state.contacts = { BLU: [report(state)], RED: [] }; advance(state, 5)
  advance(state, 40)
  assert.equal(ai.units['squad-0'].contacts.length, 1)
  assert.equal(ai.units['squad-2'].contacts.length, 0)
  assert.equal(ai.sides.BLU.contacts.length, 0)
  assert.deepEqual(ai.units['squad-0'].mission, mission)
  assert.ok(ai.traces.some(t => t.decision === 'REPORT LOST'))
})

test('command loss causes succession pause, slower review and surviving delegated orders', () => {
  const state = fixture(), ai = state.behavior!
  advance(state, 0); advance(state, 4)
  const previous = structuredClone(ai.units['squad-0'].mission), oldReview = ai.sides.BLU.plan!.reviewAt
  state.units.find(u => u.role === 'COMMAND' && u.side === 'BLU')!.hp = 0
  advance(state, 5)
  assert.equal(ai.sides.BLU.degraded, true)
  assert.equal(ai.sides.BLU.commanderId, 'squad-0')
  assert.deepEqual(ai.units['squad-0'].mission, previous)
  assert.deepEqual(advance(state, 10), [])
  advance(state, Math.max(21, oldReview))
  const plan = ai.sides.BLU.plan!
  assert.ok(plan.reviewAt - plan.issuedAt >= 40)
  assert.ok(ai.traces.some(t => t.decision === 'SUCCESSION'))
})

test('morale responds to casualties and time, and risk changes withdrawal threshold coherently', () => {
  const state = fixture(), unit = state.units.find(u => u.id === 'squad-0')!, p = personality(1, unit.id)
  const before = initialFactors(unit, 0); unit.hp = 45; unit.suppression = .6
  const after = updateHumanFactors(unit, before, 10, [], p)
  assert.ok(after.morale < before.morale && after.cohesion < before.cohesion)
  const factors = { ...after, morale: .2, suppression: 0, posture: 'STEADY' as const }; unit.hp = 100
  assert.equal(decideSquad(unit, factors, { ...p, risk: 0 }, [], undefined, 10, defaultDoctrine()).posture, 'WITHDRAW')
  assert.equal(decideSquad(unit, factors, { ...p, risk: 1 }, [], undefined, 10, defaultDoctrine()).posture, 'STEADY')
  assert.deepEqual(updateHumanFactors(unit, after, after.updatedAt, [], p).morale, after.morale)
})

test('rout, optional surrender and recovery hysteresis have distinct preconditions', () => {
  const state = fixture(), unit = state.units.find(u => u.id === 'squad-0')!, p = personality(2, 'x')
  unit.ammo = 3
  const contacts = [0, 1, 2].map(i => ({ ...report(state), unitId: `enemy-${i}` }))
  const factors = { ...initialFactors(unit, 0), morale: .06, suppression: .9 }
  assert.equal(decideSquad(unit, factors, p, contacts, undefined, 0, defaultDoctrine()).posture, 'ROUT')
  assert.equal(decideSquad(unit, factors, p, contacts, undefined, 0, { ...defaultDoctrine(), surrender: true }).posture, 'SURRENDER')
  assert.equal(decideSquad(unit, { ...factors, morale: .3, suppression: .1, posture: 'ROUT' }, p, [], undefined, 0, defaultDoctrine()).posture, 'WITHDRAW')
})

test('reserve is released only for a received threat and support precedes assault', () => {
  const state = fixture(), ai = state.behavior!, command = ai.sides.BLU
  advance(state, 0)
  assert.ok(command.plan!.reserveIds.length > 0)
  command.contacts = [report(state)]
  const own = state.units.filter(u => u.side === 'BLU' && u.role !== 'COMMAND')
  const plan = planOperation('BLU', 10, command)!
  assert.equal(plan.reserveIds.length, 0)
  const attack = { ...plan, posture: 'ADVANCE' as const, target: { ...plan.target, ...BASES.BLU } }
  const missions = decomposeMission('BLU', 10, attack, command, command.formations[0], own)
  assert.ok(missions.find(m => m.task === 'ASSAULT')!.executeAt > missions.find(m => m.task === 'SUPPORT')!.executeAt)
})

test('vehicle autonomy respects dedicated controllers and known air defense', () => {
  const state = fixture(), unit = createUnit('BLU', 'CAS_FIGHTER', 'air', BASES.BLU), p = { ...personality(1, 'air'), risk: .3 }
  unit.fuel = 100; unit.ammo = 100; unit.servicing = false
  const factors = initialFactors(unit, 0), contact = { ...report(state), role: 'AA_TEAM' as const }
  assert.equal(decideIndependentUnit(unit, p, factors, [contact]).action, 'RETREAT')
  assert.equal(decideIndependentUnit(unit, p, factors, []).action, 'CONTINUE')
  unit.servicing = true
  assert.equal(decideIndependentUnit(unit, p, factors, [contact]).action, 'CONTINUE')
  unit.servicing = false; unit.fuel = 0
  assert.equal(decideIndependentUnit(unit, p, factors, []).action, 'HOLD')
})

test('infantry cannot recreate undelivered force orders; delivered reserve holds', () => {
  const state = fixture(), ai = state.behavior!, unit = state.units.find(u => u.id === 'squad-0')!
  const director = new InfantryDirector(), perception = new Perception(), nav = new Navigation(), visibility = new Visibility()
  advance(state, 0)
  for (let i = 0; i < 10; i++) { state.tick = i; director.update(state, perception, visibility, nav) }
  assert.equal(unit.strategicOrder, undefined)
  assert.equal(unit.movementIntent, undefined)
  const orders = advance(state, 4), reserve = orders.find(o => o.task === 'RESERVE')!, reserved = state.units.find(u => u.id === reserve.unitId)!
  let routed = false
  assert.ok(applyBehaviorMission(state, reserve, () => { routed = true; return true }))
  assert.equal(routed, false)
  for (let i = 0; i < 10; i++) { state.tick = 80 + i; director.update(state, perception, visibility, nav) }
  assert.equal(reserved.tacticalIntent?.action, 'HOLD')
  assert.equal(reserved.movementIntent, undefined)
  assert.equal(ai.units[reserved.id].mission?.task, 'RESERVE')
})

test('surrendered infantry cannot capture objectives', () => {
  const state = fixture(), unit = state.units.find(u => u.id === 'squad-0')!
  state.units = [unit]
  for (const soldier of unit.soldiers || []) { soldier.x = unit.x; soldier.y = unit.y }
  assert.ok(captureBodies(state, unit).BLU > 0)
  unit.surrendered = true
  assert.equal(captureBodies(state, unit).BLU, 0)
})

test('scenario organization is explicit, stable and rejects duplicate unit assignment atomically', () => {
  const state = fixture(), command = state.behavior!.sides.BLU, own = state.units.filter(u => u.side === 'BLU')
  configureFormations(command, [{ id: 'company-a', name: 'Scenario Company A', unitIds: ['squad-0', 'squad-1'] }], own)
  const valid = structuredClone(command.formations)
  assert.throws(() => configureFormations(command, [{ id: 'a', name: 'A', unitIds: ['squad-0'] }, { id: 'b', name: 'B', unitIds: ['squad-0'] }], own))
  assert.deepEqual(command.formations, valid)
})

test('automatic transport cannot pull a held reserve toward the force objective', () => {
  const state = fixture(); advance(state, 0)
  const reserve = advance(state, 4).find(o => o.task === 'RESERVE')!, unit = state.units.find(u => u.id === reserve.unitId)!
  applyBehaviorMission(state, reserve, () => true)
  unit.target = state.objectives.at(-1)!.id
  assignTransports(state)
  assert.equal(unit.transportIntent, undefined)
  assert.equal(unit.mission, 'RESERVE')
})
