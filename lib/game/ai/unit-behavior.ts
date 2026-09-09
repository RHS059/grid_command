import { BASES, isAir, type ContactMemory, type Point, type Unit } from '../types'
import { distance, type HumanFactors, type Mission, type Personality } from './model'

export interface UnitDecision { action: 'CONTINUE' | 'HOLD' | 'RETREAT' | 'SERVICE'; destination?: Point; reason: string }
export function decideIndependentUnit(unit: Unit, p: Personality, factors: HumanFactors, contacts: ContactMemory[], mission?: Mission): UnitDecision {
  if (unit.emergency || unit.servicing || unit.deployment || unit.carrier || unit.crewBailed || unit.transport && !['available', 'escort'].includes(unit.transport.phase))
    return { action: 'CONTINUE', reason: 'Dedicated emergency, service or transport controller owns movement.' }
  if (unit.fuel <= 0) return { action: 'HOLD', reason: 'Fuel exhausted; request recovery without granting free mobility.' }
  if (unit.fuel < 18 || unit.ammo < 12 || unit.hp < 25) return { action: 'SERVICE', destination: BASES[unit.side], reason: 'Local endurance or damage threshold requires service.' }
  const threats = contacts.filter(c => c.confidence > .4 && distance(c.position, unit) < 600)
  const airDefense = isAir(unit.role) && threats.some(c => c.role === 'AA_TEAM')
  const vulnerable = ['RECON_UAV', 'TRUCK', 'TROOP_TRUCK', 'APC'].includes(unit.role)
  if (factors.posture !== 'STEADY' || airDefense && p.risk < .8 || vulnerable && threats.length > 0 && p.risk < .65)
    return { action: 'RETREAT', destination: BASES[unit.side], reason: airDefense ? 'Reported air-defense threat exceeds aircrew risk threshold.' : 'Role vulnerability or crew morale requires disengagement.' }
  if (mission?.task === 'RESERVE') return { action: 'HOLD', reason: 'Preserve the assigned reserve until released.' }
  return { action: 'CONTINUE', reason: 'Continue intent within local survivability constraints.' }
}
