import { AIRBASES, BASES, CATALOG, isNaval, isAir, isArmored, isVehicle, troopSeats, type BattleState, type Point, type Role, type Side, type Stock, type Unit } from './types'
import { distance, travel } from './movement'
import type { Navigation } from './navigation'
import { nearestObjectiveService, nearestOperationalObjectiveService, objectiveCanService, objectiveFacilityPoint } from './objective-logistics'

export const DT = .05
export const FUEL_RESERVE_PERCENT = 15
export const OPERATIONAL_RANGE_METERS: Partial<Record<Role, number>> = {
  TRUCK: 260000, TROOP_TRUCK: 260000, FORKLIFT: 40000,
  APC: 180000, CANNON_APC: 180000, IFV: 180000, TANK: 140000,
  TRANSPORT_HELI: 280000, HEAVY_LIFT_HELI: 260000, ATTACK_HELI: 220000,
  RECON_UAV: 240000, CAS_FIGHTER: 600000, JET: 600000, CARGO_PLANE: 800000,
}
export const commissioningFuelPercent = (role: Role) => isAir(role) ? 40 : 25
export function vehicleResources(role: Role) {
  const air = isAir(role), armor = isArmored(role)
  const heavy = ['JET', 'CARGO_PLANE', 'HEAVY_LIFT_HELI'].includes(role)
  const range = OPERATIONAL_RANGE_METERS[role] || 100000
  return { fuel: heavy ? 2200 : air ? 900 : armor ? 800 : 180,
    ammo: CATALOG[role].power ? (air ? 1200 : armor ? 600 : 100) : 0,
    repair: heavy ? 1600 : air ? 1000 : armor ? 800 : 120,
    burn: role === 'UAV_JAMMER' ? 0 : CATALOG[role].speed / range * 100,
    serviceRate: 5 }
}
export const serviceBase = (u: Unit, state?: BattleState, from: Point = u) => {
  const base = isAir(u.role) ? AIRBASES[u.side] : BASES[u.side]
  if (!state) return base
  const specs = vehicleResources(u.role)
  const forward = nearestObjectiveService(state, u, from, {fuel: specs.fuel * .25, repair: 0})
  return forward && distance(from, forward) < distance(from, base) ? objectiveFacilityPoint(forward, isAir(u.role) ? 'helipad' : 'vehicleBay') : base
}
export function missionFuel(u: Unit, destination: Point, via?: Point, state?: BattleState) {
  const recovery = serviceBase(u, state, destination)
  const route = (via ? distance(u, via) + distance(via, destination) : distance(u, destination)) + distance(destination, recovery)
  const seconds = route / Math.max(1, CATALOG[u.role].speed) * (isAir(u.role) ? 1.08 : 1.35) + 60
  return vehicleResources(u.role).burn * seconds + FUEL_RESERVE_PERCENT
}
export function authorizeMissionFuel(u: Unit, destination: Point, via?: Point, state?: BattleState) {
  const required = missionFuel(u, destination, via, state)
  if (required > 100) return { ok: false, required, reason: 'route exceeds safe operational range; establish and stock forward service' }
  if (u.fuel + .001 < required) return { ok: false, required, reason: `mission requires ${Math.ceil(required)}% fuel including ${FUEL_RESERVE_PERCENT}% recovery reserve` }
  return { ok: true, required, reason: '' }
}
export function commitMissionFuel(u: Unit, target: string, required: number, time: number) { u.fuelCommitment = { target, required, reservedAt: time } }
export function fuelOnHand(state: BattleState, side: Side) {
  const depot = state.depots[side]
  return depot.airfield.fuel + depot.pending.fuel + depot.mob.fuel + state.objectives.filter(o => o.owner === side).reduce((n, o) => n + o.stock.fuel, 0)
}
export function inboundFuel(state: BattleState, side: Side) {
  return state.units.filter(u => u.side === side && u.external && u.hp > 0).reduce((n, u) => n + (u.transport?.manifest?.fuel || 0), 0)
}
export function commissioningFuelStock(role: Role) {
  const specs = vehicleResources(role)
  return specs.fuel * (1 - commissioningFuelPercent(role) / 100)
}
export function fuelEconomy(state: BattleState, side: Side, queued: Role[] = [], candidate?: Role) {
  const own = state.units.filter(u => u.side === side && u.hp > 0 && isVehicle(u.role) && !u.external)
  const service = own.reduce((n, u) => n + (u.servicing ? Math.max(0, 100 - u.fuel) / 100 * vehicleResources(u.role).fuel : 0), 0)
  const queuedFuel = queued.reduce((n, role) => n + commissioningFuelStock(role), 0)
  const protectedFuel = 400 + own.reduce((n, u) => n + vehicleResources(u.role).fuel * (['TRUCK','TROOP_TRUCK','TRANSPORT_HELI','HEAVY_LIFT_HELI'].includes(u.role) ? .18 : .06), 0)
  const candidateFuel = candidate ? commissioningFuelStock(candidate) + vehicleResources(candidate).fuel * FUEL_RESERVE_PERCENT / 100 : 0
  const depot=state.depots[side],baseOnHand=depot.airfield.fuel+depot.pending.fuel+depot.mob.fuel,onHand=fuelOnHand(state,side),forwardFuel=onHand-baseOnHand
  const inbound = inboundFuel(state, side), committed = service + queuedFuel
  return { onHand, baseOnHand, forwardFuel, inbound, committed, protectedFuel, candidateFuel, available: baseOnHand + inbound - committed - protectedFuel - candidateFuel }
}
export function transferStock(from: Stock, to: Stock, fraction = 1) {
  for (const key of ['fuel', 'ammo', 'repair'] as const) { const amount = from[key] * Math.max(0, Math.min(1, fraction)); from[key] -= amount; to[key] += amount }
}
export function syncDepotTotals(state: BattleState) {
  for (const side of ['BLU', 'RED'] as const) {
    const { airfield, mob } = state.depots[side]
    state.forces[side].fuel = airfield.fuel + mob.fuel + state.objectives.filter(o=>o.owner===side).reduce((n,o)=>n+(o.stock?.fuel||0),0)
    state.forces[side].ammo = airfield.ammo + mob.ammo + state.objectives.filter(o=>o.owner===side).reduce((n,o)=>n+(o.stock?.ammo||0),0)
  }
}
function releaseForwardService(state: BattleState, u: Unit) {
  if(!u.serviceObjective)return
  const facility=state.objectives.find(o=>o.id===u.serviceObjective)?.facilities[isAir(u.role)?'helipad':'vehicleBay']
  if(facility?.occupant===u.id)facility.occupant=undefined
  u.serviceObjective=undefined
}
export function serviceVehicle(state: BattleState, u: Unit, dt = DT) {
  const objective = u.serviceObjective ? state.objectives.find(o => o.id === u.serviceObjective && objectiveCanService(o, u)) : undefined
  const site = objective ? objectiveFacilityPoint(objective, isAir(u.role) ? 'helipad' : 'vehicleBay') : serviceBase(u)
  if (u.external || !isVehicle(u.role) || u.hp <= 0 || u.engine || (u.altitude || 0) > .5 || u.path.length || distance(u, site) > (objective ? 45 : 110)) return false
  const stock = objective ? objective.stock : isAir(u.role) ? state.depots[u.side].airfield : state.depots[u.side].mob
  const specs = vehicleResources(u.role), missing: string[] = []
  for (const [gauge, resource] of [['fuel', 'fuel'], ['ammo', 'ammo'], ['hp', 'repair']] as const) {
    if (objective && resource === 'ammo') continue
    const capacity = specs[resource]
    if (!capacity) { if (gauge === 'ammo') u.ammo = 100; continue }
    const percent = Math.min(100 - u[gauge], specs.serviceRate * dt / (resource === 'repair' ? 1 : 3), stock[resource] / capacity * 100)
    stock[resource] = Math.max(0, stock[resource] - percent / 100 * capacity)
    u[gauge] = Math.min(100, u[gauge] + percent)
    if (u[gauge] < 99.99 && stock[resource] < .001) missing.push(resource)
  }
  const label = objective ? `OBJECTIVE ${objective.id}` : isAir(u.role) ? 'AIRFIELD' : 'MOB'
  u.serviceStatus = missing.length ? `WAITING FOR ${missing.join(' / ').toUpperCase()} AT ${label}` : objective ? `FORWARD REPAIR / REFUEL · ${label}` : 'REPAIR / REFUEL / RESTOCK'
  syncDepotTotals(state)
  return true
}
export function updateVehicleService(state: BattleState, nav: Navigation) {
  for (const u of state.units) {
    u.engine = false
    if (isNaval(u.role) || u.crewBailed || u.deployment || !isVehicle(u.role) || u.external || u.hp <= 0 || u.emergency || u.role === 'UAV_JAMMER') continue
    if (u.role === 'TRANSPORT_HELI' && u.transport?.phase === 'disembarking' && (u.altitude || 0) <= .1 && u.fuel > vehicleResources(u.role).burn * 25) continue
    const specs = vehicleResources(u.role), armed = specs.ammo > 0
    const required = {fuel: Math.max(specs.fuel * .15, (100 - u.fuel) / 100 * specs.fuel), repair: (100 - u.hp) / 100 * specs.repair}
    if (u.serviceObjective && !state.objectives.some(o => o.id === u.serviceObjective && objectiveCanService(o, u))) releaseForwardService(state,u)
    const fixedBase = isAir(u.role) ? AIRBASES[u.side] : BASES[u.side]
    const lockedForward = u.serviceObjective ? state.objectives.find(o=>o.id===u.serviceObjective&&objectiveCanService(o,u)) : undefined
    const forward = lockedForward || nearestObjectiveService(state, u, u, required)
    const forwardPoint = forward ? objectiveFacilityPoint(forward, isAir(u.role) ? 'helipad' : 'vehicleBay') : undefined
    const home = u.serviceObjective && forward?.id === u.serviceObjective && forwardPoint ? forwardPoint : forwardPoint && distance(u,forwardPoint)<distance(u,fixedBase) ? forwardPoint : fixedBase
    const reserve = vehicleResources(u.role).burn * (distance(u, home) / Math.max(1, CATALOG[u.role].speed) * (isAir(u.role) ? 1.2 : 1.8) + 45) + 8
    const baseReserve = vehicleResources(u.role).burn * (distance(u, fixedBase) / Math.max(1, CATALOG[u.role].speed) * (isAir(u.role) ? 1.2 : 1.8) + 45) + 8
    if (u.fuel < reserve || (armed && u.ammo < 12) || u.hp < 65) u.servicing = true
    if (!u.servicing) continue
    u.fuelCommitment = undefined
    if(!u.serviceObjective&&forward&&forwardPoint&&distance(u,forwardPoint)<distance(u,fixedBase)){u.serviceObjective=forward.id;forward.facilities[isAir(u.role)?'helipad':'vehicleBay']!.occupant=u.id}
    if(!u.serviceObjective&&u.fuel<baseReserve){const fallback=nearestOperationalObjectiveService(state,u);if(fallback){const point=objectiveFacilityPoint(fallback,isAir(u.role)?'helipad':'vehicleBay');if(distance(u,point)<distance(u,fixedBase)){u.serviceObjective=fallback.id;fallback.facilities[isAir(u.role)?'helipad':'vehicleBay']!.occupant=u.id}}}
    const objective = u.serviceObjective ? state.objectives.find(o => o.id === u.serviceObjective && objectiveCanService(o, u)) : undefined
    const destination = objective ? objectiveFacilityPoint(objective, isAir(u.role) ? 'helipad' : 'vehicleBay') : fixedBase
    if (!objective) releaseForwardService(state,u)
    u.target = objective ? `OBJECTIVE ${objective.id}` : isAir(u.role) ? 'AIRFIELD' : 'MOB'; u.mission = 'RTB FOR SERVICE'; u.airPhase = 'return'
    if (distance(u, destination) > (objective ? 38 : 100) || (u.altitude || 0) > .5) {
      travel(u, distance(u, destination) <= (objective ? 38 : 100) ? u : destination, nav, state.time, undefined, 0)
      for (const squad of state.units.filter(s => s.carrier === u.id)) { squad.x = u.x; squad.y = u.y; for (const s of squad.soldiers || []) if (s.status === 'active') { s.x = u.x; s.y = u.y } }
      continue
    }
    u.path = []; u.engine = false; u.mission = 'SERVICING'; u.airPhase = 'rearm'
    // Abort reservations safely; only actual passengers disembark here.
    if (u.transport?.passengers?.length) {
      for (const squad of state.units.filter(s => u.transport?.passengers?.includes(s.id))) {
        if (squad.carrier === u.id) { squad.carrier = undefined; Object.assign(squad, destination); for (const s of squad.soldiers || []) if (s.status === 'active') Object.assign(s, destination) }
        squad.mission = 'HOLD'
      }
      u.transport.passengers = []
    }
    serviceVehicle(state, u)
    if (u.fuel >= 99.99 && (objective || !armed || u.ammo >= 99.99) && u.hp >= 99.99) {
      u.servicing = false; releaseForwardService(state,u); u.serviceStatus = undefined; u.travelStatus = undefined; u.airPhase = 'attack'; u.mission = 'AVAILABLE'; u.path = []
      if (u.transport) {
        const retry = u.transport.manual && u.transport.phase === 'return' && state.units.find(s => s.id === u.attachedSquad && s.hp > 0)
        if (retry) u.transport.passengers = [retry.id]
        u.transport.phase = retry ? 'pickup' : u.attachedSquad ? 'escort' : u.transport.manifest ? 'delivery' : troopSeats(u.role) ? 'available' : 'waiting'; u.transport.since = state.time
      }
    }
  }
}
export function consumeFuel(state: BattleState, dt = DT) {
  for (const u of state.units) {
    if (!isVehicle(u.role) || u.hp <= 0 || u.role === 'UAV_JAMMER') continue
    u.engine = !!u.engine || (u.altitude || 0) > .5 || (u.firing && !u.servicing)
    // Scheduled theater trucks are the airfield-to-MOB supply service. They
    // remain animated but do not consume the supplies they are delivering.
    if (u.external && u.role === 'TRUCK') continue
    if (u.engine) u.fuel = Math.max(0, u.fuel - vehicleResources(u.role).burn * dt)
    if (u.fuel > 0) continue
    if (u.emergency || (u.altitude || 0) > .5) { u.emergency = true; u.mission = 'EMERGENCY DESCENT'; u.path = []; u.altitude = Math.max(0, (u.altitude || 0) - 12 * dt); if (u.altitude === 0) { if (!u.external) state.forces[u.side].casualties += u.members; u.hp = 0; u.members = 0 } }
    else if (!u.servicing) { u.engine = false; u.travelStatus = 'OUT OF FUEL'; u.path = []; if (u.external) { u.hp = 0; u.members = 0 } }
  }
}
