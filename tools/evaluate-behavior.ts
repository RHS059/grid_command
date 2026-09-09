import fs from 'node:fs'
import { evaluateDecisionProfiles } from '../lib/game/ai/regression'
import type { ScenarioConfig } from '../lib/game/ai/scenario'

const path=process.argv[2]
if(!path)throw Error('Usage: node --import tsx tools/evaluate-behavior.ts <scenario.json>')
const scenario=JSON.parse(fs.readFileSync(path,'utf8')) as ScenarioConfig
const profiles=[
  {id:'game-default-v1',threatWeight:1,distanceWeight:1,recoveryThreshold:.4,defenseThreshold:.58,reviewMin:20,reviewMax:45},
  {id:'cautious-candidate-v1',threatWeight:1.4,distanceWeight:1,recoveryThreshold:.45,defenseThreshold:.65,reviewMin:25,reviewMax:50},
]
const result={scope:'Cognition and communications regression; no physical battle or empirical historical certification.',
  scenario:scenario.id,results:evaluateDecisionProfiles(scenario,profiles,[1,7,37,101],{seconds:120,maxLatency:30,minimumDelivered:4})}
process.stdout.write(JSON.stringify(result,null,2)+'\n')
if(result.results.some(r=>!r.passes))process.exitCode=1
