import { completeMobUpgrades, mobHelipad, mobHelipadHold, releaseMobHelipad, reserveMobHelipad } from './mob'
import { updateMobTruck } from './mob-logistics'
import { AIRBASES, AIRFIELD_TIERS, BASES, createUnit, emptyStock, stockTotal, type AirfieldTier, type BattleState, type Role, type Side, type Stock, type Unit } from './types'
import { Navigation } from './navigation'
import { RUNWAY } from './theater'
import { distance, travel } from './movement'
import { missionFuel, syncDepotTotals, transferStock } from './sustainment'

export const SUPPLY_CADENCE = 180
export const supplyManifest = (tier: AirfieldTier = 1): Stock => {
  const scale = AIRFIELD_TIERS[tier].supplyMultiplier / AIRFIELD_TIERS[tier].runways
  return { fuel: 1200 * scale, ammo: 1500 * scale, repair: 600 * scale }
}
export function completeAirfieldUpgrades(state: BattleState) {
  for (const side of ['BLU', 'RED'] as const) {
    const field = state.airfields[side]
    if (field.upgrade && state.time >= field.upgrade.due) {
      field.tier = field.upgrade.tier; field.upgrade = undefined
      state.forces[side].purchase = `AIRFIELD TIER ${field.tier} ONLINE · ${AIRFIELD_TIERS[field.tier].supplyMultiplier}× supplies`
    }
  }
}
function externalAsset(state: BattleState, side: Side, role: Role, phase: string) {
  const u = createUnit(side, role, `theater-${side}-${++state.shipmentSerial}`, AIRBASES[side])
  u.external = true; u.servicing = false; u.fuel = 100; u.ammo = 0; u.subcommand = 'EXTERNAL THEATER LOGISTICS'; u.name = `${side} scheduled ${role.replaceAll('_', ' ').toLowerCase()}`
  u.transport = { phase, since: state.time, location: 'AIRBASE', home: { ...AIRBASES[side] }, shipment: u.id }
  state.units.push(u)
  return u
}
const exportable = (stock: Stock, multiplier = 1): Stock => ({ fuel: Math.max(0, stock.fuel - 300 * multiplier), ammo: Math.max(0, stock.ammo - 375 * multiplier), repair: Math.max(0, stock.repair - 150 * multiplier) })
function load(u: Unit, stock: Stock, capacity: number, fraction = 1, reserveMultiplier = 1) {
  const available = u.external && u.role === 'TRUCK' ? exportable(stock, reserveMultiplier) : { ...stock }, manifest = emptyStock(), total = stockTotal(available)
  transferStock(available, manifest, total > 0 ? Math.min(fraction, capacity / total) : 0)
  for (const key of ['fuel', 'ammo', 'repair'] as const) stock[key] -= manifest[key]
  u.transport!.manifest = manifest; u.transport!.cargo = stockTotal(manifest)
  if(u.role==='TRUCK'){
    u.transport!.containerState=stockTotal(manifest)>0?'loaded':'empty'
    u.transport!.containerCount=1+(u.transport!.trailers||0)
    u.transport!.unloadedContainers=0
  }
}
function unload(u: Unit, stock: Stock) {
  if (u.transport?.manifest) transferStock(u.transport.manifest, stock)
  u.transport!.manifest = undefined; u.transport!.cargo = 0
}
export function scheduleSupplies(state: BattleState) {
  completeAirfieldUpgrades(state)
  completeMobUpgrades(state)
  for (const side of ['BLU', 'RED'] as Side[]) {
    const own = state.units.filter(u => u.side === side && u.hp > 0)
    const tier = state.airfields[side].tier, specs = AIRFIELD_TIERS[tier]
    if (state.time >= state.nextSupply[side]) {
      let launched = false
      for (let runway = 0; runway < specs.runways; runway++) {
        if (own.some(u => u.role === 'CARGO_PLANE' && u.transport && !['waiting', 'departed'].includes(u.transport.phase) && (u.transport.runway ?? 0) === runway)) continue
        const plane = externalAsset(state, side, 'CARGO_PLANE', 'approach')
        plane.transport!.runway = runway
        plane.x = AIRBASES[side].x + RUNWAY.x - runway * RUNWAY.spacing; plane.y = AIRBASES[side].y - 2100; plane.altitude = 180
        plane.transport!.manifest = supplyManifest(tier); plane.transport!.cargo = stockTotal(plane.transport!.manifest)
        own.push(plane); launched = true
      }
      if (launched) state.nextSupply[side] = state.time + SUPPLY_CADENCE
    }
    for (const role of ['FORKLIFT', 'TRUCK'] as const) {
      const capacity = role === 'FORKLIFT' ? specs.forklifts : specs.trucks
      const stock = role === 'FORKLIFT' ? state.depots[side].pending : exportable(state.depots[side].airfield, specs.supplyMultiplier)
      if (stockTotal(stock) < (role === 'FORKLIFT' ? 1 : 150)) continue
      for (let i = own.filter(u => u.external && u.role === role).length; i < capacity; i++) {
        const asset = externalAsset(state, side, role, 'pickup')
        asset.x += i * 5; asset.y -= i * 4
        if (role === 'TRUCK') asset.transport!.trailers = specs.trailers
        own.push(asset)
      }
    }
  }
}
export function updateSupplyMissions(state: BattleState, nav: Navigation) {
  scheduleSupplies(state)
  const retired = new Set<string>()
  for (const u of state.units) {
    if (u.hp <= 0 || u.servicing || u.emergency || !['FORKLIFT', 'CARGO_PLANE', 'HEAVY_LIFT_HELI', 'TRUCK'].includes(u.role)) continue
    const air = AIRBASES[u.side], home = BASES[u.side], depot = state.depots[u.side]
    if (!u.transport) { const location = distance(u, air) < distance(u, home) ? 'AIRBASE' : 'MOB'; u.transport = { phase: 'waiting', since: state.time, location, home: { ...(location === 'AIRBASE' ? air : home) } }; u.path = [] }
    const m = u.transport, phase = (p: string) => { m.phase = p; m.since = state.time; u.path = [] }, at = (x: number, y: number) => ({ x: air.x + x, y: air.y + y })
    u.mission = m.phase.toUpperCase()
    // Travel turns the engine back on; stationary loading and service phases do not burn fuel.
    u.engine = false
    if(u.role==='TRUCK'){
      const handled=updateMobTruck(u,state,nav)
      if(handled==='retire')retired.add(u.id)
      if(handled)continue
    }
    if (u.role === 'CARGO_PLANE') {
      const slots = AIRFIELD_TIERS[state.airfields[u.side].tier].runways
      const freeRunway = Array.from({ length: slots }, (_, i) => i).find(i => !state.units.some(v => v.id !== u.id && v.side === u.side && v.role === 'CARGO_PLANE' && v.hp > 0 && v.transport && !['waiting', 'departed'].includes(v.transport.phase) && (v.transport.runway ?? 0) === i))
      if (m.runway === undefined && !['waiting', 'departed'].includes(m.phase)) {
        if (freeRunway === undefined) { u.mission = 'WAITING FOR RUNWAY'; continue }
        m.runway = freeRunway
      }
      const runwayX = RUNWAY.x - (m.runway ?? 0) * RUNWAY.spacing
      if (m.phase === 'waiting' && freeRunway !== undefined && state.time - m.since > 8) { m.runway = freeRunway; phase('taxi-out') }
      else if (m.phase === 'approach' && travel(u, at(runwayX, -RUNWAY.halfLength), nav, state.time, 48, 0)) phase('rollout')
      else if (m.phase === 'rollout' && travel(u, at(runwayX, 180), nav, state.time, 28, 0)) phase('taxi-in')
      else if (m.phase === 'taxi-in' && travel(u, at(RUNWAY.apronX, RUNWAY.apronY + (m.runway ?? 0) * 70), nav, state.time, 7, 0)) phase('unloading')
      else if (m.phase === 'unloading' && state.time - m.since >= 15) { unload(u, depot.pending); state.forces[u.side].delivered++; if (u.external) phase('taxi-out'); else { u.servicing = true; phase('waiting') } }
      else if (m.phase === 'taxi-out' && travel(u, at(runwayX, -RUNWAY.halfLength), nav, state.time, 7, 0)) phase('takeoff')
      else if (m.phase === 'takeoff' && travel(u, at(runwayX, RUNWAY.halfLength), nav, state.time, 65, 45)) phase('departure')
      else if (m.phase === 'departure' && travel(u, at(runwayX, -2100), nav, state.time, 85, 180)) { if (u.external) retired.add(u.id); else phase('departed') }
      else if (m.phase === 'departed' && freeRunway !== undefined && state.time - m.since >= SUPPLY_CADENCE) { m.runway = freeRunway; m.shipment = `${u.side}-owned-${++state.shipmentSerial}`; m.manifest = supplyManifest(state.airfields[u.side].tier); m.cargo = stockTotal(m.manifest); phase('approach') }
    } else if (u.role === 'FORKLIFT') {
      const pickup = m.location === 'AIRBASE' ? at(18, -110) : { x: home.x - 25, y: home.y + 22 }, drop = m.location === 'AIRBASE' ? at(62, -110) : { x: home.x + 24, y: home.y + 23 }
      if (m.phase === 'waiting' && stockTotal(m.location === 'AIRBASE' ? depot.pending : depot.mob) > 0) phase('pickup')
      else if (m.phase === 'pickup' && travel(u, pickup, nav, state.time, 3, 0)) phase('loading')
      else if (m.phase === 'loading' && state.time - m.since > 3) { load(u, m.location === 'AIRBASE' ? depot.pending : depot.mob, 750); phase('carrying') }
      else if (m.phase === 'carrying' && travel(u, drop, nav, state.time, 3, 0)) phase('placing')
      else if (m.phase === 'placing' && state.time - m.since > 3) { unload(u, m.location === 'AIRBASE' ? depot.airfield : depot.mob); if (u.external) retired.add(u.id); else phase('waiting') }
    } else {
      const helicopter = u.role === 'HEAVY_LIFT_HELI', speed = helicopter ? 65 : 24, capacity = helicopter ? 1800 : 900 * (1 + (m.trailers || 0))
      if (m.phase === 'waiting') {
        if (!u.external && u.fuel < missionFuel(u, home, air)) { u.serviceStatus = 'INSUFFICIENT MISSION FUEL RESERVE'; u.servicing = true; continue }
        phase('pickup')
      } else if (m.phase === 'pickup' && travel(u, at(18, -135), nav, state.time, speed, helicopter ? 3 : 0)) phase('loading')
      else if (m.phase === 'loading' && state.time - m.since > 8 && stockTotal(depot.airfield) > 0) { load(u, depot.airfield, capacity, u.external ? 1 : .5, AIRFIELD_TIERS[state.airfields[u.side].tier].supplyMultiplier); if (m.cargo) phase('delivery'); else if (u.external) retired.add(u.id) }
      else if (m.phase === 'delivery') {
        const destination=helicopter?mobHelipad(u.side):{ x: home.x + 20, y: home.y + 25 }
        if(helicopter&&distance(u,destination)<=180&&!reserveMobHelipad(state,u.side,u.id)){u.travelStatus='HOLDING FOR MOB HELIPAD';travel(u,mobHelipadHold(u.side,u.id),nav,state.time,speed,70)}
        else if(travel(u,destination,nav,state.time,speed,helicopter?55:0))phase('lowering')
      }
      else if (m.phase === 'lowering' && travel(u, helicopter?mobHelipad(u.side):{ x: home.x + 20, y: home.y + 25 }, nav, state.time, speed, 0)) phase('unloading')
      else if (m.phase === 'unloading' && state.time - m.since > 8) { unload(u, depot.mob); releaseMobHelipad(state,u.side,u.id); if (u.external) retired.add(u.id); else { phase('waiting'); u.servicing = true } }
    }
  }
  state.units = state.units.filter(u => !retired.has(u.id) && !(u.external && u.lossProcessed))
  syncDepotTotals(state)
}

