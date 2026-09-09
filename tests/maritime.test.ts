import test from 'node:test'
import assert from 'node:assert/strict'
import { initialState, createUnit } from '../lib/game/types'
import { initializeHierarchy, rememberUnit } from '../lib/game/ai/blackboard'
import { maritimeRoute, waterAt } from '../lib/game/maritime-navigation'
import { acceptMaritimeMission, updateMaritime } from '../lib/game/maritime-controller'
import { consumeFuel, vehicleResources } from '../lib/game/sustainment'
import { weaponFor, eligible } from '../lib/game/weapons'
import type { Mission } from '../lib/game/ai/model'
import type { Navigation } from '../lib/game/navigation'
import { carrierActorIds } from '../lib/game/carrier-transitions'
import { buildScenario, type ScenarioConfig } from '../lib/game/ai/scenario'
import scenario from '../reference/scenarios/synthetic-maritime.json'
import { updateHierarchy } from '../lib/game/ai/hierarchy'
import { resolveCombat } from '../lib/game/combat'
import type { Visibility } from '../lib/game/visibility'

function fixture(role:'PATROL_BOAT'|'LANDING_CRAFT'|'AMPHIBIOUS_APC'='PATROL_BOAT'){
 const state=initialState(),ship=createUnit('BLU',role,'ship',{x:0,y:80}),squad=createUnit('BLU','RIFLE','riders',{x:0,y:110})
 ship.fuel=ship.ammo=100;ship.servicing=false;state.units=[ship,squad]
 state.maritime={water:[[{x:-200,y:-200},{x:400,y:-200},{x:400,y:100},{x:-200,y:100}]],ports:[{id:'port',side:'BLU',position:{x:0,y:80},stock:{fuel:20,ammo:20,repair:20}}],landings:[{id:'pickup',water:{x:0,y:90},shore:{x:0,y:110}},{id:'landing',water:{x:100,y:90},shore:{x:100,y:110}}]}
 state.behavior=initializeHierarchy(state)
 const mission:Mission={revision:1,unitId:ship.id,issuer:'BLU',target:state.objectives[0].id,destination:{x:100,y:80},action:'ASSEMBLE',task:'SUPPORT',issuedAt:0,executeAt:0,expiresAt:500,initiative:.5,reasons:[],naval:{mode:'PATROL',waypoints:[{x:100,y:80},{x:0,y:80}]}}
 rememberUnit(state.behavior,state,ship).mission=mission
 const nav={covered:()=>true,clear:()=>true,route:(_:unknown,p:{x:number;y:number})=>[p]} as unknown as Navigation
 const step=(n:number)=>{for(let i=0;i<n;i++){state.time+=.05;updateMaritime(state,nav,.05);consumeFuel(state)}}
 return {state,ship,squad,mission,nav,step}
}
test('water navigation refuses land and repeats navigable routes deterministically',()=>{
 const f=fixture();assert.equal(waterAt(f.state.maritime!,{x:0,y:110}),false);assert.equal(maritimeRoute(f.state.maritime!,f.ship,{x:0,y:110}),null)
 assert.deepEqual(maritimeRoute(f.state.maritime!,f.ship,{x:150,y:0}),maritimeRoute(f.state.maritime!,f.ship,{x:150,y:0}))
})
test('patrol executes all waypoints and consumes fuel without leaving water',()=>{const f=fixture();assert.ok(acceptMaritimeMission(f.state,f.ship,f.mission));f.step(400);assert.equal(f.ship.maritime?.phase,'complete');assert.ok(f.ship.fuel<100);assert.ok(waterAt(f.state.maritime!,f.ship));assert.equal(f.state.behavior!.units.ship.execution?.status,'COMPLETED')})
test('lift reserves real seats, transitions each identity, lands without duplicating resources',()=>{
 const f=fixture('LANDING_CRAFT');f.mission.naval={mode:'AMPHIBIOUS_LIFT',pickupId:'pickup',landingId:'landing',passengerIds:['riders']};const original={ammo:f.squad.ammo,hp:f.squad.hp,role:f.squad.role,ids:f.squad.soldiers!.map(s=>s.id)}
 assert.ok(acceptMaritimeMission(f.state,f.ship,f.mission));f.step(50);assert.ok(carrierActorIds(f.state).size>0);assert.equal(f.squad.carrier,undefined)
 f.step(1100);assert.equal(f.ship.maritime?.phase,'complete');assert.equal(f.squad.carrier,undefined);assert.equal(f.squad.x,100);assert.equal(f.squad.y,110);assert.equal(carrierActorIds(f.state).size,0)
 assert.deepEqual({ammo:f.squad.ammo,hp:f.squad.hp,role:f.squad.role,ids:f.squad.soldiers!.map(s=>s.id)},original)
})
test('overcapacity and duplicate lift reservations are rejected atomically',()=>{const f=fixture('AMPHIBIOUS_APC');f.mission.naval={mode:'AMPHIBIOUS_LIFT',pickupId:'pickup',landingId:'landing',passengerIds:['riders']};const other=createUnit('BLU','LANDING_CRAFT','other',f.ship);other.maritime={revision:1,phase:'pickup',waypoint:0,since:0,passengers:['riders']};f.state.units.push(other);assert.equal(acceptMaritimeMission(f.state,f.ship,f.mission),false);assert.equal(f.ship.maritime,undefined)})
test('expired approach releases hidden identities; zero fuel cannot move',()=>{const f=fixture('LANDING_CRAFT');f.mission.naval={mode:'AMPHIBIOUS_LIFT',pickupId:'pickup',landingId:'landing',passengerIds:['riders']};f.mission.expiresAt=3;acceptMaritimeMission(f.state,f.ship,f.mission);f.step(100);assert.equal(carrierActorIds(f.state).size,0);assert.deepEqual(f.ship.maritime?.passengers,[]);const pos={x:f.ship.x,y:f.ship.y};f.ship.fuel=0;f.ship.path=[{x:80,y:80}];f.step(20);assert.deepEqual({x:f.ship.x,y:f.ship.y},pos)})
test('port servicing consumes finite stock and cannot certify empty-port resupply',()=>{const f=fixture();f.ship.fuel=f.ship.ammo=f.ship.hp=50;f.mission.task='RESUPPLY';assert.ok(acceptMaritimeMission(f.state,f.ship,f.mission));f.step(500);assert.ok(f.ship.fuel<=50+20/vehicleResources(f.ship.role).fuel*100+1e-8&&Math.abs(f.ship.ammo-(50+20/vehicleResources(f.ship.role).ammo*100))<1e-8&&Math.abs(f.ship.hp-(50+20/vehicleResources(f.ship.role).repair*100))<1e-8);assert.equal(f.state.maritime!.ports[0].stock.ammo,0);assert.notEqual(f.ship.maritime?.phase,'complete')})
test('surface and air weapons retain physical target eligibility',()=>{assert.ok(eligible(weaponFor('FRIGATE')!,{role:'TANK'}));assert.ok(eligible(weaponFor('FRIGATE')!,{role:'JET'}));assert.equal(weaponFor('LANDING_CRAFT'),null)})

