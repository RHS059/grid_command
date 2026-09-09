import { isVehicle, type BattleState, type Unit } from '../types'
import { commandable, distance, ordered, seeded, trace, type HierarchyState, type Mission, type MissionExecution, type ReadinessReport, type UnitMind } from './model'
import { commandDelay } from './organization'

export function readinessSnapshot(unit: Unit, time: number, mind?: UnitMind): ReadinessReport {
  return { id: unit.id, role: unit.role, hp: unit.hp, ammo: unit.ammo, fuel: unit.fuel, morale: mind?.factors.morale ?? .8,
    position: { x: unit.x, y: unit.y }, ...(mind?.lastFiredAt !== undefined ? { lastFiredAt: mind.lastFiredAt } : {}),
    available: !unit.maritime?.passengers.length && !unit.servicing && !unit.emergency && !unit.deployment && !unit.carrier && !unit.attachedSquad,
    observedAt: time, ...(mind?.execution ? { execution: { ...mind.execution } } : {}),
    ...(mind?.supportRequest ? { supportRequest: { ...mind.supportRequest } } : {}) }
}

/** A local observation of execution, not an omniscient acknowledgement at higher command. */
export function recordExecution(state: BattleState, unit: Unit, mission: Mission, status: MissionExecution['status'], reason: string, retryAt?: number) {
  const ai = state.behavior, mind = ai?.units[unit.id]
  if (!ai || !mind || mind.mission?.revision !== mission.revision) return
  if (mind.execution?.revision === mission.revision && mind.execution.status === status && mind.execution.reason === reason) return
  mind.execution = { revision: mission.revision, target: mission.target, task: mission.task, status, reason, changedAt: state.time,
    sequence: mind.execution?.revision === mission.revision ? mind.execution.sequence + 1 : 0, ...(retryAt !== undefined ? { retryAt } : {}) }
  trace(ai, { time: state.time, actor: unit.id, level: isVehicle(unit.role) ? 'unit' : 'squad', decision: `MISSION ${status}`, reasons: [`Revision ${mission.revision}: ${reason}`] })
}

/** Reports are retried periodically. Old packets stay in flight when a newer sample is sent. */
export function updateReadinessReports(state: BattleState, ai: HierarchyState) {
  for (const unit of ordered(state.units.filter(commandable))) {
    const mind = ai.units[unit.id]
    if (!mind) continue
    const report = readinessSnapshot(unit, state.time, mind), command = ai.sides[unit.side]
    const signature = `${report.execution?.revision}:${report.execution?.sequence}:${report.supportRequest?.kind}`
    const elapsed = state.time - (mind.lastStatusAt ?? -Infinity)
    if (elapsed < .5 || elapsed < 5 && signature === mind.lastStatusSignature) continue
    mind.lastStatusAt = state.time; mind.lastStatusSignature = signature
    if (!command.communications.available || seeded(state.seed, `status:${unit.side}:${unit.id}:${state.time}`) < command.communications.loss) continue
    ai.statusReports.push({ side: unit.side, due: state.time + commandDelay(command, unit.id), report })
    const path = command.formations.find(f => f.unitIds.includes(unit.id))?.commandPath || []
    for (const node of Object.values(command.echelons || {}).filter(n => n.unitIds.includes(unit.id))) {
      const hops = Math.max(1, path.length - path.indexOf(node.id))
      if (node.command.communications.available && seeded(state.seed, `node-status:${node.id}:${unit.id}:${state.time}`) >= node.command.communications.loss)
        (command.echelonStatusReports ??= []).push({ target: node.id, due: state.time + hops * Math.max(0, node.command.communications.delay) * (node.command.degraded ? 2 : 1), report: structuredClone(report) })
    }
  }
  for (const packet of ai.statusReports.filter(p => p.due <= state.time)) {
    const command = ai.sides[packet.side], previous = command.readiness[packet.report.id]
    if (!command.communications.available || state.time - packet.report.observedAt > command.doctrine.reportLifetime || previous && previous.observedAt >= packet.report.observedAt) continue
    command.readiness[packet.report.id] = packet.report
    const execution = packet.report.execution
    if (execution && (execution.revision !== previous?.execution?.revision || execution.sequence !== previous?.execution?.sequence))
      trace(ai, { time: state.time, actor: packet.side, level: 'commander', decision: `REPORT ${execution.status}`, reasons: [`${packet.report.id}, revision ${execution.revision}, observed ${packet.report.observedAt.toFixed(1)}: ${execution.reason}`] })
  }
  ai.statusReports = ai.statusReports.filter(p => p.due > state.time && state.time - p.report.observedAt <= ai.sides[p.side].doctrine.reportLifetime)
}

/** Completion requires a local observable result. Reaching an assault point does not itself capture it. */
export function updateExecution(state: BattleState, unit: Unit) {
  const mind = state.behavior?.units[unit.id], mission = mind?.mission
  if (!mind || !mission || ['COMPLETED', 'EXPIRED'].includes(mind.execution?.status ?? '')) return
  if (state.time > mission.expiresAt) {
    recordExecution(state, unit, mission, 'EXPIRED', 'Intent expired before a verified completion.'); return
  }
  if (mind.execution?.status !== 'ACCEPTED') return
  if (mission.naval) return
  const arrived = distance(unit, mission.destination) <= 50
  const objective = state.objectives.find(o => o.id === mission.target)
  if (mission.task === 'ASSAULT' && objective && distance(unit, objective) <= 180 && objective.owner === unit.side && !objective.contested)
    recordExecution(state, unit, mission, 'COMPLETED', 'Locally observed friendly control of the uncontested objective.')
  else if (mission.task === 'RECON' && arrived)
    recordExecution(state, unit, mission, 'COMPLETED', 'Reached the assigned reconnaissance position; no claim that the area is enemy-free.')
  else if (mission.task === 'WITHDRAW' && arrived)
    recordExecution(state, unit, mission, 'COMPLETED', 'Reached the assigned withdrawal position.')
  else if (mission.task === 'RESUPPLY' && unit.ammo >= 80 && unit.hp >= 65 && (!isVehicle(unit.role) || unit.fuel >= 80 && !unit.servicing))
    recordExecution(state, unit, mission, 'COMPLETED', 'Local ammunition and health are restored; vehicles also meet fuel and service thresholds.')
}
