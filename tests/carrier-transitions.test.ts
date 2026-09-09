import test from 'node:test'
import assert from 'node:assert/strict'
import { createUnit, initialState, BASES } from '../lib/game/types'
import { Navigation } from '../lib/game/navigation'
import { manualGetIn, updateTransports, requestDismount, assignTransports } from '../lib/game/transport'
import { carrierEntry, carrierActorIds, CARRIER_CLIP_SECONDS } from '../lib/game/carrier-transitions'
import { addCarrierOccupants, updateCarrierOccupants } from '../lib/game/carrier-occupants'
import * as T from '../lib/game/scene-data'
import { updateSoldiers } from '../lib/game/behaviors'
import { Visibility } from '../lib/game/visibility'

function fixture() {
  const state=initialState(), carrier=createUnit('BLU','TROOP_TRUCK','carrier',BASES.BLU), squad=createUnit('BLU','RIFLE','riders',BASES.BLU)
  carrier.servicing=false;carrier.fuel=100;carrier.heading=.7;carrier.altitude=0
  state.units=[carrier,squad]
  const nav={covered:()=>true,clear:()=>true,nearest:(p:{x:number;y:number})=>({...p}),route:(_:unknown,p:{x:number;y:number})=>[{...p}]} as unknown as Navigation
  assert.equal(manualGetIn(state,'BLU',squad.id,carrier.id),true)
  Object.assign(carrier.transport!,{phase:'boarding',pickupFor:squad.id,since:0})
  return {state,carrier,squad,nav}
}
function stage(f:ReturnType<typeof fixture>) {
  updateTransports(f.state,f.nav)
  for(const o of f.carrier.transport!.occupants!)Object.assign(f.squad.soldiers!.find(s=>s.id===o.soldierId)!,carrierEntry(f.carrier,o.seatId))
  f.state.time=1;updateTransports(f.state,f.nav)
}
function embarked(f:ReturnType<typeof fixture>) {stage(f);f.state.time=5;updateTransports(f.state,f.nav);assert.equal(f.squad.carrier,f.carrier.id)}

test('mount starts at clip entries, hides one ground identity per actor, holds position and observes both timing gates',()=>{
  const f=fixture(),original={x:f.carrier.x,y:f.carrier.y,heading:f.carrier.heading};updateTransports(f.state,f.nav)
  assert.ok(f.carrier.transport!.occupants!.every(o=>o.phase==='approaching'))
  assert.equal(carrierActorIds(f.state).size,0)
  stage(f);assert.equal(carrierActorIds(f.state).size,f.squad.soldiers!.length)
  const root=new T.Group();addCarrierOccupants(root,'BLU');updateCarrierOccupants(root,f.carrier,f.state)
  const record=f.carrier.transport!.occupants![0],actor=root.children.find(o=>o.userData.seatId===record.seatId)!
  assert.equal(actor.userData.animationState[0].name,`mount_${record.seatId}`)
  f.state.time=1+CARRIER_CLIP_SECONDS-.001;updateTransports(f.state,f.nav);assert.equal(f.squad.carrier,undefined)
  const serialized=JSON.stringify(f.carrier.transport!.occupants);updateTransports(f.state,f.nav);assert.equal(JSON.stringify(f.carrier.transport!.occupants),serialized)
  f.state.time=1+CARRIER_CLIP_SECONDS;updateTransports(f.state,f.nav);assert.equal(f.squad.carrier,undefined)
  f.state.time=5;updateTransports(f.state,f.nav);assert.equal(f.squad.carrier,f.carrier.id);assert.equal(f.carrier.transport!.phase,'transit')
  assert.deepEqual({x:f.carrier.x,y:f.carrier.y,heading:f.carrier.heading},original)
})

