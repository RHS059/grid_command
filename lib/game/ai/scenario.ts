import { CATALOG, createUnit, initialState, prepareUnit, emptyStock, type Side, type Role, type Point, type Stock } from '../types'
import { initializeHierarchy } from './blackboard'
import { configureOrganization } from './organization'
import { type Doctrine, type Communications, type OrganizationNode, type Personality } from './model'

import type { Deception } from './deception'

export interface ScenarioConfig {
  maritime?: import('../maritime-navigation').MaritimeTheater
  deceptions?: Omit<Deception, 'spent' | 'cancelled'>[]
  version: 1; id: string; name: string; seed: number; date?: string
  sources: { id: string; title: string; reference: string }[]
  units: { navalDirective?: import('../maritime-navigation').NavalDirective; id: string; name?: string; side: Side; role: Role; position: Point; members?: number; deceptionCharges?: number; ammo?: number; fuel?: number; sourceIds?: string[] }[]
  objectives?: { id: string; name: string; position: Point; owner?: Side | null }[]
  sides?: Partial<Record<Side, { organization?: OrganizationNode[]; doctrine?: Partial<Doctrine>; personality?: Partial<Personality>; communications?: Partial<Communications>; stock?: Stock; credits?: number }>>
  automaticReinforcements?: boolean; automaticSupply?: boolean
}
const nonempty=(value:unknown)=>typeof value==='string'&&value.trim().length>0
const range=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max
const point=(p:Point)=>p&&range(p.x,-1e7,1e7)&&range(p.y,-1e7,1e7)
function unique(values:string[],name:string){if(values.some(v=>!nonempty(v)||['__proto__','constructor','prototype'].includes(v))||new Set(values).size!==values.length)throw Error(`${name} must have unique nonempty IDs.`)}

