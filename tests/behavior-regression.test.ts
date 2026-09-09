import test from 'node:test'
import assert from 'node:assert/strict'
import { runBehaviorRegression, evaluateDecisionProfiles } from '../lib/game/ai/regression'
import { BASES } from '../lib/game/types'
import type { ScenarioConfig } from '../lib/game/ai/scenario'

const scenario:ScenarioConfig={version:1,id:'regression',name:'Synthetic calibration fixture',seed:7,sources:[],units:[
  {id:'BLU-command',side:'BLU',role:'COMMAND',position:BASES.BLU},{id:'RED-command',side:'RED',role:'COMMAND',position:BASES.RED},
  ...['a','b','c','d','e','f'].map(id=>({id,side:'BLU' as const,role:'RIFLE' as const,position:BASES.BLU})),
],sides:{BLU:{communications:{delay:2,loss:0}}}}
const profile={id:'test-profile',threatWeight:1,distanceWeight:1,recoveryThreshold:.4,defenseThreshold:.58,reviewMin:20,reviewMax:45}
test('scenario regression reports reproducible bounded finite cognition and monotonic delivered revisions',()=>{
  const a=runBehaviorRegression(scenario,60),b=runBehaviorRegression({...scenario,units:[...scenario.units].reverse()},60)
  assert.deepEqual(a,b);assert.ok(a.delivered>=6);assert.equal(a.monotonic,true);assert.equal(a.finite,true);assert.ok(a.traceCount<=240);assert.ok(a.maxLatency<=4)
})
test('profile evaluation checks explicit seed-based acceptance criteria and rejects invalid calibration',()=>{
  const results=evaluateDecisionProfiles(scenario,[profile],[1,2,3],{seconds:60,maxLatency:4,minimumDelivered:6})
  assert.equal(results[0].passes,true);assert.equal(results[0].runs.length,3)
  assert.throws(()=>evaluateDecisionProfiles(scenario,[{...profile,reviewMin:100,reviewMax:20}],[1],{seconds:10,maxLatency:4,minimumDelivered:1}),/Invalid decision profile/)
  assert.equal(evaluateDecisionProfiles(scenario,[profile],[1],{seconds:0,maxLatency:0,minimumDelivered:1})[0].passes,false)
})
