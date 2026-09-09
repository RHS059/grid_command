import test from 'node:test'
import assert from 'node:assert/strict'
import { initialState, createUnit, BASES, type BattleState } from '../lib/game/types'
import { initializeHierarchy } from '../lib/game/ai/blackboard'
import { configureOrganization } from '../lib/game/ai/organization'
import { updateHierarchy } from '../lib/game/ai/hierarchy'

function scenario() {
  const state=initialState(410),units=['a','b','c','d'].map(id=>createUnit('BLU','RIFLE',id,BASES.BLU))
  state.units=[...state.units.filter(u=>u.role==='COMMAND'),...units]
  state.behavior=initializeHierarchy(state)
  const command=state.behavior.sides.BLU;command.communications={delay:2,loss:0,available:true}
  configureOrganization(command,[
    {id:'root',name:'Brigade',echelon:'BRIGADE',unitIds:[],commanderUnitId:'BLU-command'},
    {id:'left',name:'Left company',echelon:'COMPANY',parentId:'root',unitIds:['a','b'],commanderUnitId:'a'},
    {id:'right',name:'Right company',echelon:'COMPANY',parentId:'root',unitIds:['c','d'],commanderUnitId:'c'},
  ],state.units)
  return state
}
const tick=(s:BattleState,t:number)=>{s.time=t;s.tick=Math.round(t*20);return updateHierarchy(s)}

test('authored headquarters receive intent before independently planning and issuing local orders',()=>{
  const s=scenario();tick(s,0);const root=s.behavior!.sides.BLU
  assert.equal(!!root.echelons!.left.command.plan,false);assert.ok(!s.behavior!.orders.some(o=>o.unitId==='a'))
  tick(s,2);assert.ok(root.echelons!.left.command.plan);assert.ok(root.echelons!.right.command.plan)
  const rightRevision=root.echelons!.right.command.plan!.revision
  root.echelons!.left.command.nextReview=2.5;root.echelons!.right.command.nextReview=100
  tick(s,2.5);assert.equal(root.echelons!.left.command.plan!.revision,2);assert.equal(root.echelons!.right.command.plan!.revision,rightRevision)
  assert.ok(tick(s,4).some(m=>m.unitId==='a'));assert.notDeepEqual(root.echelons!.left.command.personality,root.echelons!.right.command.personality)
})

test('local succession disrupts only its headquarters and preserves already delivered intent',()=>{
  const s=scenario();tick(s,0);tick(s,2);tick(s,4)
  const root=s.behavior!.sides.BLU, prior=s.behavior!.units.b.mission
  s.units.find(u=>u.id==='a')!.hp=0;tick(s,4.5)
  assert.equal(root.echelons!.left.commanderId,'b');assert.equal(root.echelons!.left.command.degraded,true)
  assert.ok(root.echelons!.left.command.nextReview>=19.5);assert.equal(root.echelons!.right.command.degraded,false);assert.equal(root.degraded,false)
  assert.deepEqual(s.behavior!.units.b.mission,prior)
})

test('subordinate readiness is delayed and packet blackout cannot leak fresh local resources',()=>{
  const s=scenario();tick(s,0);tick(s,2);const root=s.behavior!.sides.BLU,node=root.echelons!.left
  s.units.find(u=>u.id==='b')!.ammo=1;tick(s,5)
  assert.equal(node.command.readiness.b.ammo,100);tick(s,7);assert.equal(node.command.readiness.b.ammo,1)
  node.command.communications.available=false;s.units.find(u=>u.id==='b')!.ammo=70;tick(s,10);tick(s,12)
  assert.equal(node.command.readiness.b.ammo,1)
})

test('echelon planning replays deterministically across reordered input and hidden enemy movement',()=>{
  const a=scenario(),b=scenario();b.units.reverse()
  for(const time of [0,2,4,6,10,20,40]){tick(a,time);tick(b,time)}
  assert.deepEqual(a.behavior!.sides.BLU,b.behavior!.sides.BLU)
})

test('subordinate replanning cannot extend the original parent intent expiry',()=>{
  const s=scenario(),root=s.behavior!.sides.BLU;root.doctrine.orderLifetime=10
  tick(s,0);tick(s,2);root.nextReview=1000;root.degraded=true
  root.echelons!.left.command.nextReview=8;tick(s,8)
  assert.equal(root.echelons!.left.command.plan!.expiresAt,10)
  assert.ok(s.behavior!.orders.filter(o=>o.issuer==='left').every(o=>o.expiresAt<=10))
  const revision=root.echelons!.left.command.plan!.revision;root.echelons!.left.command.nextReview=11;tick(s,11)
  assert.equal(root.echelons!.left.command.plan!.revision,revision)
})