/** Builds a new state atomically. Provenance is retained; references do not certify historical accuracy. */
export function buildScenario(input: ScenarioConfig) {
  const config=structuredClone(input)
  if(config.version!==1||!nonempty(config.id)||!nonempty(config.name)||!Number.isSafeInteger(config.seed))throw Error('Invalid scenario identity/version/seed.')
  if(!Array.isArray(config.sources)||!Array.isArray(config.units)||!config.units.length||config.units.length>512)throw Error('Scenario requires sources and 1–512 represented game units.')
  unique(config.sources.map(s=>s.id),'Sources');unique(config.units.map(u=>u.id),'Units')
  for(const source of config.sources)if(!nonempty(source.title)||!nonempty(source.reference))throw Error('Sources require titles and references.')
  const state=initialState(config.seed),sourceIds=new Set(config.sources.map(s=>s.id))
  state.units=config.units.sort((a,b)=>a.id.localeCompare(b.id)).map(spec=>{
    if(!['BLU','RED'].includes(spec.side)||!Object.hasOwn(CATALOG,spec.role)||!point(spec.position)||spec.sourceIds?.some(id=>!sourceIds.has(id)))throw Error(`Invalid unit ${spec.id}, role, position or provenance.`)
    if(spec.members!==undefined&&(!Number.isInteger(spec.members)||!range(spec.members,1,64)))throw Error('Represented strength must be 1–64 individuals per game unit.')
    for(const amount of [spec.ammo,spec.fuel])if(amount!==undefined&&!range(amount,0,100))throw Error('Unit resources must be 0–100 percent.')
    const unit=createUnit(spec.side,spec.role,spec.id,spec.position)
    if(spec.name!==undefined){if(!nonempty(spec.name))throw Error('Unit name must be nonempty.');unit.name=spec.name}
    if(spec.members!==undefined){unit.members=unit.maxMembers=spec.members;prepareUnit(unit);unit.altitude=0}
    if(spec.ammo!==undefined)unit.ammo=spec.ammo;if(spec.fuel!==undefined)unit.fuel=spec.fuel
    if(spec.deceptionCharges!==undefined){if(!Number.isInteger(spec.deceptionCharges)||!range(spec.deceptionCharges,0,16))throw Error('Invalid deception inventory.');unit.deceptionCharges=spec.deceptionCharges}
    if(spec.navalDirective)unit.navalDirective=structuredClone(spec.navalDirective)
    unit.servicing=false;unit.mission='HOLD'
    return unit
  })
  if(config.objectives){
    if(!config.objectives.length||config.objectives.length>64)throw Error('Scenario requires 1–64 objectives.')
    unique(config.objectives.map(o=>o.id),'Objectives')
    state.objectives=config.objectives.sort((a,b)=>a.id.localeCompare(b.id)).map(o=>{
      if(!nonempty(o.name)||!point(o.position)||o.owner!==undefined&&o.owner!==null&&!['BLU','RED'].includes(o.owner))throw Error(`Invalid objective ${o.id}.`)
      return {...o.position,id:o.id,name:o.name,owner:o.owner??null,contested:false,progress:0,capturing:null,stock:emptyStock(),facilities:{}}
    })
  }
  if(config.deceptions){
    unique(config.deceptions.map(d=>d.id),'Deceptions')
    for(const d of config.deceptions)if(!state.units.some(u=>u.id===d.sourceUnitId)||!point(d.position)||!range(d.startsAt,0,86400)||!range(d.endsAt,d.startsAt,86400))throw Error('Invalid deception deployment.')
    state.deceptions=config.deceptions.map(d=>({id:d.id,sourceUnitId:d.sourceUnitId,position:{...d.position},startsAt:d.startsAt,endsAt:d.endsAt}))
  }
  if(config.maritime){
    const t=config.maritime
    if(!Array.isArray(t.water)||!t.water.length||t.water.length>64||t.water.some(r=>!Array.isArray(r)||r.length<3||r.length>512||r.some(p=>!point(p))))throw Error('Invalid navigable water polygons.')
    unique(t.ports.map(p=>p.id),'Ports');unique(t.landings.map(l=>l.id),'Landings')
    if(t.ports.some(p=>!point(p.position)||!['BLU','RED'].includes(p.side)||Object.values(p.stock).length!==3||['fuel','ammo','repair'].some(k=>!range(p.stock[k as keyof Stock],0,1e6))))throw Error('Invalid port resources.')
    if(t.landings.some(l=>!point(l.water)||!point(l.shore)||Math.hypot(l.water.x-l.shore.x,l.water.y-l.shore.y)>25))throw Error('Invalid landing link.')
    state.maritime=t
  }
  for(const u of state.units){const d=u.navalDirective;if(d&&(!['PATROL','ESCORT','SURFACE_STRIKE','AIR_DEFENSE','AMPHIBIOUS_LIFT'].includes(d.mode)||d.waypoints?.some(p=>!point(p))||d.passengerIds?.some(id=>!state.units.some(s=>s.id===id&&s.side===u.side))))throw Error('Invalid naval directive.')}
  state.behavior=initializeHierarchy(state)
  for(const side of ['BLU','RED'] as const){
    const profile=config.sides?.[side],command=state.behavior.sides[side]
    if(!state.units.some(u=>u.side===side&&u.role==='COMMAND'))throw Error(`Scenario requires a represented ${side} command unit.`)
    for(const [key,value] of Object.entries(profile?.doctrine||{})){
      if(key==='decisionProfile') {
        const p=profile!.doctrine!.decisionProfile!
        if(!p||!nonempty(p.id)||!range(p.threatWeight,0,10)||!range(p.distanceWeight,0,10)||!range(p.recoveryThreshold,0,1)||!range(p.defenseThreshold,p.recoveryThreshold,1)||!range(p.reviewMin,1,300)||!range(p.reviewMax,p.reviewMin,600))throw Error('Invalid decision profile.')
        continue
      }
      const valid=key==='surrender'?typeof value==='boolean':key==='reserveFraction'?range(value,0,.5):key==='maxFronts'?Number.isInteger(value)&&range(value,1,8):['reportLifetime','orderLifetime'].includes(key)&&range(value,1,3600)
      if(!valid)throw Error(`Invalid doctrine parameter ${key}.`)
    }
    for(const [key,value] of Object.entries(profile?.personality||{}))if(!Object.hasOwn(command.personality,key)||!range(value,0,1))throw Error(`Invalid personality parameter ${key}.`)
    for(const [key,value] of Object.entries(profile?.communications||{}))if(!(key==='available'?typeof value==='boolean':key==='loss'?range(value,0,1):key==='delay'&&range(value,0,300)))throw Error(`Invalid communications parameter ${key}.`)
    Object.assign(command.doctrine,profile?.doctrine);Object.assign(command.personality,profile?.personality);Object.assign(command.communications,profile?.communications)
    if(profile?.organization)configureOrganization(command,profile.organization,state.units)
    if(profile?.stock){for(const key of ['fuel','ammo','repair'] as const)if(!range(profile.stock[key],0,1e6))throw Error(`Invalid ${side} stock.`);state.depots[side].mob={...profile.stock}}
    if(profile?.credits!==undefined&&!range(profile.credits,0,1e6))throw Error('Invalid scenario credits.')
    state.forces[side].sp=profile?.credits??0
    if(!config.automaticSupply)state.nextSupply[side]=Number.MAX_SAFE_INTEGER
  }
  state.scenario={id:config.id,name:config.name,date:config.date,sources:config.sources,unitSources:Object.fromEntries(config.units.map(u=>[u.id,u.sourceIds||[]])),automaticReinforcements:!!config.automaticReinforcements}
  state.events=[{id:1,time:0,side:'SYS',type:'system',text:`Scenario ${config.name} loaded. Authored forces and resources; provenance retained without historical certification.`}]
  return state
}
