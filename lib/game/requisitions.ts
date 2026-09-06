import { AIRFIELD_TIERS, CATALOG, type AirfieldTier, type BattleState, type Role, type Side } from './types'
export interface Requisition { side: Side; role: Role; due: number }
export function startAirfieldUpgrade(state: BattleState, side: Side) {
  const field = state.airfields[side], force = state.forces[side]
  if (field.tier === 3 || field.upgrade) return false
  const tier = (field.tier + 1) as AirfieldTier, specs = AIRFIELD_TIERS[tier]
  if (force.sp < specs.cost + 200) return false
  force.sp -= specs.cost
  field.upgrade = { tier, due: state.time + specs.buildSeconds }
  force.purchase = `AIRFIELD TIER ${tier} · ${specs.cost} SP · upgrading`
  return true
}
export function nextPurchase(state: BattleState, side: Side, pending: Requisition[]): Role | 'AIRFIELD_UPGRADE' | null {
  const own = state.units.filter(u => u.side === side && u.hp > 0 && !u.external)
  const count = (roles: Role[]) => own.filter(u => roles.includes(u.role)).length + pending.filter(d => d.side === side && roles.includes(d.role)).length
  const field = state.airfields[side], f = state.forces[side]
  let role: Role | undefined
  if (count(['RIFLE']) < 3) role = 'RIFLE'
  else if (count(['TROOP_TRUCK']) < 2) role = 'TROOP_TRUCK'
  else if (field.tier < 3) {
    if (field.upgrade) { f.purchase = `AIRFIELD TIER ${field.upgrade.tier} · ${Math.max(0, Math.ceil(field.upgrade.due - state.time))}s remaining`; return null }
    const tier = (field.tier + 1) as AirfieldTier, cost = AIRFIELD_TIERS[tier].cost
    if (f.sp < cost + 200) { f.purchase = `Saving for AIRFIELD TIER ${tier} · ${cost} SP + 200 reserve`; return null }
    return 'AIRFIELD_UPGRADE'
  } else if (count(['RIFLE']) < 6) role = 'RIFLE'
  else if (count(['MG']) < 1) role = 'MG'
  else if (count(['AA_TEAM']) < 1) role = 'AA_TEAM'
  else role = (['APC', 'TRANSPORT_HELI', 'TANK', 'CAS_FIGHTER', 'ATTACK_HELI', 'JET', 'IFV', 'HEAVY_LIFT_HELI'] as Role[]).find(r => count([r]) === 0)
  if (!role || f.queue >= 4) return null
  if (f.sp < CATALOG[role].cost + 200) { f.purchase = `Saving for ${role.replaceAll('_', ' ')} · ${CATALOG[role].cost.toLocaleString()} SP + 200 reserve`; return null }
  return role
}
