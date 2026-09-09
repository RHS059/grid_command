import { acceptMaritimeMission } from '../maritime-controller'
import { BASES, isNaval, isAir, isVehicle, troopSeats, type BattleState, type Point, type Unit } from '../types'
import { issueInfantryOrder } from '../infantry-ai'
import { assessCommandStaff } from '../subcommanders'
import { authorizeMissionFuel, commitMissionFuel } from '../sustainment'
import { FINAL_APPROACH_WALK_DISTANCE } from '../transport'
import { commandable } from './hierarchy'
import { decideIndependentUnit } from './unit-behavior'
import { distance, trace, type Mission } from './model'
import { recordExecution } from './reporting'

type Route = (unit: Unit, destination: Point) => boolean
export function applyBehaviorMission(state: BattleState, mission: Mission, route: Route) {
  const u = state.units.find(unit => unit.id === mission.unitId)
  if (!u || !commandable(u)) return false
  const block = (reason: string, retryAt = state.time + 5) => { recordExecution(state, u, mission, 'BLOCKED', reason, retryAt); return false }
  if (state.time > mission.expiresAt) { recordExecution(state, u, mission, 'EXPIRED', 'Intent expired before execution.'); return false }
  if (isNaval(u.role)) return acceptMaritimeMission(state, u, mission)
  if (u.servicing || u.emergency || u.deployment || u.carrier || u.attachedSquad ||
    troopSeats(u.role) > 0 && u.transport && !['available', 'escort'].includes(u.transport.phase) ||
    state.units.some(c => c.hp > 0 && ((c.transport?.passengers?.includes(u.id) || c.maritime?.passengers.includes(u.id)) || c.construction?.builder === u.id)))
    return block('Dedicated service, emergency, deployment, transport or construction controller owns this unit.')
  const objective = state.objectives.find(o => o.id === mission.target)
  if (!objective) return block('The ordered objective no longer exists.', mission.expiresAt + 1)
  const council = assessCommandStaff(state, u.side, objective, mission.action)
  const offense = ['ASSAULT', 'RECON', 'SUPPORT'].includes(mission.task)
  if (offense && ((!isVehicle(u.role) && ['RIFLE', 'SCOUT', 'AT'].includes(u.role) && !council.infantryApproved && distance(u, mission.destination) > FINAL_APPROACH_WALK_DISTANCE && (u.walkFallbackUntil || 0) <= state.time) ||
    isAir(u.role) && !council.airApproved || ['MG', 'MORTAR'].includes(u.role) && !council.firesApproved)) {
    u.path = []; u.mission = 'HOLD BY COMMAND STAFF'; u.movementIntent = undefined; u.tacticalIntent = undefined
    // Store an explicit hold so the local director cannot recreate an assault from force-wide state.
    issueInfantryOrder(u, mission.action, 'OVERWATCH', mission.target, u, mission.revision, state.time)
    u.orderRefusal = { code: 'NO_TRANSPORT', reason: 'Command staff readiness constraints hold this mission.', target: mission.target, since: state.time, retryAt: state.time + 15 }
    return block(u.orderRefusal.reason, u.orderRefusal.retryAt)
  }
  if (isVehicle(u.role) && offense) {
    const authorization = authorizeMissionFuel(u, mission.destination, undefined, state)
    if (!authorization.ok) {
      u.path = []; u.fuelCommitment = undefined; u.servicing = authorization.required <= 100
      u.mission = u.servicing ? 'RTB FOR SERVICE' : 'HOLD FOR FORWARD SERVICE'
      u.orderRefusal = { code: 'INSUFFICIENT_FUEL', reason: authorization.reason, target: mission.target, since: state.time, retryAt: state.time + 45 }
      return block(u.orderRefusal.reason, u.orderRefusal.retryAt)
    }
    commitMissionFuel(u, mission.target, authorization.required, state.time)
  }
  u.subcommand = mission.issuer; u.target = mission.target; u.mission = mission.task
  const task = mission.task === 'ASSAULT' || mission.task === 'RECON' ? 'CAPTURE' : mission.task === 'RESUPPLY' ? 'RESUPPLY' : mission.task === 'SUPPORT' ? 'SUPPORT' : 'OVERWATCH'
  if (mission.task === 'RESERVE') {
    if (!isVehicle(u.role)) issueInfantryOrder(u, mission.action, task, mission.target, u, mission.revision, state.time)
    u.path = []; u.movementIntent = undefined
    recordExecution(state, u, mission, 'ACCEPTED', 'Holding as the assigned reserve until released.'); return true
  }
  if (!route(u, mission.destination)) {
    u.path = []; u.movementIntent = undefined; u.tacticalIntent = undefined; u.fuelCommitment = undefined
    if (!isVehicle(u.role)) issueInfantryOrder(u, mission.action, 'OVERWATCH', mission.target, u, mission.revision, state.time)
    u.orderRefusal ??= { code: 'NO_ROUTE', reason: 'No traversable route to the ordered destination.', target: mission.target, since: state.time, retryAt: state.time + 15 }
    return block(u.orderRefusal.reason, u.orderRefusal.retryAt)
  }
  u.orderRefusal = undefined
  if (!isVehicle(u.role)) issueInfantryOrder(u, mission.action, task, mission.target, mission.destination, mission.revision, state.time)
  recordExecution(state, u, mission, 'ACCEPTED', 'Readiness and route checks passed; the local controller is executing the mission.')
  return true
}

export function updateVehicleBehavior(state: BattleState, route: Route) {
  const ai = state.behavior
  if (!ai) return
  for (const u of state.units.filter(u => isVehicle(u.role) && !isNaval(u.role) && commandable(u))) {
    const mind = ai.units[u.id]
    if (!mind) continue
    const decision = decideIndependentUnit(u, mind.personality, mind.factors, mind.contacts, mind.mission)
    if (decision.action === 'CONTINUE') continue
    if (decision.action === 'HOLD') { u.path = []; u.engine = false; u.mission = 'HOLD' }
    else if (decision.action === 'SERVICE') { u.servicing = true; u.mission = 'RTB FOR SERVICE' }
    else if (decision.destination && (u.mission !== 'WITHDRAW' || !u.path.length && distance(u, BASES[u.side]) > 50)) { route(u, decision.destination); u.mission = 'WITHDRAW' }
    if (mind.lastVehicleDecision !== decision.action) {
      trace(ai, { time: state.time, actor: u.id, level: 'unit', decision: decision.action, reasons: [decision.reason] }); mind.lastVehicleDecision = decision.action
    }
  }
}
