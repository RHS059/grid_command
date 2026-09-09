import { BASES, isVehicle, type Side } from '../types'
import { clamp, distance, ordered, type CommandState, type OperationalPlan, type ReadinessReport } from './model'
import { updateOpponentModel } from './opponent'
import { allocateFronts } from './fronts'

// Deliberately receives only own readiness and the commander's received world model.
export function planOperation(side: Side, time: number, command: CommandState): OperationalPlan | undefined {
  if (!command.objectives.length) return undefined
  updateOpponentModel(command, time)
  const own = ordered(Object.values(command.readiness))
  const current = own.filter(u => time - u.observedAt <= command.doctrine.reportLifetime)
  const p = command.personality, average = (fn: (u: ReadinessReport) => number) => own.length ? own.reduce((sum, u) => sum + fn(u), 0) / own.length : 0
  const calibration = command.doctrine.decisionProfile ?? {id:'game-default-v1',threatWeight:1,distanceWeight:1,recoveryThreshold:.4,defenseThreshold:.58,reviewMin:20,reviewMax:45}
  const readiness = average(u => {
    const confidence = clamp(1 - Math.max(0, time - u.observedAt) / command.doctrine.reportLifetime)
    const reported = (u.hp / 100 + u.ammo / 100 + u.morale + (isVehicle(u.role) ? u.fuel / 100 : 1)) / 4 * (u.available ? 1 : .5)
    return reported * confidence + .35 * (1 - confidence)
  })
  const scores: Record<string, number> = {}
  for (const objective of command.objectives) {
    const threat = command.contacts.filter(c => distance(c.position, objective) < 500).reduce((sum, c) => sum + c.confidence * (command.opponent?.[c.unitId]?.credibility ?? 1), 0)
    scores[objective.id] = 100 - distance(BASES[side], objective) / 100 * calibration.distanceWeight - threat * (25 - p.risk * 18) * calibration.threatWeight
      + (objective.owner === side ? -100 : 0) + (objective.contested ? 15 : 0)
      + (objective.id === command.plan?.target.id ? 12 * p.consistency : 0)
      - current.filter(u => u.execution?.target === objective.id && u.execution.status === 'BLOCKED' && (u.execution.retryAt ?? Infinity) > time).length * 100
  }
  const target = [...command.objectives].sort((a, b) => scores[b.id] - scores[a.id] || (a.id < b.id ? -1 : 1))[0]
  const defensiveThreat = command.contacts.some(c => c.confidence > .3 && distance(c.position, BASES[side]) < 400)
  const posture = readiness < calibration.recoveryThreshold ? 'RECOVER' : defensiveThreat || readiness < calibration.defenseThreshold - p.risk * .15 ? 'DEFEND' : 'ADVANCE'
  const action = posture === 'RECOVER' ? 'RESUPPLY' : posture === 'DEFEND' ? 'ASSEMBLE' : command.contacts.length === 0 ? 'MASS' : p.initiative > .6 && p.risk > .45 ? 'FLANK' : 'SEIZE'
  const maneuver = current.filter(u => ['RIFLE', 'AT', 'TANK', 'APC', 'CANNON_APC', 'IFV'].includes(u.role))
  const fraction = Math.min(.5, command.doctrine.reserveFraction * (.5 + p.reserve))
  // Release the reserve on a reported base threat. Small forces keep a usable maneuver element.
  const reserveCount = defensiveThreat ? 0 : maneuver.length < 4 ? 0 : Math.max(1, Math.floor(maneuver.length * fraction))
  const reasons = [`Readiness ${readiness.toFixed(2)}; risk tolerance ${p.risk.toFixed(2)}.`, `${command.contacts.length} received contacts; ${reserveCount} maneuver elements held in reserve.`]
  reasons.push(`Decision profile ${calibration.id}; game parameters require scenario evidence, not a claim of empirical military calibration.`)
  reasons.push(`${current.length}/${own.length} status reports current; stale readiness trends toward uncertainty, not confirmed destruction.`)
  if (defensiveThreat) reasons.push('Reported threat near command post triggers reserve release.')
  if (command.degraded) reasons.push('Command succession reduces planning tempo and delegation confidence.')
  const plan: OperationalPlan = { revision: (command.plan?.revision || 0) + 1, target, action, posture, reserveIds: reserveCount ? maneuver.slice(maneuver.length - reserveCount).map(u => u.id) : [], issuedAt: time, expiresAt:time+command.doctrine.orderLifetime,
    reviewAt: time + (calibration.reviewMax - p.tempo * (calibration.reviewMax-calibration.reviewMin)) * (command.degraded ? 2 : 1), reasons, scores }
  allocateFronts(command,plan)
  return plan
}
