import { AIRBASES, BASES, CATALOG, isAir, isArmored, isVehicle, type BattleState, type Point, type Role, type Stock, type Unit } from './types'
import { distance, travel } from './movement'
import type { Navigation } from './navigation'

export const DT = .05
export function vehicleResources(role: Role) {
  const air = isAir(role), armor = isArmored(role)
  const heavy = ['JET', 'CARGO_PLANE', 'HEAVY_LIFT_HELI'].includes(role)
  return { fuel: heavy ? 2200 : air ? 900 : armor ? 800 : 180,
    ammo: CATALOG[role].power ? (air ? 1200 : armor ? 600 : 100) : 0,
    repair: heavy ? 1600 : air ? 1000 : armor ? 800 : 120,
    burn: role === 'UAV_JAMMER' ? 0 : heavy ? .1 : air ? .08 : armor ? .05 : .032,
    serviceRate: 5 }
}
export const serviceBase = (u: Unit) => isAir(u.role) ? AIRBASES[u.side] : BASES[u.side]
export function missionFuel(u: Unit, destination: Point, via?: Point) {
  const route = (via ? distance(u, via) + distance(via, destination) : distance(u, destination)) + distance(destination, serviceBase(u))
  const seconds = route / Math.max(1, CATALOG[u.role].speed) * (isAir(u.role) ? 1.15 : 1.8) + 120
  return vehicleResources(u.role).burn * seconds + 10
}
export function transferStock(from: Stock, to: Stock, fraction = 1) {
  for (const key of ['fuel', 'ammo', 'repair'] as const) { const amount = from[key] * Math.max(0, Math.min(1, fraction)); from[key] -= amount; to[key] += amount }
}
export function syncDepotTotals(state: BattleState) {
  for (const side of ['BLU', 'RED'] as const) {
    const { airfield, mob } = state.depots[side]
    state.forces[side].fuel = airfield.fuel + mob.fuel
    state.forces[side].ammo = airfield.ammo + mob.ammo
  }
}
export function serviceVehicle(state: BattleState, u: Unit, dt = DT) {
  if (u.external || !isVehicle(u.role) || u.hp <= 0 || u.engine || (u.altitude || 0) > .5 || u.path.length || distance(u, serviceBase(u)) > 110) return false
  const stock = isAir(u.role) ? state.depots[u.side].airfield : state.depots[u.side].mob
  const specs = vehicleResources(u.role), missing: string[] = []
  for (const [gauge, resource] of [['fuel', 'fuel'], ['ammo', 'ammo'], ['hp', 'repair']] as const) {
    const capacity = specs[resource]
    if (!capacity) { if (gauge === 'ammo') u.ammo = 100; continue }
    const percent = Math.min(100 - u[gauge], specs.serviceRate * dt / (resource === 'repair' ? 1 : 3), stock[resource] / capacity * 100)
    stock[resource] = Math.max(0, stock[resource] - percent / 100 * capacity)
    u[gauge] = Math.min(100, u[gauge] + percent)
    if (u[gauge] < 99.99 && stock[resource] < .001) missing.push(resource)
  }
  u.serviceStatus = missing.length ? `WAITING FOR ${missing.join(' / ').toUpperCase()} AT ${isAir(u.role) ? 'AIRFIELD' : 'MOB'}` : 'REPAIR / REFUEL / RESTOCK'
  syncDepotTotals(state)
  return true
}
export function updateVehicleService(state: BattleState, nav: Navigation) {
  for (const u of state.units) {
    u.engine = false
    if (!isVehicle(u.role) || u.external || u.hp <= 0 || u.emergency || u.role === 'UAV_JAMMER') continue
    if (u.role === 'TRANSPORT_HELI' && u.transport?.phase === 'disembarking' && (u.altitude || 0) <= .1 && u.fuel > vehicleResources(u.role).burn * 25) continue
    const armed = vehicleResources(u.role).ammo > 0
    const reserve = vehicleResources(u.role).burn * (distance(u, serviceBase(u)) / Math.max(1, CATALOG[u.role].speed) * (isAir(u.role) ? 1.2 : 1.8) + 45) + 8
    if (u.fuel < reserve || (armed && u.ammo < 12) || u.hp < 65) u.servicing = true
    if (!u.servicing) continue
    const home = serviceBase(u)
    u.target = isAir(u.role) ? 'AIRFIELD' : 'MOB'; u.mission = 'RTB FOR SERVICE'; u.airPhase = 'return'
    if (distance(u, home) > 100 || (u.altitude || 0) > .5) {
      travel(u, distance(u, home) <= 100 ? u : home, nav, state.time, undefined, 0)
      for (const squad of state.units.filter(s => s.carrier === u.id)) { squad.x = u.x; squad.y = u.y; for (const s of squad.soldiers || []) if (s.status === 'active') { s.x = u.x; s.y = u.y } }
      continue
    }
    u.path = []; u.engine = false; u.mission = 'SERVICING'; u.airPhase = 'rearm'
    // Abort reservations safely; only actual passengers disembark here.
    if (u.transport?.passengers?.length) {
      for (const squad of state.units.filter(s => u.transport?.passengers?.includes(s.id))) {
        if (squad.carrier === u.id) { squad.carrier = undefined; Object.assign(squad, home); for (const s of squad.soldiers || []) if (s.status === 'active') Object.assign(s, home) }
        squad.mission = 'HOLD'
      }
      u.transport.passengers = []
    }
    serviceVehicle(state, u)
    if (u.fuel >= 99.99 && (!armed || u.ammo >= 99.99) && u.hp >= 99.99) {
      u.servicing = false; u.serviceStatus = undefined; u.travelStatus = undefined; u.airPhase = 'attack'; u.mission = 'AVAILABLE'; u.path = []
      if (u.transport) { u.transport.phase = u.transport.manifest ? 'delivery' : ['TRANSPORT_HELI', 'TROOP_TRUCK'].includes(u.role) ? 'available' : 'waiting'; u.transport.since = state.time }
    }
  }
}
export function consumeFuel(state: BattleState, dt = DT) {
  for (const u of state.units) {
    if (!isVehicle(u.role) || u.hp <= 0 || u.role === 'UAV_JAMMER') continue
    u.engine = !!u.engine || (u.altitude || 0) > .5 || (u.firing && !u.servicing)
    if (u.engine) u.fuel = Math.max(0, u.fuel - vehicleResources(u.role).burn * dt)
    if (u.fuel > 0) continue
    if (u.emergency || (u.altitude || 0) > .5) { u.emergency = true; u.mission = 'EMERGENCY DESCENT'; u.path = []; u.altitude = Math.max(0, (u.altitude || 0) - 12 * dt); if (u.altitude === 0) { if (!u.external) state.forces[u.side].casualties += u.members; u.hp = 0; u.members = 0 } }
    else if (!u.servicing) { u.engine = false; u.travelStatus = 'OUT OF FUEL'; u.path = []; if (u.external) { u.hp = 0; u.members = 0 } }
  }
}
