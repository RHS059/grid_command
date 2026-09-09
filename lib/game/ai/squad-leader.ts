import type { ContactMemory, Unit } from '../types'
import { clamp, distance, type Doctrine, type HumanFactors, type Mission, type Personality } from './model'

export function updateHumanFactors(unit: Unit, old: HumanFactors, time: number, contacts: ContactMemory[], personality: Personality): HumanFactors {
  const dt = Math.max(0, time - old.updatedAt), suppression = clamp(unit.suppression || 0)
  const losses = Math.max(0, old.lastHp - unit.hp) / 100
  const pressure = contacts.filter(c => distance(c.position, unit) < 350).reduce((n, c) => n + c.confidence, 0)
  const fatigue = clamp(old.fatigue + dt * (unit.path.length ? .001 : -.002))
  const cohesion = clamp(old.cohesion - losses * .35 + dt * (suppression < .2 ? .0006 : -.0006))
  const morale = clamp(old.morale - losses * (.7 - personality.experience * .25) + dt *
    (.0015 * cohesion - suppression * .006 - Math.min(4, pressure) * .0005 - (unit.ammo < 12 ? .0015 : 0) - fatigue * .0006))
  return { ...old, morale, cohesion, fatigue, suppression, lastHp: unit.hp, updatedAt: time }
}

export interface SquadDecision { posture: HumanFactors['posture']; hold: boolean; initiative: number; reason: string; support?: 'FIRE' | 'AMMO' | 'MEDICAL' }
export function decideSquad(unit: Unit, factors: HumanFactors, p: Personality, contacts: ContactMemory[], mission: Mission | undefined, time: number, doctrine: Doctrine): SquadDecision {
  const close = contacts.filter(c => c.confidence > .3 && distance(c.position, unit) < 120)
  const pressure = close.reduce((n, c) => n + c.confidence, 0)
  const moraleThreshold = .27 - p.risk * .12
  let posture: HumanFactors['posture'] = 'STEADY'
  if (factors.posture === 'SURRENDER') posture = 'SURRENDER'
  else if (factors.morale < .09 && pressure >= 3 && unit.ammo < 8 && doctrine.surrender) posture = 'SURRENDER'
  else if (factors.morale < .12 && factors.suppression > .7 && pressure > 0) posture = 'ROUT'
  else if (factors.morale < moraleThreshold || factors.suppression > .82 + p.risk * .1 || unit.hp < 22) posture = 'WITHDRAW'
  // Recovery hysteresis prevents morale oscillation from flipping behavior every update.
  else if (['WITHDRAW', 'ROUT'].includes(factors.posture) && (factors.morale < .4 || factors.suppression > .35)) posture = 'WITHDRAW'
  const expired = !mission || time > mission.expiresAt
  const initiative = Math.min(p.initiative, mission?.initiative ?? 0) * factors.cohesion
  const hold = posture === 'STEADY' && (mission?.task === 'RESERVE' || expired && initiative < .4)
  return { posture, hold, initiative,
    reason: `${posture}: morale ${factors.morale.toFixed(2)}, suppression ${factors.suppression.toFixed(2)}, risk ${p.risk.toFixed(2)}; ${expired ? 'command intent absent or expired' : `intent ${mission.task}`}.`,
    support: unit.hp < 40 ? 'MEDICAL' : unit.ammo < 20 ? 'AMMO' : pressure >= 2 ? 'FIRE' : undefined }
}
