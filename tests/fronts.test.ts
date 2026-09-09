import test from 'node:test'
import assert from 'node:assert/strict'
import { initialState, createUnit, BASES } from '../lib/game/types'
import { initializeHierarchy } from '../lib/game/ai/blackboard'
import { updateHierarchy } from '../lib/game/ai/hierarchy'
import { planOperation } from '../lib/game/ai/commander'
import { configureOrganization } from '../lib/game/ai/organization'

test('simultaneous fronts issue distinct objective orders without duplicating units or reserve membership',()=>{
  const s=initialState(32)
  s.units=[...s.units.filter(u=>u.role==='COMMAND'),...Array.from({length:8},(_,i)=>createUnit('BLU','RIFLE',`s${i}`,BASES.BLU))]
  s.behavior=initializeHierarchy(s);const c=s.behavior.sides.BLU;c.communications={delay:0,loss:0,available:true}
  const missions=updateHierarchy(s),plan=c.plan!
  assert.equal(plan.fronts!.length,2)
  assert.equal(new Set(missions.filter(m=>m.unitId.startsWith('s')&&m.task!=='RESERVE').map(m=>m.target)).size,2)
  assert.equal(new Set(missions.map(m=>m.unitId)).size,missions.length)
  assert.ok(missions.filter(m=>plan.reserveIds.includes(m.unitId)).every(m=>m.task==='RESERVE'))
  const all=plan.fronts!.flatMap(f=>f.formationIds);assert.equal(all.length,new Set(all).size)
  c.contacts=[{unitId:'reported-threat',role:'TANK',position:{...BASES.BLU},confidence:1,lastSeen:0,observers:['s0']}]
  assert.equal(planOperation('BLU',0,c)!.reserveIds.length,0)
})

test('an authored command branch stays together and distinct branches receive distinct allowed objectives',()=>{
  const s=initialState(77);s.units=[...s.units.filter(u=>u.role==='COMMAND'),...['a','b','c','d'].map(id=>createUnit('BLU','RIFLE',id,BASES.BLU))]
  s.behavior=initializeHierarchy(s);const c=s.behavior.sides.BLU;c.communications={delay:0,loss:0,available:true}
  configureOrganization(c,[{id:'root',name:'Root',echelon:'BRIGADE',unitIds:[]},
    {id:'left',name:'Left',echelon:'COMPANY',parentId:'root',unitIds:['a','b']},
    {id:'right',name:'Right',echelon:'COMPANY',parentId:'root',unitIds:['c','d']}],s.units)
  updateHierarchy(s)
  const a=c.echelons!.left.command.plan!,b=c.echelons!.right.command.plan!
  assert.notEqual(a.target.id,b.target.id)
  assert.ok(s.behavior.units.a.mission?.target===a.target.id)
  assert.ok(s.behavior.units.c.mission?.target===b.target.id)
})
