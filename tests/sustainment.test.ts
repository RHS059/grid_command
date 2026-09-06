import test from 'node:test'
import assert from 'node:assert/strict'
import { initialState, createUnit, CATALOG, isVehicle, isAir, BASES, AIRBASES, stockTotal, type Role } from '../lib/game/types'
import { consumeFuel, serviceVehicle, updateVehicleService, vehicleResources, transferStock, missionFuel } from '../lib/game/sustainment'
import { nextPurchase } from '../lib/game/requisitions'
import { updateSupplyMissions } from '../lib/game/logistics'
import { Navigation } from '../lib/game/navigation'
import { travel } from '../lib/game/movement'
import { captureBodies } from '../lib/game/capture'
import { resolveCombat } from '../lib/game/combat'
import { Visibility } from '../lib/game/visibility'
import { sectorKey, sectorOrigin } from '../lib/game/theater'

test('every seed starts with two commanders, independent empty stores and 2,000 SP', () => {
  for (const seed of [1, 99, 3701]) { const s = initialState(seed); assert.equal(s.units.length, 2); assert.ok(s.units.every(u => u.role === 'COMMAND')); for (const side of ['BLU', 'RED'] as const) { assert.equal(s.forces[side].sp, 2000); assert.equal(s.forces[side].fuel, 0); assert.equal(s.forces[side].ammo, 0); for (const stock of Object.values(s.depots[side])) assert.equal(stockTotal(stock), 0) } s.depots.BLU.mob.fuel = 1; assert.equal(s.depots.RED.mob.fuel, 0) }
})
test('commanders buy infantry then transport symmetrically and deliberately save', () => {
  const s = initialState()
  for (const side of ['BLU', 'RED'] as const) {
    assert.equal(nextPurchase(s, side, []), 'RIFLE')
    for (let i = 0; i < 3; i++) s.units.push(createUnit(side, 'RIFLE', `${side}-r${i}`))
    assert.equal(nextPurchase(s, side, []), 'TROOP_TRUCK')
    for (let i = 0; i < 2; i++) s.units.push(createUnit(side, 'TROOP_TRUCK', `${side}-t${i}`))
    assert.equal(nextPurchase(s, side, []), 'AIRFIELD_UPGRADE')
    s.airfields[side].tier = 3
    for (let i = 3; i < 6; i++) s.units.push(createUnit(side, 'RIFLE', `${side}-r${i}`))
    s.units.push(createUnit(side, 'MG', `${side}-mg`), createUnit(side, 'AA_TEAM', `${side}-aa`))
    assert.equal(nextPurchase(s, side, []), null); assert.match(s.forces[side].purchase, /Saving for APC/)
    s.forces[side].sp = CATALOG.APC.cost + 200; assert.equal(nextPurchase(s, side, []), 'APC')
  }
  assert.equal(CATALOG.TANK.cost, 8000); assert.equal(CATALOG.JET.cost, 16000)
})
for (const role of (Object.keys(CATALOG) as Role[]).filter(r => isVehicle(r) && r !== 'UAV_JAMMER')) test(`${role} uses only stopped, landed, friendly facility stock`, () => {
  const s = initialState(), u = createUnit('BLU', role, role); s.units = [u]; u.hp = 50
  const home = isAir(role) ? AIRBASES.BLU : BASES.BLU, stock = isAir(role) ? s.depots.BLU.airfield : s.depots.BLU.mob
  assert.equal(u.fuel, 0); assert.equal(u.ammo, 0); serviceVehicle(s, u, 1); assert.equal(u.fuel, 0); assert.equal(u.hp, 50)
  Object.assign(stock, { fuel: 10000, ammo: 10000, repair: 10000 })
  Object.assign(u, isAir(role) ? BASES.BLU : AIRBASES.BLU); assert.equal(serviceVehicle(s, u), false)
  Object.assign(u, isAir(role) ? AIRBASES.RED : BASES.RED); assert.equal(serviceVehicle(s, u), false)
  Object.assign(u, home); u.altitude = 6; assert.equal(serviceVehicle(s, u), false)
  u.altitude = 0; u.engine = true; assert.equal(serviceVehicle(s, u), false)
  u.engine = false; u.path = [{x:home.x+1,y:home.y}]; assert.equal(serviceVehicle(s, u), false)
  u.path = []; assert.equal(serviceVehicle(s, u, 1), true)
  assert.equal(u.fuel, 5 / 3); assert.equal(u.hp, 55); assert.ok(Math.abs(stock.fuel - (10000 - vehicleResources(role).fuel / 60)) < 1e-8)
  u.hp = 0; assert.equal(serviceVehicle(s, u), false)
})
test('fuel, ammo and repairs deplete independently without free repair or revival', () => {
  const s = initialState(), u = createUnit('BLU', 'TANK', 'tank'); s.units = [u]; u.hp = 50
  s.depots.BLU.mob = { fuel: 4, ammo: 0, repair: 0 }
  serviceVehicle(s, u, 100); assert.equal(u.fuel, .5); assert.equal(u.ammo, 0); assert.equal(u.hp, 50); assert.equal(stockTotal(s.depots.BLU.mob), 0)
  serviceVehicle(s, u, 100); assert.equal(u.fuel, .5)
  const members = u.members; s.depots.BLU.mob.repair = 800; serviceVehicle(s, u, 100); assert.equal(u.hp, 100); assert.equal(u.members, members)
})
test('vehicle fuel depends on simulated engine time, not playback speed; infantry is unaffected', () => {
  for (const speed of [1, 2, 4, 8, 16]) {
    const s = initialState(), u = createUnit('BLU', 'JET', 'jet'); s.units.push(u); s.speed = speed; u.fuel = 100; u.engine = true; u.servicing = false
    for (let i = 0; i < 1600 / speed; i++) for (let j = 0; j < speed; j++) consumeFuel(s)
    assert.ok(Math.abs(u.fuel - 92) < 1e-8); assert.equal(s.units[0].fuel, 100)
    u.engine = false; const before = u.fuel; consumeFuel(s, 100); assert.equal(u.fuel, before)
  }
})
test('empty ground vehicles stop, airborne vehicles crash and landed aircraft wait', () => {
  const s = initialState(), nav = new Navigation(), truck = createUnit('BLU', 'TROOP_TRUCK', 'truck'), jet = createUnit('BLU', 'JET', 'jet')
  s.units = [truck, jet]; const x = truck.x; assert.equal(travel(truck, {x:x+100,y:truck.y},nav,0), false); assert.equal(truck.x,x)
  jet.altitude = 100; jet.servicing = false; for(let i=0;i<200;i++){updateVehicleService(s,nav);consumeFuel(s)} assert.equal(jet.hp,0); assert.equal(jet.altitude,0)
  const parked = createUnit('BLU','JET','parked'); s.units=[parked];updateVehicleService(s,nav);consumeFuel(s);assert.equal(parked.hp,100);assert.equal(parked.fuel,0);assert.match(parked.serviceStatus!,/WAITING/)
})
test('mission reserves include pickup and the proper return facility', () => {
  const u = createUnit('BLU','TRANSPORT_HELI','heli'); assert.ok(missionFuel(u,{x:u.x+10000,y:u.y})>missionFuel(u,u)); assert.ok(missionFuel(u,u,{x:u.x+20000,y:u.y})>missionFuel(u,u))
})
test('inventory transfers conserve each resource',()=>{const a={fuel:100,ammo:80,repair:60},b={fuel:0,ammo:0,repair:0};transferStock(a,b,.4);assert.deepEqual(a,{fuel:60,ammo:48,repair:36});assert.deepEqual(b,{fuel:40,ammo:32,repair:24})})
test('scheduled supplies reach MOBs without any owned logistics vehicles', () => {
  const s = initialState(), nav = new Navigation()
  for(let i=0;i<24000;i++) {s.tick=i;s.time=i*.05;updateVehicleService(s,nav);updateSupplyMissions(s,nav);consumeFuel(s);if(stockTotal(s.depots.BLU.mob)>0&&stockTotal(s.depots.RED.mob)>0)break}
  assert.ok(stockTotal(s.depots.BLU.mob)>0);assert.ok(stockTotal(s.depots.RED.mob)>0);assert.equal(s.units.filter(u=>!u.external).length,2)
})
test('only dismounted active infantry counts; all embarked passengers are excluded',()=>{
  const s=initialState(), objective={x:0,y:0}, squad=createUnit('BLU','RIFLE','squad',objective), heli=createUnit('BLU','TRANSPORT_HELI','heli',objective);s.units=[squad,heli];squad.carrier=heli.id;heli.transport={phase:'landing',since:0,passengers:[squad.id,squad.id]};heli.altitude=5
  assert.equal(captureBodies(s,objective).BLU,0);squad.soldiers![0].status='downed';assert.equal(captureBodies(s,objective).BLU,0);heli.altitude=5.01;assert.equal(captureBodies(s,objective).BLU,0);heli.altitude=0;heli.transport.phase='transit';assert.equal(captureBodies(s,objective).BLU,0)
  heli.transport.phase='landing';heli.x=101;assert.equal(captureBodies(s,objective).BLU,0);heli.x=0;heli.transport.passengers=[];assert.equal(captureBodies(s,objective).BLU,0)
  for(const role of ['JET','ATTACK_HELI','HEAVY_LIFT_HELI','CARGO_PLANE','RECON_UAV','TROOP_TRUCK'] as Role[]){heli.role=role;heli.transport.passengers=[squad.id];assert.equal(captureBodies(s,objective).BLU,0,role)}
  squad.carrier=undefined;assert.equal(captureBodies(s,objective).BLU,3);s.units.push(squad);assert.equal(captureBodies(s,objective).BLU,3)
})
test('partial ammunition cannot fire a missile or tank shell',()=>{
  const s=initialState(),aa=createUnit('BLU','AA_TEAM','aa',{x:100,y:100}),jet=createUnit('RED','JET','jet',{x:500,y:100});s.units=[aa,jet];aa.ammo=24.99;jet.altitude=100
  const v=new Visibility(),key=sectorKey(aa);v.import({sector:key,complete:true,version:1,features:[],terrain:{...sectorOrigin(key),step:50,width:41,height:41,values:Array(1681).fill(0)}})
  resolveCombat(s,v,()=>.5,()=>1);s.time=10;resolveCombat(s,v,()=>.5,()=>1);assert.equal(s.missiles.length,0);assert.equal(aa.ammo,24.99)
  const tank=createUnit('BLU','TANK','tank',{x:100,y:100}),enemy=createUnit('RED','TANK','enemy',{x:300,y:100});s.units=[tank,enemy];tank.servicing=false;tank.ammo=1.99;resolveCombat(s,v,()=>.5,()=>1);assert.equal(s.shots.length,0)
})
