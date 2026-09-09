import test from 'node:test'
import assert from 'node:assert/strict'
import { initialState, createUnit, BASES } from '../lib/game/types'
import { Perception } from '../lib/game/perception'
import { initializeHierarchy, updateBlackboards } from '../lib/game/ai/blackboard'
import { updateOpponentModel } from '../lib/game/ai/opponent'
import { planOperation } from '../lib/game/ai/commander'

test('deployed signatures consume one authored charge and require real observer visibility and reporting delay',()=>{
  const s=initialState(9),source=createUnit('RED','TANK','source',BASES.BLU),observer=createUnit('BLU','SCOUT','observer',BASES.BLU)
  source.deceptionCharges=1;s.units=[source,observer];s.deceptions=[{id:'operation',sourceUnitId:source.id,position:{...BASES.BLU},startsAt:0,endsAt:10}]
  s.behavior=initializeHierarchy(s);s.behavior.sides.BLU.communications={delay:2,loss:0,available:true}
  const perception=new Perception();perception.update(s,()=>false);assert.equal(s.contacts!.BLU.length,0);assert.equal(source.deceptionCharges,0)
  s.time=.5;perception.update(s,(_,target)=>target.id!==source.id);updateBlackboards(s,s.behavior)
  assert.equal(s.contacts!.BLU.length,1);assert.equal(s.behavior.sides.BLU.contacts.length,0);assert.equal(source.deceptionCharges,0)
  s.time=2.5;updateBlackboards(s,s.behavior);assert.equal(s.behavior.sides.BLU.contacts.length,1)
  assert.ok(!('spent' in s.behavior.sides.BLU.contacts[0]));assert.ok(!('decoy' in s.behavior.sides.BLU.contacts[0]))
})
test('counterdeception reduces implausible observations while retaining uncertainty and alternate intent hypotheses',()=>{
  const s=initialState(),c=initializeHierarchy(s).sides.BLU
  c.contacts=[{unitId:'unknown',role:'RIFLE',position:{x:0,y:0},lastSeen:0,confidence:1,observers:['one']}]
  updateOpponentModel(c,0);const initial=c.opponent!.unknown.credibility
  c.contacts[0]={...c.contacts[0],position:{x:2000,y:0},lastSeen:1};updateOpponentModel(c,1)
  assert.ok(c.opponent!.unknown.credibility<initial);assert.ok(c.opponent!.unknown.credibility>0)
  assert.ok(c.opponent!.unknown.intent.unknown>0)
  updateOpponentModel(c,10);assert.ok(c.opponent!.unknown.uncertaintyMeters>10)
})
test('opponent inference and scores cannot consult hidden enemy positions or truth labels',()=>{
  const a=initialState(10),b=initialState(10),ca=initializeHierarchy(a).sides.BLU,cb=initializeHierarchy(b).sides.BLU
  const observation={unitId:'opaque',role:'TANK' as const,position:{x:0,y:0},lastSeen:0,confidence:1,observers:['one','two']}
  ca.contacts=[structuredClone(observation)];cb.contacts=[structuredClone(observation)]
  b.units.find(u=>u.side==='RED')!.x+=50000
  assert.deepEqual(planOperation('BLU',0,ca),planOperation('BLU',0,cb));assert.deepEqual(ca.opponent,cb.opponent)
})
