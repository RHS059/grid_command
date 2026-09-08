import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from '../lib/game/scene-data'
import { AIRFIELD_TIERS, AIRBASES, CATALOG, initialState, createUnit, stockTotal, troopSeats, type AirfieldTier, type Role } from '../lib/game/types'
import { completeAirfieldUpgrades, scheduleSupplies, supplyManifest, updateSupplyMissions } from '../lib/game/logistics'
import { nextPurchase, startAirfieldUpgrade } from '../lib/game/requisitions'
import { activeTroops, assignTransports, updateTransports } from '../lib/game/transport'
import { captureBodies } from '../lib/game/capture'
import { Navigation } from '../lib/game/navigation'
import { serviceVehicle, vehicleResources } from '../lib/game/sustainment'
import { createBase } from '../lib/game/base-models'
import { animateSupport, createSupportModel } from '../lib/game/support-models'
import { disposeModel } from '../lib/game/aircraft-models'
import { recordCasualties } from '../lib/game/casualties'
import { Visibility } from '../lib/game/visibility'

function assault(squads = 3) {
  const state = initialState(), nav = new Navigation()
  state.nextSupply = { BLU: Infinity, RED: Infinity }
  const destination = { ...state.objectives[0], x: 1300, y: 100 }
  state.objectives = [destination]
  const troops = Array.from({ length: squads }, (_, i) => { const u = createUnit('BLU', 'RIFLE', `squad-${i}`, { x: 100, y: 100 }); u.target = destination.id; return u })
  const heli = createUnit('BLU', 'TRANSPORT_HELI', 'heli', { x: 100, y: 100 }); heli.servicing = false; heli.fuel = 100
  state.units = [heli, ...troops]
  return { state, nav, troops, heli, destination }
}

