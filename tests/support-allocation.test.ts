import test from 'node:test'
import assert from 'node:assert/strict'
import { initialState, createUnit, BASES } from '../lib/game/types'
import { initializeHierarchy } from '../lib/game/ai/blackboard'
import { planOperation } from '../lib/game/ai/commander'
import { allocateSupport, supportCapabilities } from '../lib/game/ai/support'
import { readinessSnapshot } from '../lib/game/ai/reporting'
import { serviceVehicle } from '../lib/game/sustainment'

function setup(){
  const s=initialState(18),a=createUnit('BLU','RIFLE','a',BASES.BLU),b=createUnit('BLU','RIFLE','b',BASES.BLU),gun=createUnit('BLU','MORTAR','gun',BASES.BLU)
  s.units.push(a,b,gun);s.behavior=initializeHierarchy(s);const c=s.behavior.sides.BLU;c.plan=planOperation('BLU',0,c)
  return {s,c,a,b,gun}
}
test('support allocation reserves an available asset once across implemented theater controllers',()=>{
  const {s,c}=setup();for(const id of ['a','b'])c.readiness[id].supportRequest={kind:'FIRE',since:0,expiresAt:100}
  const missions=allocateSupport(s,c);assert.equal(missions.length,1);assert.equal(missions[0].unitId,'gun')
  assert.equal(allocateSupport(s,c).length,0);assert.deepEqual(supportCapabilities.naval,['FIRE']);assert.deepEqual(supportCapabilities.amphibious,['FIRE','LIFT'])
})
test('assigned support is not fulfilled by arrival or hidden live firing; received acceptance and fire evidence are required',()=>{
  const {s,c,gun}=setup();c.readiness.a.supportRequest={kind:'FIRE',since:0,expiresAt:100};allocateSupport(s,c)
  const allocation=c.support![0];allocation.revision=4;s.time=2;gun.firing=true;allocateSupport(s,c);assert.equal(allocation.status,'ASSIGNED')
  c.readiness.gun.execution={revision:4,task:'SUPPORT',target:c.plan!.target.id,status:'ACCEPTED',changedAt:1,sequence:0,reason:'Route accepted'}
  allocateSupport(s,c);assert.equal(allocation.status,'ACCEPTED')
  c.readiness.gun.lastFiredAt=1;allocateSupport(s,c);assert.equal(allocation.status,'FULFILLED');assert.match(allocation.reason,/suppression is not certified/)
})
test('depot allocation does not create ammunition and waits for real restoration',()=>{
  const {s,c}=setup(),tank=createUnit('BLU','TANK','tank',BASES.BLU);tank.ammo=0;tank.fuel=100;tank.servicing=false;s.units.push(tank)
  c.readiness.tank={...readinessSnapshot(tank,0),supportRequest:{kind:'AMMO',since:0,expiresAt:100}}
  allocateSupport(s,c);const a=c.support![0];a.revision=3
  const execution={revision:3,task:'RESUPPLY' as const,target:c.plan!.target.id,status:'COMPLETED' as const,changedAt:1,sequence:0,reason:'Resource check'}
  serviceVehicle(s,tank,60);c.readiness.tank={...readinessSnapshot(tank,1),execution};s.time=1;allocateSupport(s,c)
  assert.equal(tank.ammo,0);assert.notEqual(a.status,'FULFILLED')
  s.depots.BLU.mob.ammo=10000;const before=s.depots.BLU.mob.ammo
  for(let i=0;i<10;i++)serviceVehicle(s,tank,60)
  c.readiness.tank={...readinessSnapshot(tank,2),execution};s.time=2;allocateSupport(s,c)
  assert.ok(tank.ammo>=80);assert.ok(s.depots.BLU.mob.ammo<before);assert.equal(a.status,'FULFILLED')
})
