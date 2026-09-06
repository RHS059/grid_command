import { CATALOG, isVehicle, prepareUnit, type BattleState, type Unit, type Side } from './types'
import { JAMMER } from './theater'
import { Navigation } from './navigation'
import { distance } from './movement'
export function eligibleBuilder(u:Unit){return u.hp>0&&!u.carrier&&(u.role==='LOGISTICS'||(['RIFLE','SCOUT','MG','AT','ENGINEER'].includes(u.role)&&u.soldiers?.some(s=>s.status==='active')))}
export function deployJammer(state:BattleState,nav:Navigation,builderId:string,side:Side):string{
  const builder=state.units.find(u=>u.id===builderId&&u.side===side)
  if(!builder||!eligibleBuilder(builder))return 'An active logistics team or squad leader is required.'
  if(state.units.some(u=>u.construction?.builder===builderId&&u.hp>0))return 'This team is already building.'
  const active=state.units.filter(u=>u.side===side&&u.role==='UAV_JAMMER'&&u.hp>0)
  if(active.length>=JAMMER.cap)return 'Three-jammer limit reached.'
  if(active.some(u=>distance(u,builder)<150))return 'A jammer is already deployed nearby.'
  if(state.forces[side].sp<JAMMER.cost)return 'Insufficient supply points.'
  const p=nav.nearest({x:builder.x+8,y:builder.y+8})
  if(!nav.covered(p)||!nav.clear(p,p))return 'Placement terrain is not ready or obstructed.'
  const u:Unit={...p,id:`${side}-jammer-${state.tick}-${state.units.length}`,name:`${side} UAV DENIAL`,side,role:'UAV_JAMMER',members:0,maxMembers:0,hp:100,ammo:0,fuel:100,heading:0,mission:'BUILDING',target:builder.target,path:[],spotted:false,firing:false,kills:0,subcommand:'ELECTRONIC WARFARE',construction:{builder:builder.id,due:state.time+JAMMER.buildSeconds}}
  prepareUnit(u);state.units.push(u);state.forces[side].sp-=JAMMER.cost;builder.path=[];return ''
}
export function updateJammers(state:BattleState,nav:Navigation){
  for(const u of state.units){if(u.role!=='UAV_JAMMER'||u.hp<=0)continue
    if(u.construction){const b=state.units.find(b=>b.id===u.construction!.builder);if(!b||!eligibleBuilder(b)||distance(b,u)>50){u.hp=0;u.mission='BUILD INTERRUPTED';continue}b.path=[];if(state.time>=u.construction.due){u.construction=undefined;u.mission='JAMMING'}}
  }
  if(state.tick%600===0)for(const side of ['BLU','RED'] as const){const b=state.units.find(u=>u.side===side&&eligibleBuilder(u)&&state.objectives.some(o=>o.owner===side&&distance(o,u)<120));if(b)deployJammer(state,nav,b.id,side)}
}
export function jammed(observer:Unit,target:Unit,state:BattleState){return observer.role==='RECON_UAV'&&state.units.some(j=>j.role==='UAV_JAMMER'&&j.side!==observer.side&&j.hp>0&&!j.construction&&(distance(j,observer)<=JAMMER.radius||distance(j,target)<=JAMMER.radius))}
