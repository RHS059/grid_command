import test from 'node:test'
import assert from 'node:assert/strict'
import { BASES, createUnit, initialState, type BattleState } from '../lib/game/types'
import { initializeHierarchy } from '../lib/game/ai/blackboard'
import { updateHierarchy } from '../lib/game/ai/hierarchy'
import { applyBehaviorMission } from '../lib/game/ai/integration'
import { configureOrganization } from '../lib/game/ai/organization'
import { configureFormations } from '../lib/game/ai/subcommander'
import { planOperation } from '../lib/game/ai/commander'
import { recordExecution, updateExecution, updateReadinessReports } from '../lib/game/ai/reporting'
import { InfantryDirector } from '../lib/game/infantry-ai'
import { Perception } from '../lib/game/perception'
import { Navigation } from '../lib/game/navigation'
import { Visibility } from '../lib/game/visibility'
import { serviceVehicle } from '../lib/game/sustainment'
import type { Mission, OrganizationNode } from '../lib/game/ai/model'

function fixture() {
  const state = initialState(3701)
  for (let i = 0; i < 6; i++) state.units.push(createUnit('BLU', i === 1 ? 'MG' : 'RIFLE', `squad-${i}`, BASES.BLU))
  state.behavior = initializeHierarchy(state)
  for (const side of ['BLU', 'RED'] as const) state.behavior.sides[side].communications = { delay: 2, loss: 0, available: true }
  return state
}
const advance = (state: BattleState, time: number) => { state.time = time; state.tick = Math.round(time * 20); return updateHierarchy(state) }
const tree = (): OrganizationNode[] => [
  { id: 'brigade', name: 'Authored Brigade', echelon: 'BRIGADE', commanderUnitId: 'BLU-command', unitIds: [] },
  { id: 'battalion', name: 'Authored Battalion', echelon: 'BATTALION', parentId: 'brigade', unitIds: [] },
  { id: 'company', name: 'Authored Company', echelon: 'COMPANY', parentId: 'battalion', unitIds: [] },
  { id: 'platoon', name: 'Authored Platoon', echelon: 'PLATOON', parentId: 'company', commanderUnitId: 'squad-0', unitIds: ['squad-0', 'squad-1'] },
]
function localMission(state: BattleState, task: Mission['task'] = 'ASSAULT') {
  advance(state, 0)
  const mission = advance(state, 4).find(m => m.unitId === 'squad-0')!
  mission.task = task
  const unit = state.units.find(u => u.id === mission.unitId)!
  Object.assign(unit, { ...mission.destination, walkFallbackUntil: 1000 })
  return { mission, unit, mind: state.behavior!.units[unit.id] }
}

test('authored organization is copied canonically and drives actual order travel through its command links', () => {
  const state = fixture(), command = state.behavior!.sides.BLU, input = tree()
  configureOrganization(command, input, state.units)
  assert.deepEqual(command.formations[0].commandPath, ['brigade', 'battalion', 'company', 'platoon'])
  input[3].unitIds.push('squad-5')
  assert.deepEqual(command.formations[0].unitIds, ['squad-0', 'squad-1'])
  advance(state, 0)
  assert.ok(!state.behavior!.orders.some(m => m.unitId === 'squad-0'), 'leaf headquarters must first receive parent intent')
  for (const time of [2, 4, 6]) assert.ok(!advance(state, time).some(m => m.unitId === 'squad-0'))
  assert.equal(state.behavior!.orders.find(m => m.unitId === 'squad-0')!.executeAt, 8)
  assert.ok(advance(state, 8).some(m => m.unitId === 'squad-0'))
  assert.throws(() => configureOrganization(command, tree(), state.units), /before operational/)
})

test('invalid organization links, cycles, commanders and cross-side assignments leave the previous tree intact', () => {
  const state = fixture(), command = state.behavior!.sides.BLU
  configureOrganization(command, tree(), state.units)
  const valid = structuredClone(command)
  const variants: OrganizationNode[][] = [
    [], tree().map(n => n.id === 'platoon' ? { ...n, parentId: 'absent' } : n),
    tree().map(n => n.id === 'company' ? { ...n, parentId: 'platoon' } : n),
    tree().map(n => n.id === 'battalion' ? { ...n, parentId: undefined } : n),
    tree().map(n => n.id === 'platoon' ? { ...n, unitIds: ['RED-command'] } : n),
    tree().map(n => n.id === 'platoon' ? { ...n, commanderUnitId: 'squad-5' } : n),
    tree().map(n => n.id === 'company' ? { ...n, unitIds: ['squad-0'] } : n),
    tree().map(n => n.id === 'platoon' ? { ...n, commanderUnitId: 'BLU-command' } : n),
    tree().map(n => n.id === 'platoon' ? { ...n, name: '  ' } : n),
  ]
  for (const candidate of variants) {
    assert.throws(() => configureOrganization(command, candidate, state.units))
    assert.deepEqual(command, valid)
  }
  for (const id of ['RED-command', 'BLU-command', 'unknown'])
    assert.throws(() => configureFormations(command, [{ id: 'invalid', name: 'Invalid', unitIds: [id] }], state.units))
  assert.deepEqual(command, valid)
})

