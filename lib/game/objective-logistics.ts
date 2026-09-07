import { BASES, emptyStock, isAir, isVehicle, stockTotal, type BattleState, type Objective, type ObjectiveFacilityKind, type Point, type Side, type Stock, type Unit } from './types'
import { distance, travel } from './movement'
import type { Navigation } from './navigation'

export const OBJECTIVE_STOCK_CAPS = { fuel: 1800, repair: 1200, ammo: 600 } as const
export const OBJECTIVE_STOCK_TOTAL_CAP = OBJECTIVE_STOCK_CAPS.fuel + OBJECTIVE_STOCK_CAPS.repair + OBJECTIVE_STOCK_CAPS.ammo
// Backward-compatible UI average; per-resource enforcement uses OBJECTIVE_STOCK_CAPS.
export const OBJECTIVE_STOCK_CAP = OBJECTIVE_STOCK_TOTAL_CAP / 3
export const OBJECTIVE_TRUCK_CAPACITY = 900
export const OBJECTIVE_FACILITIES = {
  helipad: { cost: 500, buildSeconds: 45, offset: { x: -30, y: 12 } },
  vehicleBay: { cost: 650, buildSeconds: 60, offset: { x: 32, y: 12 } },
} as const

const helicopter = (u: Unit) => ['ATTACK_HELI', 'TRANSPORT_HELI', 'HEAVY_LIFT_HELI'].includes(u.role)
export const objectiveFacilityPoint = (objective: Objective, kind: ObjectiveFacilityKind): Point => ({ x: objective.x + OBJECTIVE_FACILITIES[kind].offset.x, y: objective.y + OBJECTIVE_FACILITIES[kind].offset.y })
export const usableObjectiveFacility = (objective: Objective, side: Side, kind: ObjectiveFacilityKind) => objective.owner === side && !objective.contested && !!objective.facilities[kind] && !objective.facilities[kind]!.construction && objective.facilities[kind]!.hp >= 40
export const objectiveCanService = (objective: Objective, u: Unit) => { const facility=objective.facilities[isAir(u.role)?'helipad':'vehicleBay']; return isVehicle(u.role) && usableObjectiveFacility(objective, u.side, isAir(u.role) ? 'helipad' : 'vehicleBay') && (!facility?.occupant || facility.occupant===u.id) && (isAir(u.role) ? helicopter(u) : true) }

export function ensureObjectiveLogistics(state: BattleState) {
  for (const objective of state.objectives) {
    objective.stock ??= emptyStock()
    objective.facilities ??= {}
    for (const key of ['fuel', 'ammo', 'repair'] as const) objective.stock[key] = Math.max(0, Math.min(OBJECTIVE_STOCK_CAPS[key], objective.stock[key] || 0))
    for(const facility of Object.values(objective.facilities))if(facility?.occupant&&!state.units.some(u=>u.id===facility.occupant&&u.hp>0&&u.serviceObjective===objective.id))facility.occupant=undefined
  }
}

export function nearestObjectiveService(state: BattleState, u: Unit, from: Point = u, required: Pick<Stock,'fuel'|'repair'> = {fuel: 1, repair: 1}) {
  ensureObjectiveLogistics(state)
  const needsAmmo = u.ammo < 12
  if (needsAmmo) return undefined // Forward sites provide fuel and repair only.
  return state.objectives.filter(o => objectiveCanService(o, u) && o.stock.fuel + .001 >= required.fuel && o.stock.repair + .001 >= required.repair)
    .sort((a, b) => distance(from, a) - distance(from, b) || a.id.localeCompare(b.id))[0]
}
export function nearestOperationalObjectiveService(state: BattleState, u: Unit, from: Point = u) {
  ensureObjectiveLogistics(state)
  return state.objectives.filter(o=>objectiveCanService(o,u)).sort((a,b)=>distance(from,a)-distance(from,b)||a.id.localeCompare(b.id))[0]
}
export function startObjectiveConstruction(state: BattleState, side: Side, objectiveId: string, kind: ObjectiveFacilityKind) {
  ensureObjectiveLogistics(state)
  const objective = state.objectives.find(o => o.id === objectiveId), specs = OBJECTIVE_FACILITIES[kind]
  if (!objective || objective.owner !== side || objective.contested || !specs) return false
  const existing = objective.facilities[kind]
  if (existing?.construction || (existing && existing.hp >= 40)) return false
  if (state.forces[side].sp < specs.cost + 200) return false
  state.forces[side].sp -= specs.cost
  objective.facilities[kind] = { hp: existing?.hp || 1, construction: { side, due: state.time + specs.buildSeconds } }
  state.forces[side].purchase = `${objective.id} ${kind === 'helipad' ? 'HELIPAD' : 'VEHICLE BAY'} · ${specs.cost} SP · ${specs.buildSeconds}s`
  return true
}

