import { AIRBASES, type BattleState, type Unit } from './types'
import type { Navigation } from './navigation'
import { travel } from './movement'
import { transferStock } from './sustainment'
import { MOB_TIERS, MOB_TRUCK_HOLDING, craneCycle, mobDock, mobTier, mobTruckHolding, mobWorld } from './mob'
import { AIRFIELD_TRUCK_LOADING } from './theater'

const reservedPhases = ['mob-approach','mob-docking','mob-unloading','mob-exit']
const holdingPhases = ['delivery','mob-queue','mob-holding']
export function updateMobTruck(u: Unit, state: BattleState, nav: Navigation): boolean | 'retire' {
  const m=u.transport!
  const phase=(name:string)=>{m.phase=name;m.since=state.time;u.path=[]}
  const occupied=(slot:number)=>state.units.some(v=>v!==u&&v.side===u.side&&v.role==='TRUCK'&&v.hp>0&&!v.servicing&&!v.emergency&&v.transport?.mobDock===slot&&reservedPhases.includes(v.transport.phase))
  const holdOwner=(slot:number)=>state.units.filter(v=>v.side===u.side&&v.role==='TRUCK'&&v.hp>0&&!v.servicing&&!v.emergency&&v.transport?.mobHold===slot&&holdingPhases.includes(v.transport.phase)).sort((a,b)=>a.id.localeCompare(b.id))[0]
  const reserveHold=()=>{
    if(m.mobHold!==undefined&&m.mobHold>=0&&m.mobHold<MOB_TRUCK_HOLDING.length&&holdOwner(m.mobHold)===u)return true
    m.mobHold=undefined
    const slot=MOB_TRUCK_HOLDING.findIndex((_,i)=>!holdOwner(i))
    if(slot<0)return false
    m.mobHold=slot;return true
  }
  if(m.phase==='delivery'){
    if(!reserveHold()){u.mission='WAITING FOR MOB HOLDING';return true}
    if(travel(u,mobTruckHolding(u.side,m.mobHold!),nav,state.time,24,0,.5)) {m.queuedAt=state.time;phase('mob-holding')}
  }else if(m.phase==='mob-queue'){
    // Recover old saves whose trucks were already converging on the former shared queue point.
    if(!reserveHold()){u.mission='WAITING FOR MOB HOLDING';return true}
    if(travel(u,mobTruckHolding(u.side,m.mobHold!),nav,state.time,6,0,.5))phase('mob-holding')
  }else if(m.phase==='mob-holding'){
    const queue=state.units.filter(v=>v.side===u.side&&v.hp>0&&!v.servicing&&v.transport?.phase==='mob-holding')
      .sort((a,b)=>(a.transport!.queuedAt??0)-(b.transport!.queuedAt??0)||(a.id<b.id?-1:a.id>b.id?1:0))
    const slot=Array.from({length:MOB_TIERS[mobTier(state,u.side)].cranes},(_,i)=>i).find(i=>!occupied(i))
    u.engine=false;u.path=[];u.mission='QUEUED FOR MOB CRANE'
    if(queue[0]===u&&slot!==undefined){m.mobHold=undefined;m.mobDock=slot;phase('mob-approach')}
  }else if(m.phase==='mob-approach'){
    const dock=mobDock(m.mobDock!)
    if(travel(u,mobWorld(u.side,{x:dock.x,y:105}),nav,state.time,6,0,.15))phase('mob-docking')
  }else if(m.phase==='mob-docking'){
    const dock=mobWorld(u.side,mobDock(m.mobDock!))
    if(travel(u,dock,nav,state.time,3,0,.15)){
      // Final centimetres and heading agree exactly with the crane's pickup pose.
      u.x=dock.x;u.y=dock.y;u.heading=Math.PI
      m.unloadStarted=state.time
      m.unloadSeconds=MOB_TIERS[mobTier(state,u.side)].unloadSeconds
      m.unloadedContainers=0
      phase('mob-unloading')
    }
  }else if(m.phase==='mob-unloading'){
    u.engine=false;u.heading=Math.PI;u.path=[]
    const cycle=craneCycle(m,state.time)
    m.unloadedContainers=cycle.complete ? (m.containerCount??1) : cycle.index
    u.mission=`CRANE ${m.mobDock!+1} · CONTAINER ${cycle.index+1}/${m.containerCount??1}`
    if(cycle.complete){
      if(m.manifest)transferStock(m.manifest,state.depots[u.side].mob)
      m.manifest=undefined;m.cargo=0;m.containerState='empty'
      state.forces[u.side].delivered++
      phase('mob-exit')
    }
  }else if(m.phase==='mob-exit'){
    // Back out of the crane lane before releasing its reservation.
    const dock=mobDock(m.mobDock!)
    if(travel(u,mobWorld(u.side,{x:dock.x,y:112}),nav,state.time,5,0,.3,true)){
      m.mobDock=undefined;m.unloadStarted=undefined;m.unloadSeconds=undefined
      phase('returning')
    }
  }else if(m.phase==='returning'){
    u.mission='RETURNING · EMPTY CONTAINER BED'
    const owner=(slot:number)=>state.units.filter(v=>v.side===u.side&&v.role==='TRUCK'&&v.hp>0&&v.transport?.airfieldSlot===slot&&['pickup','loading','returning'].includes(v.transport.phase)).sort((a,b)=>a.id.localeCompare(b.id))[0]
    let slot=m.airfieldSlot
    if(slot===undefined||slot<0||slot>=AIRFIELD_TRUCK_LOADING.length||owner(slot)!==u)slot=AIRFIELD_TRUCK_LOADING.findIndex((_,i)=>!owner(i))
    if(slot===undefined||slot<0){m.airfieldSlot=undefined;u.engine=false;u.path=[];u.mission='WAITING FOR AIRFIELD LOADING BAY';return true}
    m.airfieldSlot=slot
    const bay=AIRFIELD_TRUCK_LOADING[slot]
    if(travel(u,{x:AIRBASES[u.side].x+bay.x,y:AIRBASES[u.side].y+bay.y},nav,state.time,24,0,.5)){
      u.x=AIRBASES[u.side].x+bay.x;u.y=AIRBASES[u.side].y+bay.y;u.heading=Math.PI
      if(u.external)return 'retire'
      phase('loading')
    }
  }else return false
  return true
}