test('long radio latency cannot starve orders during frequent replanning and late older packets cannot replace newer intent', () => {
  const state = fixture(), ai = state.behavior!
  ai.sides.BLU.communications.delay = 20
  advance(state, 0)
  for (const time of [8, 16, 24, 32]) { ai.sides.BLU.nextReview = time; advance(state, time) }
  assert.ok(ai.orders.filter(m => m.unitId === 'squad-0').length > 1)
  assert.equal(advance(state, 40).find(m => m.unitId === 'squad-0')!.revision, 1)
  const mind = ai.units['squad-0']
  ai.orders.push({ ...mind.mission!, revision: 99, executeAt: 41 })
  advance(state, 41); advance(state, 48)
  assert.equal(mind.mission!.revision, 99)
})

test('the commander sees delayed friendly readiness and support requests, and blackout does not leak fresh damage', () => {
  const a = fixture(), b = fixture()
  advance(a, 0); advance(b, 0)
  a.units.find(u => u.id === 'squad-0')!.ammo = 1
  b.units.find(u => u.id === 'squad-0')!.ammo = 100
  advance(a, .5); advance(b, .5)
  assert.equal(a.behavior!.sides.BLU.readiness['squad-0'].ammo, 100)
  assert.deepEqual(planOperation('BLU', .5, a.behavior!.sides.BLU), planOperation('BLU', .5, b.behavior!.sides.BLU))
  advance(a, 2.5)
  assert.equal(a.behavior!.sides.BLU.readiness['squad-0'].ammo, 1)
  assert.equal(a.behavior!.sides.BLU.readiness['squad-0'].supportRequest?.kind, 'AMMO')
  a.behavior!.sides.BLU.communications.available = false
  const received = structuredClone(a.behavior!.sides.BLU.readiness['squad-0'])
  a.units.find(u => u.id === 'squad-0')!.hp = 10
  advance(a, 20)
  assert.deepEqual(a.behavior!.sides.BLU.readiness['squad-0'], received)
  assert.ok(planOperation('BLU', 70, a.behavior!.sides.BLU)!.reasons.some(r => r.includes('0/6 status reports current')))
})

test('mission receipt, route refusal, retry, execution and completion have distinct delayed reports', () => {
  const state = fixture(), { mission, unit, mind } = localMission(state), command = state.behavior!.sides.BLU
  assert.equal(mind.execution?.status, 'RECEIVED')
  assert.equal(applyBehaviorMission(state, mission, () => false), false)
  assert.equal(mind.execution?.status, 'BLOCKED')
  assert.equal(unit.strategicOrder?.task, 'OVERWATCH')
  assert.equal(command.readiness[unit.id].execution, undefined)
  advance(state, 4.5); advance(state, 6.5)
  assert.equal(command.readiness[unit.id].execution?.status, 'BLOCKED')
  const retryAt = mind.execution!.retryAt!
  command.nextReview = 1000; command.degraded = true
  const retry = advance(state, retryAt).find(m => m.unitId === unit.id)!
  assert.ok(retry)
  assert.equal(applyBehaviorMission(state, retry, () => true), true)
  assert.equal(mind.execution?.status, 'ACCEPTED')
  updateExecution(state, unit)
  assert.equal(mind.execution?.status, 'ACCEPTED', 'arrival alone cannot count as capturing a neutral objective')
  const objective = state.objectives.find(o => o.id === mission.target)!
  Object.assign(unit, { x: objective.x, y: objective.y }); objective.owner = 'BLU'; objective.contested = true
  updateExecution(state, unit); assert.equal(mind.execution?.status, 'ACCEPTED')
  objective.contested = false; updateExecution(state, unit)
  assert.equal(mind.execution?.status, 'COMPLETED')
  assert.equal(command.readiness[unit.id].execution?.status, 'BLOCKED')
  advance(state, retryAt + .5); advance(state, retryAt + 4.5)
  assert.equal(command.readiness[unit.id].execution?.status, 'COMPLETED')
})

test('blocked infantry intent cannot be reconstructed by the tactical director before a successful retry', () => {
  const state = fixture(), { mission, unit, mind } = localMission(state)
  mission.destination = { x: unit.x + 250, y: unit.y }
  assert.equal(applyBehaviorMission(state, mission, () => false), false)
  const director = new InfantryDirector(), perception = new Perception(), nav = new Navigation(), visibility = new Visibility()
  for (let i = 0; i < 10; i++) { state.tick++; director.update(state, perception, visibility, nav) }
  assert.equal(unit.movementIntent, undefined)
  assert.equal(mind.execution?.status, 'BLOCKED')
  assert.equal(applyBehaviorMission(state, mission, () => true), true)
  assert.equal(unit.strategicOrder?.task, 'CAPTURE')
})