function takeForObjective(from: Stock, objective: Objective) {
  const manifest = emptyStock(); let room = OBJECTIVE_TRUCK_CAPACITY
  for (const key of ['fuel', 'repair', 'ammo'] as const) {
    const amount = Math.min(room, from[key], OBJECTIVE_STOCK_CAPS[key] - objective.stock[key])
    manifest[key] = amount; from[key] -= amount; room -= amount
  }
  return manifest
}
function returnManifest(manifest: Stock | undefined, stock: Stock) {
  if (!manifest) return
  for (const key of ['fuel', 'ammo', 'repair'] as const) { stock[key] += manifest[key]; manifest[key] = 0 }
}
function unloadAtObjective(manifest: Stock | undefined, objective: Objective) {
  if (!manifest) return
  for (const key of ['fuel', 'ammo', 'repair'] as const) { const amount = Math.min(manifest[key], OBJECTIVE_STOCK_CAPS[key] - objective.stock[key]); objective.stock[key] += amount; manifest[key] -= amount }
}

export function updateObjectiveLogistics(state: BattleState, nav: Navigation, log?: (side: Side, text: string) => void) {
  ensureObjectiveLogistics(state)
  for (const objective of state.objectives) for (const kind of ['helipad', 'vehicleBay'] as const) {
    const facility = objective.facilities[kind]
    if (facility?.construction && state.time >= facility.construction.due) {
      const builder = facility.construction.side
      facility.construction = undefined; facility.hp = 100
      log?.(objective.owner || builder, `Objective ${objective.id} ${kind === 'helipad' ? 'helipad' : 'vehicle repair bay'} is operational.`)
    }
  }

  // Completed structures persist through capture. Impacts close to a structure damage it;
  // access always follows the objective's current owner.
  const freshShots = state.shots.filter(s => s.id > (state.facilityDamageCursor || 0)).sort((a, b) => a.id - b.id)
  for (const shot of freshShots) for (const objective of state.objectives) {
    if (!objective.owner || shot.side === objective.owner) continue
    for (const kind of ['helipad', 'vehicleBay'] as const) {
      const facility = objective.facilities[kind], point = objectiveFacilityPoint(objective, kind)
      if (facility && !facility.construction && distance(shot.end, point) <= Math.max(10, shot.blast + 5)) facility.hp = Math.max(0, facility.hp - Math.max(2, shot.blast || 4))
    }
  }
  if (freshShots.length) state.facilityDamageCursor = freshShots.at(-1)!.id

  if (state.tick % 20 === 0) for (const objective of state.objectives) {
    if (!objective.owner || objective.contested) continue
    for (const facility of Object.values(objective.facilities)) if (facility && !facility.construction && facility.hp < 100 && objective.stock.repair > 0) {
      const repaired = Math.min(.5, 100 - facility.hp, objective.stock.repair / 4); facility.hp += repaired; objective.stock.repair -= repaired * 4
    }
  }

  // AI constructs one missing facility per side per command interval.
  if (state.tick % 600 === 1) for (const side of ['BLU', 'RED'] as const) {
    const choices = state.objectives.filter(o => o.owner === side && !o.contested).sort((a, b) => distance(BASES[side], b) - distance(BASES[side], a) || a.id.localeCompare(b.id))
    const choice = choices.flatMap(o => (['helipad', 'vehicleBay'] as const).map(kind => ({ o, kind }))).find(({ o, kind }) => !o.facilities[kind] || o.facilities[kind]!.hp < 40)
    if (choice && startObjectiveConstruction(state, side, choice.o.id, choice.kind)) log?.(side, `Construction started at objective ${choice.o.id}.`)
  }

  for (const truck of state.units.filter(u => u.role === 'TRUCK' && u.hp > 0 && u.transport?.objectiveId)) {
    const mission = truck.transport!, objective = state.objectives.find(o => o.id === mission.objectiveId), phase = (name: string) => { mission.phase = name; mission.since = state.time; truck.path = [] }
    if (!objective || objective.owner !== truck.side || objective.contested) {
      if (objective?.restock?.truckId === truck.id) objective.restock = undefined
      if (distance(truck, BASES[truck.side]) < 120) { returnManifest(mission.manifest, state.depots[truck.side].mob); mission.manifest = undefined; mission.cargo = 0; mission.objectiveId = undefined; phase('returning') }
      else { truck.mission = 'RETURNING DIVERTED OBJECTIVE LOAD'; travel(truck, BASES[truck.side], nav, state.time, 18, 0, 8) }
      continue
    }
    if (mission.phase === 'objective-loading') {
      truck.engine = false; truck.mission = `LOADING FOR OBJECTIVE ${objective.id}`
      if (state.time - mission.since >= 5) { mission.manifest = takeForObjective(state.depots[truck.side].mob, objective); mission.cargo = stockTotal(mission.manifest); mission.containerState = mission.cargo ? 'loaded' : 'empty'; if (mission.cargo) phase('objective-delivery'); else { objective.restock = undefined; mission.objectiveId = undefined; phase('returning') } }
    } else if (mission.phase === 'objective-delivery') {
      truck.mission = `RESTOCKING OBJECTIVE ${objective.id}`
      const destination = nav.nearest({ x: objective.x + 48, y: objective.y + 30 })
      if (travel(truck, destination, nav, state.time, 18, 0, 7)) phase('objective-unloading')
    } else if (mission.phase === 'objective-unloading') {
      truck.engine = false
      if (state.time - mission.since >= 8) { unloadAtObjective(mission.manifest, objective); objective.restock = undefined; mission.manifest = undefined; mission.cargo = 0; mission.containerState = 'empty'; phase('objective-return') }
    } else if (mission.phase === 'objective-return') {
      truck.mission = 'RETURNING FROM OBJECTIVE'
      if (travel(truck, { x: BASES[truck.side].x + 20, y: BASES[truck.side].y + 120 }, nav, state.time, 18, 0, 8)) { mission.objectiveId = undefined; phase('returning') }
    }
  }

  // A truck that has cleared the MOB crane is loaded and dispatched physically.
  for (const side of ['BLU', 'RED'] as const) {
    const available=state.depots[side].mob
    const restockable=(o:Objective)=>(['fuel','ammo','repair'] as const).reduce((n,key)=>n+Math.min(available[key],OBJECTIVE_STOCK_CAPS[key]-o.stock[key]),0)
    const priority=(o:Objective)=>state.units.filter(u=>u.side===side&&u.hp>0&&isVehicle(u.role)&&(u.servicing||!!u.fuelCommitment)&&distance(u,o)<5000).length*10000+distance(BASES[side],o)+restockable(o)
    const objective = state.objectives.filter(o => o.owner === side && !o.contested && !o.restock && Object.keys(o.facilities).length && stockTotal(o.stock) < OBJECTIVE_STOCK_TOTAL_CAP && restockable(o)>=100)
      .sort((a, b) => priority(b) - priority(a) || stockTotal(a.stock) - stockTotal(b.stock) || a.id.localeCompare(b.id))[0]
    if (!objective) continue
    const truck = state.units.filter(u => u.side === side && u.role === 'TRUCK' && u.hp > 0 && !u.servicing && u.transport?.phase === 'returning' && !u.transport.objectiveId && distance(u, BASES[side]) < 260)
      .sort((a, b) => a.id.localeCompare(b.id))[0]
    if (!truck) continue
    objective.restock = { truckId: truck.id, side }; truck.transport!.objectiveId = objective.id; truck.transport!.phase = 'objective-loading'; truck.transport!.since = state.time; truck.path = []
    log?.(side, `MOB convoy assigned to restock objective ${objective.id}.`)
  }
}

