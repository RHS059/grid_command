import test from 'node:test'
import assert from 'node:assert/strict'
import { buildScenario, type ScenarioConfig } from '../lib/game/ai/scenario'
import { BASES, initialState, type BattleState } from '../lib/game/types'

const config=():ScenarioConfig=>({version:1,id:'training',name:'Authored training force',seed:77,sources:[{id:'author',title:'Scenario author',reference:'Synthetic test, no historical claim'}],
  units:[{id:'BLU-command',side:'BLU',role:'COMMAND',position:BASES.BLU},{id:'RED-command',side:'RED',role:'COMMAND',position:BASES.RED},
    {id:'alpha',side:'BLU',role:'RIFLE',position:BASES.BLU,members:7,ammo:45,sourceIds:['author']}],
  sides:{BLU:{doctrine:{maxFronts:3,reserveFraction:.3},communications:{delay:4,loss:.1},stock:{fuel:20,ammo:30,repair:10},organization:[{id:'hq',name:'Company',echelon:'COMPANY',commanderUnitId:'BLU-command',unitIds:['alpha']}]}}})

test('scenario ORBAT, doctrine, resources and provenance are copied canonically without implicit reinforcements',()=>{
  const input=config(),a=buildScenario(input),b=buildScenario({...input,units:[...input.units].reverse()})
  assert.deepEqual(a,b);assert.equal(a.units.find(u=>u.id==='alpha')!.soldiers!.length,7)
  assert.equal(a.units.find(u=>u.id==='alpha')!.ammo,45);assert.equal(a.behavior!.sides.BLU.doctrine.maxFronts,3)
  assert.deepEqual(a.depots.BLU.mob,{fuel:20,ammo:30,repair:10});assert.equal(a.forces.BLU.sp,0)
  assert.equal(a.scenario!.automaticReinforcements,false);assert.equal(a.nextSupply.BLU,Number.MAX_SAFE_INTEGER)
  input.units[2].ammo=100;input.sources[0].title='changed';assert.equal(a.units.find(u=>u.id==='alpha')!.ammo,45);assert.equal(a.scenario!.sources[0].title,'Scenario author')
})

test('invalid roles, numeric policies, provenance and organization are rejected atomically',()=>{
  const input=config(),before=structuredClone(input)
  for(const mutate of [
    (c:ScenarioConfig)=>{c.units[2].role='NAVAL' as never},
    (c:ScenarioConfig)=>{c.units[2].id='__proto__'},
    (c:ScenarioConfig)=>{c.units[2].sourceIds=['missing']},
    (c:ScenarioConfig)=>{c.sides!.BLU!.doctrine!.reserveFraction=2},
    (c:ScenarioConfig)=>{c.units[2].position={x:NaN,y:0}},
    (c:ScenarioConfig)=>{c.sides!.BLU!.organization![0].unitIds=['missing']},
  ]){const invalid=structuredClone(input);mutate(invalid);assert.throws(()=>buildScenario(invalid));assert.deepEqual(input,before)}
})

test('worker accepts authored scenarios, preserves the running scenario after rejection, and restarts deterministically',async()=>{
  const scope=globalThis as unknown as {self:{onmessage:(e:{data:Record<string,unknown>})=>void;postMessage:(s:BattleState)=>void}}
  const previousSelf=scope.self,previousInterval=globalThis.setInterval;let state=initialState(),update=()=>{}
  scope.self={onmessage:()=>{},postMessage:s=>{state=s}};globalThis.setInterval=((fn:()=>void)=>{update=fn;return 0}) as unknown as typeof setInterval
  try{
    await import('../lib/game/simulation.worker')
    const send=(scenario:unknown)=>scope.self.onmessage({data:{type:'restart',scenario}})
    send(config());assert.equal(state.scenario!.id,'training');for(let i=0;i<40;i++)update()
    const first=JSON.stringify({...state,workerMs:0});send(config());for(let i=0;i<40;i++)update();assert.equal(JSON.stringify({...state,workerMs:0}),first)
    const units=structuredClone(state.units),tick=state.tick;send({...config(),units:[]})
    assert.deepEqual(state.units,units);assert.equal(state.tick,tick);assert.ok(state.events[0].text.startsWith('Scenario rejected:'))
  }finally{scope.self=previousSelf;globalThis.setInterval=previousInterval}
})