test('dedicated service ownership blocks and retries an order without erasing that controller', () => {
  const state = fixture(), { mission, unit, mind } = localMission(state)
  unit.servicing = true; unit.path = [{ x: 123, y: 456 }]
  let routed = false
  assert.equal(applyBehaviorMission(state, mission, () => { routed = true; return true }), false)
  assert.equal(routed, false); assert.deepEqual(unit.path, [{ x: 123, y: 456 }])
  assert.equal(mind.execution?.status, 'BLOCKED')
  unit.servicing = false
  const retry = advance(state, 9).find(m => m.unitId === unit.id)!
  assert.ok(retry); assert.equal(applyBehaviorMission(state, retry, () => true), true)
  assert.equal(mind.execution?.status, 'ACCEPTED')
})

test('resupply completion requires actual restored resources and empty depots grant no fulfillment', () => {
  const state = fixture(), tank = createUnit('BLU', 'TANK', 'tank', BASES.BLU)
  tank.ammo = 10; tank.fuel = 10; tank.servicing = false
  state.units.push(tank); advance(state, 0)
  const mission = advance(state, 4).find(m => m.unitId === tank.id)!
  assert.equal(mission.task, 'RESUPPLY')
  applyBehaviorMission(state, mission, () => true)
  const before = { ammo: tank.ammo, fuel: tank.fuel, hp: tank.hp }, stock = structuredClone(state.depots.BLU)
  serviceVehicle(state, tank, 30); updateExecution(state, tank)
  assert.deepEqual({ ammo: tank.ammo, fuel: tank.fuel, hp: tank.hp }, before)
  assert.deepEqual(state.depots.BLU, stock)
  assert.equal(state.behavior!.units[tank.id].execution?.status, 'ACCEPTED')
  state.depots.BLU.mob = { ammo: 10000, fuel: 10000, repair: 10000 }
  serviceVehicle(state, tank, 60); updateExecution(state, tank)
  assert.equal(state.behavior!.units[tank.id].execution?.status, 'COMPLETED')
  assert.ok(state.depots.BLU.mob.ammo < 10000 && state.depots.BLU.mob.fuel < 10000)
})

test('lost feedback is retried after restoration while older delayed snapshots cannot undo new status', () => {
  const state = fixture(), { mission, unit, mind } = localMission(state), ai = state.behavior!, command = ai.sides.BLU
  command.communications.loss = 1
  applyBehaviorMission(state, mission, () => true)
  state.time = 4.5; updateReadinessReports(state, ai)
  assert.equal(command.readiness[unit.id].execution, undefined)
  command.communications.loss = 0
  state.time = 10; updateReadinessReports(state, ai)
  state.time = 12; updateReadinessReports(state, ai)
  assert.equal(command.readiness[unit.id].execution?.status, 'ACCEPTED')
  const old = structuredClone(command.readiness[unit.id])
  state.time = 13; recordExecution(state, unit, mission, 'COMPLETED', 'Verified test observation.')
  updateReadinessReports(state, ai); state.time = 15; updateReadinessReports(state, ai)
  assert.equal(command.readiness[unit.id].execution?.status, 'COMPLETED')
  ai.statusReports.push({ side: 'BLU', due: 16, report: old })
  state.time = 16; updateReadinessReports(state, ai)
  assert.equal(command.readiness[unit.id].execution?.status, mind.execution?.status)
})

test('expired intent is reported as expiry, and extremely delayed status queues discard unusable stale packets', () => {
  const state = fixture(), { mission, unit, mind } = localMission(state, 'SUPPORT'), ai = state.behavior!
  applyBehaviorMission(state, mission, () => true)
  state.time = mission.expiresAt + .5; updateExecution(state, unit)
  assert.equal(mind.execution?.status, 'EXPIRED')
  ai.sides.BLU.communications.delay = 1e6
  for (let t = 200; t <= 400; t += 5) { state.time = t; updateReadinessReports(state, ai) }
  assert.ok(ai.statusReports.length <= 60)
  assert.ok(ai.statusReports.every(p => state.time - p.report.observedAt <= 45))
})

test('organization, losses and delayed execution feedback replay identically across reordered scenario input', () => {
  const a = fixture(), b = fixture(); b.units.reverse()
  configureOrganization(a.behavior!.sides.BLU, tree(), a.units)
  configureOrganization(b.behavior!.sides.BLU, tree().reverse(), b.units)
  for (let t = 0; t <= 80; t += .5) {
    for (const state of [a, b]) {
      state.behavior!.sides.BLU.communications.loss = .27
      for (const mission of advance(state, t)) applyBehaviorMission(state, mission, () => true)
    }
  }
  assert.deepEqual(a.behavior, b.behavior)
})