test('commanders prioritize paid upgrades on both sides and completion is timed', () => {
  const state = initialState()
  for (const side of ['BLU', 'RED'] as const) {
    for (let i = 0; i < 3; i++) state.units.push(createUnit(side, 'RIFLE', `${side}-r${i}`))
    for (let i = 0; i < 2; i++) state.units.push(createUnit(side, 'TROOP_TRUCK', `${side}-t${i}`))
    assert.equal(nextPurchase(state, side, []), 'AIRFIELD_UPGRADE')
    assert.equal(startAirfieldUpgrade(state, side), true)
    assert.equal(state.forces[side].sp, 1400)
    assert.equal(startAirfieldUpgrade(state, side), false)
    assert.equal(nextPurchase(state, side, []), null)
  }
  state.time = 59.99; completeAirfieldUpgrades(state); assert.equal(state.airfields.BLU.tier, 1)
  state.time = 60; completeAirfieldUpgrades(state)
  for (const side of ['BLU', 'RED'] as const) {
    assert.equal(state.airfields[side].tier, 2)
    assert.equal(nextPurchase(state, side, []), 'AIRFIELD_UPGRADE')
    assert.equal(startAirfieldUpgrade(state, side), true)
    assert.equal(state.forces[side].sp, 200)
  }
  state.time = 149.99; completeAirfieldUpgrades(state); assert.equal(state.airfields.BLU.tier, 2)
  state.time = 150; completeAirfieldUpgrades(state)
  for (const side of ['BLU', 'RED'] as const) { assert.equal(state.airfields[side].tier, 3); assert.equal(startAirfieldUpgrade(state, side), false) }
})
test('upgrade reserve prevents overspending without creating inventory', () => {
  const state = initialState(); state.forces.BLU.sp = 799
  assert.equal(startAirfieldUpgrade(state, 'BLU'), false); assert.equal(state.airfields.BLU.upgrade, undefined)
  state.forces.BLU.sp = 800; assert.equal(startAirfieldUpgrade(state, 'BLU'), true)
  assert.equal(state.forces.BLU.sp, 200); assert.equal(stockTotal(state.depots.BLU.airfield), 0)
})
for (const tier of [1, 2, 3] as AirfieldTier[]) test(`tier ${tier} has exact handling fleet, runway count and supply throughput`, () => {
  const state = initialState(), spec = AIRFIELD_TIERS[tier]
  state.airfields.BLU.tier = tier; state.nextSupply.BLU = 0; state.nextSupply.RED = Infinity
  state.depots.BLU.pending = { fuel: 10000, ammo: 10000, repair: 10000 }; state.depots.BLU.airfield = { fuel: 10000, ammo: 10000, repair: 10000 }
  scheduleSupplies(state); scheduleSupplies(state)
  const fleet = state.units.filter(u => u.side === 'BLU' && u.external)
  const planes = fleet.filter(u => u.role === 'CARGO_PLANE')
  assert.equal(planes.length, spec.runways); assert.equal(new Set(planes.map(u => u.transport?.runway)).size, spec.runways)
  assert.equal(fleet.filter(u => u.role === 'FORKLIFT').length, spec.forklifts)
  assert.equal(fleet.filter(u => u.role === 'TRUCK').length, spec.trucks)
  assert.ok(fleet.filter(u => u.role === 'TRUCK').every(u => u.transport?.trailers === spec.trailers))
  assert.equal(planes.reduce((n, u) => n + (u.transport?.cargo || 0), 0), 3300 * spec.supplyMultiplier)
  assert.equal(stockTotal(supplyManifest(tier)) * spec.runways, 3300 * spec.supplyMultiplier)
  assert.equal(spec.income, spec.supplyMultiplier * 10)
})
test('two tier-three cargo aircraft physically land and unload on distinct lanes', () => {
  const state = initialState(), nav = new Navigation(); state.airfields.BLU.tier = 3; state.nextSupply = { BLU: 0, RED: Infinity }
  scheduleSupplies(state); state.nextSupply.BLU = Infinity
  const planes = state.units.filter(u => u.role === 'CARGO_PLANE'), landed = new Set<string>(), unloaded = new Set<string>()
  for (let tick = 0; tick < 5000 && unloaded.size < 2; tick++) {
    state.time = tick * .05; updateSupplyMissions(state, nav)
    for (const plane of planes) { if (plane.transport?.phase === 'rollout') { assert.ok((plane.altitude || 0) <= .1); landed.add(plane.id) }; if (!plane.transport?.cargo) unloaded.add(plane.id) }
  }
  assert.equal(landed.size, 2); assert.equal(unloaded.size, 2)
})
test('double trailers increase actual cargo capacity to 2,700 without creating stock', () => {
  const state = initialState(), nav = new Navigation(); state.nextSupply = { BLU: Infinity, RED: Infinity }; state.airfields.BLU.tier = 3
  state.depots.BLU.airfield = { fuel: 10000, ammo: 10000, repair: 10000 }
  const truck = createUnit('BLU', 'TRUCK', 'truck', AIRBASES.BLU); truck.external = true; truck.servicing = false; truck.fuel = 100
  truck.transport = { phase: 'loading', since: 0, trailers: 2 }; state.units = [truck]; state.time = 9
  updateSupplyMissions(state, nav)
  assert.equal(truck.transport.cargo, 2700); assert.equal(stockTotal(state.depots.BLU.airfield) + truck.transport.cargo, 30000)
})
test('24 seats fit six four-person rifle squads; fewer than 12 never reserve an assault flight', () => {
  assert.equal(troopSeats('TRANSPORT_HELI'), 24); assert.equal(CATALOG.RIFLE.members * 6, 24)
  const small = assault(2); assignTransports(small.state); assert.equal(small.heli.transport, undefined)
  const full = assault(7); assignTransports(full.state); assignTransports(full.state)
  assert.equal(full.heli.transport?.passengers?.length, 6)
  assert.equal(new Set(full.heli.transport?.passengers).size, 6)
})
test('helicopter touches down, unloads exactly one soldier per second, then infantry capture', () => {
  const { state, nav, troops, heli, destination } = assault()
  assignTransports(state); assignTransports(state); assert.equal(heli.transport?.passengers?.length, 3)
  let sawTransit = false, sawUnloading = false, lastExited = 0, lastExitAt = 0
  for (let tick = 0; tick < 4000; tick++) {
    state.time = tick * .05; updateTransports(state, nav)
    const phase = heli.transport!.phase
    if (phase === 'transit') { sawTransit = true; assert.equal(heli.transport!.dispatchTroops, 12); assert.equal(captureBodies(state, destination).BLU, 0) }
    if (phase === 'disembarking') {
      sawUnloading = true; assert.equal(heli.altitude, 0); assert.equal(captureBodies(state, destination).BLU, 0)
      const exited = troops.flatMap(s => s.soldiers || []).filter(s => s.disembarked).length
      if (exited !== lastExited) { assert.equal(exited, lastExited + 1); if (lastExited) assert.ok(state.time - lastExitAt >= 1 - 1e-8); lastExited = exited; lastExitAt = state.time }
    }
    if (phase === 'return') break
  }
  assert.ok(sawTransit); assert.ok(sawUnloading); assert.equal(heli.transport!.unloaded, 12)
  assert.ok(troops.every(s => !s.carrier && s.mission === 'CAPTURE')); assert.equal(captureBodies(state, destination).BLU, 12)
  assert.equal(state.units.length, 4)
})
test('air assault minimum counts living troops, never crew or empty reservations', () => {
  const { state, heli, troops } = assault(); troops[0].soldiers![0].status = 'downed'
  assert.equal(troops.reduce((n, s) => n + activeTroops(s), 0), 11)
  assignTransports(state); assert.equal(heli.transport, undefined)
})
test('low hover, empty aircraft and underfilled landing attempts cannot capture', () => {
  const { state, nav, heli, troops, destination } = assault(2)
  Object.assign(heli, destination); heli.altitude = 2
  heli.transport = { phase: 'landing', since: 0, destination, passengers: troops.map(s => s.id), dispatchTroops: 8 }
  for (const s of troops) s.carrier = heli.id
  updateTransports(state, nav); assert.equal(heli.transport.phase, 'return'); assert.equal(captureBodies(state, destination).BLU, 0)
  heli.altitude = 0; assert.equal(captureBodies(state, destination).BLU, 0)
})
test('all moving vehicle classes have doubled burn and fuel/ammo service takes 60 seconds', () => {
  for (const [role, burn] of [['JET', .1], ['CARGO_PLANE', .1], ['HEAVY_LIFT_HELI', .1], ['TRANSPORT_HELI', .08], ['TANK', .05], ['TRUCK', .032], ['FORKLIFT', .032]] as [Role, number][]) assert.equal(vehicleResources(role).burn, burn)
  const state = initialState(), tank = createUnit('BLU', 'TANK', 'tank'); state.units = [tank]; tank.hp = 0.1
  state.depots.BLU.mob = { fuel: 10000, ammo: 10000, repair: 10000 }
  serviceVehicle(state, tank, 20); assert.ok(Math.abs(tank.fuel - 100 / 3) < 1e-8); assert.ok(Math.abs(tank.ammo - 100 / 3) < 1e-8); assert.equal(tank.hp, 100)
  serviceVehicle(state, tank, 40); assert.equal(tank.fuel, 100); assert.equal(tank.ammo, 100)
})
test('tier-three model includes a second strip and trucks show precisely two trailers', () => {
  const one = createBase('AIRFIELD', 'BLU', 1), three = createBase('AIRFIELD', 'BLU', 3)
  const a = new T.Box3().setFromObject(one), b = new T.Box3().setFromObject(three); assert.ok(b.min.x < a.min.x - 40)
  const truck = createSupportModel('TRUCK', 'BLU')
  animateSupport(truck, 0, { phase: 'delivery', since: 0, trailers: 2 })
  assert.equal(truck.getObjectByName('cargo-trailer-1')?.visible, true); assert.equal(truck.getObjectByName('cargo-trailer-2')?.visible, true)
  animateSupport(truck, 0, { phase: 'delivery', since: 0, trailers: 0 }); assert.equal(truck.getObjectByName('cargo-trailer-1')?.visible, false)
  for (const model of [one, three, truck]) disposeModel(model)
})
test('already disembarked soldiers survive carrier destruction', () => {
  const { state, nav, heli, troops } = assault(1); const squad = troops[0]
  squad.carrier = heli.id; squad.soldiers![0].disembarked = true; heli.hp = 0
  recordCasualties(state, nav, new Visibility(), () => .99)
  assert.equal(squad.members, 1); assert.equal(squad.carrier, undefined); assert.equal(state.forces.BLU.casualties, 3)
})
