import { buildScenario, type ScenarioConfig } from './scenario'
import { updateHierarchy } from './hierarchy'
import type { DecisionProfile } from './model'

export interface RegressionMetrics { seed:number; delivered:number; maxLatency:number; meanLatency:number; pending:number; expired:number; frontCount:number; headquarters:number; supportAssigned:number; traceCount:number; monotonic:boolean; finite:boolean; digest:string }

/** Deterministic cognition/communications harness. Physical battle execution is tested separately in the worker. */
export function runBehaviorRegression(config:ScenarioConfig,seconds=120):RegressionMetrics {
  if(!Number.isFinite(seconds)||seconds<0||seconds>3600)throw Error('Regression duration must be 0–3600 seconds.')
  const state=buildScenario(config),latencies:number[]=[],revisions:Record<string,number>={};let monotonic=true,expired=0
  for(let time=0;time<=seconds;time+=.5){
    state.time=time;state.tick=Math.round(time*20)
    const queued=state.behavior!.orders.filter(o=>o.expiresAt<time).length
    expired+=queued
    for(const mission of updateHierarchy(state)){if(mission.revision<=(revisions[mission.unitId]??-1))monotonic=false;revisions[mission.unitId]=mission.revision;latencies.push(time-mission.issuedAt)}
  }
  const ai=state.behavior!,commands=Object.values(ai.sides),serialized=JSON.stringify(ai)
  let digest=2166136261;for(const char of serialized)digest=Math.imul(digest^char.charCodeAt(0),16777619)>>>0
  const finite=(value:unknown):boolean=>typeof value==='number'?Number.isFinite(value):Array.isArray(value)?value.every(finite):value&&typeof value==='object'?Object.values(value).every(finite):true
  return {seed:config.seed,delivered:latencies.length,maxLatency:Math.max(0,...latencies),meanLatency:latencies.length?latencies.reduce((a,b)=>a+b,0)/latencies.length:0,
    pending:ai.orders.length,expired,frontCount:commands.reduce((n,c)=>n+(c.plan?.fronts?.length||Number(!!c.plan)),0),headquarters:commands.reduce((n,c)=>n+Object.keys(c.echelons||{}).length,0),
    supportAssigned:commands.reduce((n,c)=>n+(c.support?.length||0),0),traceCount:ai.traces.length,monotonic,finite:finite(ai),digest:digest.toString(16)}
}

/** Compare authored policy candidates against explicit synthetic acceptance limits; no automatic historical claims. */
export function evaluateDecisionProfiles(config:ScenarioConfig,profiles:DecisionProfile[],seeds:number[],limits:{seconds:number;maxLatency:number;minimumDelivered:number}) {
  return profiles.map(profile=>{
    const runs=seeds.map(seed=>{
      const candidate=structuredClone(config);candidate.seed=seed;candidate.sides??={}
      for(const side of ['BLU','RED'] as const){candidate.sides[side]??={};candidate.sides[side]!.doctrine={...candidate.sides[side]!.doctrine,decisionProfile:profile}}
      return runBehaviorRegression(candidate,limits.seconds)
    })
    return {profile:profile.id,runs,passes:runs.every(r=>r.finite&&r.monotonic&&r.maxLatency<=limits.maxLatency&&r.delivered>=limits.minimumDelivered)}
  })
}