test('amphibious APC swims then drives the authored beach link before unloading',()=>{const f=fixture('AMPHIBIOUS_APC');f.mission.naval={mode:'AMPHIBIOUS_LIFT',pickupId:'pickup',landingId:'landing',passengerIds:['riders']};assert.ok(acceptMaritimeMission(f.state,f.ship,f.mission));f.step(1500);assert.equal(f.ship.maritime?.phase,'complete');assert.ok(Math.hypot(f.ship.x-100,f.ship.y-110)<.2);assert.equal(f.squad.carrier,undefined)})
test('blocked shore cannot accumulate boarding time or unload into unknown terrain',()=>{const f=fixture('LANDING_CRAFT');f.mission.naval={mode:'AMPHIBIOUS_LIFT',pickupId:'pickup',landingId:'landing',passengerIds:['riders']};acceptMaritimeMission(f.state,f.ship,f.mission);f.nav.covered=()=>false;f.step(800);assert.equal(f.squad.carrier,undefined);assert.equal(carrierActorIds(f.state).size,0);assert.equal(f.state.behavior!.units.ship.execution?.status,'BLOCKED')})
test('escort uses received friendly positions and holds when a report is stale',()=>{const f=fixture();f.mission.naval={mode:'ESCORT',escortId:'friend'};acceptMaritimeMission(f.state,f.ship,f.mission);f.ship.path=[];f.state.behavior!.sides.BLU.readiness.friend={id:'friend',role:'FRIGATE',hp:100,ammo:100,fuel:100,morale:.8,available:true,observedAt:0,position:{x:150,y:80}};f.step(1);assert.equal(f.ship.path.at(-1)?.x,150);f.ship.path=[];f.state.time=46;f.step(1);assert.equal(f.ship.path.length,0)})
test('a surface fire mission completes from local firing evidence, never merely arrival',()=>{const f=fixture();f.mission.naval={mode:'SURFACE_STRIKE',waypoints:[{x:0,y:80}]};acceptMaritimeMission(f.state,f.ship,f.mission);f.step(2);assert.notEqual(f.ship.maritime?.phase,'complete');f.state.behavior!.units.ship.lastFiredAt=f.state.time;f.step(1);assert.equal(f.ship.maritime?.phase,'complete')})
test('authored maritime roles load into the real hierarchy with delayed orders',()=>{const state=buildScenario(scenario as ScenarioConfig);const immediate=updateHierarchy(state);assert.equal(immediate.filter(m=>m.naval).length,0);const queued=state.behavior!.orders.filter(m=>m.naval);assert.ok(queued.length>=2);assert.ok(queued.every(m=>m.executeAt>m.issuedAt));assert.equal(state.units.find(u=>u.id==='lift')!.role,'LANDING_CRAFT')})
test('malformed water and nonfinite port stock reject authored configuration',()=>{const input=structuredClone(scenario) as ScenarioConfig;input.maritime!.water[0]=[{x:0,y:0}];assert.throws(()=>buildScenario(input),/water/);const resource=structuredClone(scenario) as ScenarioConfig;resource.maritime!.ports[0].stock.fuel=Infinity;assert.throws(()=>buildScenario(resource),/port resources/)})
test('frigate air defense acquires a visible aircraft and spends ammunition on a real missile',()=>{const state=initialState(),ship=createUnit('BLU','FRIGATE','aa',{x:0,y:0}),air=createUnit('RED','JET','air',{x:500,y:0});ship.servicing=false;ship.ammo=100;ship.navalDirective={mode:'AIR_DEFENSE'};air.ammo=0;state.units=[ship,air];const v={height:()=>0,ray:()=>({kind:'clear'})} as unknown as Visibility;resolveCombat(state,v,()=>.5,()=>1);assert.equal(ship.ammo,100);state.time=2.5;resolveCombat(state,v,()=>.5,()=>1);assert.equal(ship.ammo,75);assert.equal(state.missiles.length,1);assert.equal(state.missiles[0].target,'air')})
