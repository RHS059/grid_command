import { isVehicle, type BattleState } from '../types'
import { initializeHierarchy, rememberUnit, updateBlackboards } from './blackboard'
import { planOperation } from './commander'
import { assignFormations, decomposeMission } from './subcommander'
import { decideSquad, updateHumanFactors } from './squad-leader'
import { commandable, ordered, seeded, trace, type Mission } from './model'
import { recordExecution, updateExecution, updateReadinessReports } from './reporting'

import { allocateSupport, supportOwns } from './support'
import { initializeEchelons, broadcastEchelonIntent, advanceEchelons } from './echelons'

export { commandable } from './model'

/** Advances cognition at two Hz. Returned orders have passed the simulated command path. */
export function updateHierarchy(state: BattleState): Mission[] {
  const ai = state.behavior ??= initializeHierarchy(state)
  if (state.time < ai.nextUpdate) return []
  ai.nextUpdate = state.time + .5
  updateBlackboards(state, ai)
  const delivered: Mission[] = []
  for (const u of ordered(state.units.filter(commandable))) {
    const mind = rememberUnit(ai, state, u)
    for (const shot of state.shots.filter(shot => shot.unit === u.id)) mind.lastFiredAt = Math.max(mind.lastFiredAt ?? -Infinity, shot.time)
    mind.factors = updateHumanFactors(u, mind.factors, state.time, mind.contacts, mind.personality)
    const decision = decideSquad(u, mind.factors, mind.personality, mind.contacts, mind.mission, state.time, ai.sides[u.side].doctrine)
    mind.factors.posture = decision.posture
    if (decision.support) mind.supportRequest = { kind: decision.support, since: mind.supportRequest?.kind === decision.support ? mind.supportRequest.since : state.time, expiresAt: state.time + 30 }
    else if (mind.supportRequest && state.time >= mind.supportRequest.expiresAt) mind.supportRequest = undefined
    updateExecution(state, u)
    if (mind.lastDecision !== `${decision.posture}:${decision.hold}:${decision.support}`) {
      trace(ai, { time: state.time, actor: u.id, level: isVehicle(u.role) ? 'unit' : 'squad', decision: decision.posture, reasons: [decision.reason, ...(decision.support ? [`${decision.support} support requested.`] : [])] })
      mind.lastDecision = `${decision.posture}:${decision.hold}:${decision.support}`
    }
  }
  updateReadinessReports(state, ai)
  for (const side of ['BLU', 'RED'] as const) {
    const command = ai.sides[side], own = ordered(state.units.filter(u => u.side === side && commandable(u)))
    if (command.commanderId && !state.units.some(u => u.id === command.commanderId && u.hp > 0 && !u.surrendered && !u.crewBailed)) {
      command.commanderId = own[0]?.id; command.degraded = true; command.nextReview = Math.max(command.nextReview, state.time + 15)
      trace(ai, { time: state.time, actor: side, level: 'commander', decision: 'SUCCESSION', reasons: [`Senior surviving element ${command.commanderId || 'unavailable'}; command disrupted for at least 15 seconds.`] })
    }
    assignFormations(command, own, side)
    initializeEchelons(state, command)
    const reports = ordered(Object.values(command.readiness)), current = reports.filter(r => state.time - r.observedAt <= command.doctrine.reportLifetime)
    const signature = `${current.map(u => u.id).join(',')}|${command.contacts.map(c => c.unitId).join(',')}|${command.objectives.map(o => `${o.owner}:${o.contested}`).join(',')}|${current.filter(u => u.ammo < 12 || u.hp < 25 || u.execution?.status === 'BLOCKED').map(u => u.id).join(',')}`
    const urgent = signature !== command.signature && state.time >= (command.plan?.issuedAt ?? -10) + 8
    if (!command.commanderId || state.time < command.nextReview && (!urgent || command.degraded)) continue
    const plan = planOperation(side, state.time, command)
    if (!plan) continue
    command.plan = plan; command.nextReview = plan.reviewAt; command.signature = signature
    state.forces[side].action = plan.action; state.forces[side].target = plan.target.id; state.forces[side].tempo = command.personality.tempo * 100; state.forces[side].cycles = plan.revision
    trace(ai, { time: state.time, actor: side, level: 'commander', decision: `${plan.posture} ${plan.target.id}`, reasons: plan.reasons, scores: plan.scores })
    if (command.organization) broadcastEchelonIntent(state, command, command.organization.find(n => !n.parentId)!.id, command)
    for (const formation of command.formations.filter(f => !command.echelons?.[f.id])) {
      const missions = decomposeMission(side, state.time, plan, command, formation, own)
      for (const mission of missions) {
        if (supportOwns(command, mission.unitId)) continue
        if (command.echelons) mission.revision = ++command.orderSequence!
        const mind=ai.units[mission.unitId];mission.revision=Math.max(mission.revision,(mind.issuedRevision||0)+1);mind.issuedRevision=mission.revision
        if (!command.communications.available || seeded(state.seed, `order:${mission.unitId}:${mission.revision}`) < command.communications.loss) {
          trace(ai, { time: state.time, actor: mission.issuer, level: 'network', decision: 'ORDER LOST', reasons: [`Revision ${mission.revision} for ${mission.unitId}; previous intent remains in force.`] }); continue
        }
        // Sent orders cannot be recalled instantly. Replacing packets here starves high-latency links.
        ai.orders.push(mission)
        trace(ai, { time: state.time, actor: formation.id, level: 'subcommander', decision: `${mission.task} ${mission.unitId}`, reasons: mission.reasons })
      }
    }
  }
  for (const side of ['BLU', 'RED'] as const) {
    const command=ai.sides[side]
    for(const mission of advanceEchelons(state,command,ordered(state.units.filter(u=>u.side===side&&commandable(u))))) {
      if(supportOwns(command,mission.unitId))continue
      const mind=ai.units[mission.unitId];mission.revision=Math.max(mission.revision,(mind.issuedRevision||0)+1);mind.issuedRevision=mission.revision
      const net=command.echelons?.[mission.issuer]?.command.communications||command.communications
      if(command.communications.available&&net.available&&seeded(state.seed,`order:${mission.unitId}:${mission.revision}`)>=net.loss) ai.orders.push(mission)
      else trace(ai,{time:state.time,actor:mission.issuer,level:'network',decision:'ORDER LOST',reasons:[`Local revision ${mission.revision} for ${mission.unitId}; prior intent preserved.`]})
    }
  }
  for (const side of ['BLU', 'RED'] as const) {
    const command=ai.sides[side]
    for(const mission of allocateSupport(state,command)) {
      const mind=ai.units[mission.unitId];if(!mind)continue
      mission.revision=Math.max(mind.mission?.revision||0,mind.issuedRevision||0)+1;mind.issuedRevision=mission.revision
      const allocation=command.support!.find(a=>a.unitId===mission.unitId&&a.revision===0&&a.assignedAt===state.time)!;allocation.revision=mission.revision
      if(command.communications.available&&seeded(state.seed,`support-order:${mission.unitId}:${mission.revision}`)>=command.communications.loss)ai.orders.push(mission)
    }
  }
  const pending: Mission[] = []
  for (const mission of [...ai.orders].sort((a, b) => a.executeAt - b.executeAt || a.revision - b.revision || a.unitId.localeCompare(b.unitId))) {
    const u = state.units.find(u => u.id === mission.unitId && commandable(u))
    if (!u || state.time > mission.expiresAt) continue
    if (mission.executeAt > state.time || !ai.sides[u.side].communications.available) { pending.push(mission); continue }
    const mind = ai.units[u.id]
    if (!mind.mission || mission.revision > mind.mission.revision) {
      mind.mission = mission
      recordExecution(state, u, mission, 'RECEIVED', 'Order received locally; readiness and route acceptance are still pending.')
      // If several packets arrive together, apply only the newest received revision for this unit.
      const previous = delivered.findIndex(m => m.unitId === u.id)
      if (previous >= 0) delivered.splice(previous, 1)
      delivered.push(mission)
    }
  }
  ai.orders = pending
  for (const u of ordered(state.units.filter(commandable))) {
    const mind = ai.units[u.id]
    if (mind.mission && mind.execution?.status === 'BLOCKED' && state.time >= (mind.execution.retryAt ?? Infinity) && state.time <= mind.mission.expiresAt && !delivered.some(m => m.unitId === u.id)) {
      recordExecution(state, u, mind.mission, 'RECEIVED', 'Retrying a previously blocked mission after the local constraint review interval.')
      delivered.push(mind.mission)
    }
  }
  return delivered
}