test('unloading keeps stable seats after casualty, serializes exits, and places the ground soldier only at clip completion',()=>{
  const f=fixture();embarked(f)
  const records=f.carrier.transport!.occupants!.map(o=>({...o}));f.squad.soldiers!.find(s=>s.id===records[0].soldierId)!.status='downed'
  assert.equal(requestDismount(f.state,f.nav,'BLU',f.carrier.id),true)
  f.state.time=6;updateTransports(f.state,f.nav)
  const o=f.carrier.transport!.occupants!.find(o=>o.phase==='dismounting')!, body=f.squad.soldiers!.find(s=>s.id===o.soldierId)!
  assert.equal(o.seatId,records[1].seatId);assert.equal(body.disembarked,undefined)
  assert.equal(f.carrier.transport!.occupants!.filter(o=>o.phase==='dismounting').length,1)
  f.state.time=6+CARRIER_CLIP_SECONDS-.001;updateTransports(f.state,f.nav);assert.equal(body.disembarked,undefined)
  const endpoint=carrierEntry(f.carrier,o.seatId)
  f.state.time=6+CARRIER_CLIP_SECONDS;updateTransports(f.state,f.nav)
  assert.equal(body.disembarked,true);assert.deepEqual({x:body.x,y:body.y},endpoint);assert.equal(carrierActorIds(f.state).has(body.id),false)
  assert.equal(f.carrier.transport!.occupants!.find(o=>o.soldierId===records[2].soldierId)!.seatId,records[2].seatId)
  for(let i=0;i<20&&f.squad.carrier;i++){f.state.time+=4.4;updateTransports(f.state,f.nav)}
  assert.equal(f.squad.carrier,undefined);assert.equal(f.carrier.transport!.phase,'escort');assert.deepEqual(f.carrier.transport!.occupants,[])
})

test('unsafe exit stays seated and cancelled, dead, or removed reservations do not suppress infantry',()=>{
  const f=fixture();embarked(f);requestDismount(f.state,f.nav,'BLU',f.carrier.id);f.state.time=6
  const unsafe={...f.nav,covered:()=>false} as unknown as Navigation;updateTransports(f.state,unsafe)
  assert.ok(f.carrier.transport!.occupants!.every(o=>o.phase==='seated'));assert.equal(f.carrier.transport!.unloaded,0)
  const g=fixture();stage(g);g.squad.soldiers![0].status='downed';updateTransports(g.state,g.nav)
  assert.equal(carrierActorIds(g.state).has(g.squad.soldiers![0].id),false)
  g.carrier.hp=0;updateTransports(g.state,g.nav);assert.equal(carrierActorIds(g.state).size,0);assert.equal(g.squad.mission,'WAITING FOR TRANSPORT')
  const h=fixture();stage(h);h.state.units=[h.squad];assignTransports(h.state,h.nav);assert.notEqual(h.squad.mission,'BOARDING');assert.equal(carrierActorIds(h.state).size,0)
})

test('automatic assignment uses the same staged transition path',()=>{
  const f=fixture();f.carrier.transport=undefined;f.carrier.attachedSquad=undefined;f.squad.attachedVehicles=undefined
  const destination={x:f.squad.x+3000,y:f.squad.y};f.squad.path=[destination];f.squad.target='far';f.squad.mission='CAPTURE'
  f.state.objectives=[];assignTransports(f.state,f.nav)
  assert.deepEqual(f.carrier.transport!.passengers,[f.squad.id]);assert.equal(f.carrier.transport!.manual,undefined)
  Object.assign(f.carrier.transport!,{phase:'boarding',pickupFor:f.squad.id});stage(f)
  assert.ok(f.carrier.transport!.occupants!.every(o=>o.phase==='mounting'))
})

test('approach advances over simulation ticks, infantry behavior cannot move mounting actors, and failed approach releases reservations',()=>{
  const f=fixture();updateTransports(f.state,f.nav)
  const first=f.squad.soldiers![0], before={x:first.x,y:first.y}
  f.state.time=.05;updateTransports(f.state,f.nav)
  assert.ok(Math.hypot(first.x-before.x,first.y-before.y)>0)
  assert.ok(Math.hypot(first.x-before.x,first.y-before.y)<=.150001)
  const held=f.squad.soldiers!.map(s=>({x:s.x,y:s.y}))
  updateSoldiers(f.state,new Visibility(),f.nav,()=>0)
  assert.deepEqual(f.squad.soldiers!.map(s=>({x:s.x,y:s.y})),held)
  const blocked={...f.nav,clear:()=>false,route:()=>[]} as unknown as Navigation
  f.state.time=61;updateTransports(f.state,blocked)
  assert.deepEqual(f.carrier.transport!.occupants,[]);assert.deepEqual(f.carrier.transport!.passengers,[])
  assert.notEqual(f.squad.mission,'BOARDING');assert.equal(carrierActorIds(f.state).size,0)
})
