import { AIRBASES, type BattleState, type Unit } from './types'
import type { Navigation } from './navigation'
import { travel } from './movement'
import { transferStock } from './sustainment'
import { MOB_TIERS, craneCycle, mobDock, mobTier, mobWorld } from './mob'

const reservedPhases = ['mob-approach','mob-docking','mob-unloading','mob-exit']
export function updateMobTruck(u: Unit, state: BattleState, nav: Navigation): boolean | 'retire' {
  const m=u.transport!
  const phase=(name:string)=>{m.phase=name;m.since=state.time;u.path=[]}
  const occupied=(slot:number)=>state.units.some(v=>v!==u&&v.side===u.side&&v.role==='TRUCK'&&v.hp>0&&!v.servicing&&!v.emergency&&v.transport?.mobDock===slot&&reservedPhases.includes(v.transport.phase))
  if(m.phase==='delivery'){
    if(travel(u,mobWorld(u.side,{x:60,y:125}),nav,state.time,24,0)) {m.queuedAt=state.time;phase('mob-queue')}
  }else if(m.phase==='mob-queue'){
    const queue=state.units.filter(v=>v.side===u.side&&v.hp>0&&!v.servicing&&v.transport?.phase==='mob-queue')
      .sort((a,b)=>(a.transport!.queuedAt??0)-(b.transport!.queuedAt??0)||(a.id<b.id?-1:a.id>b.id?1:0))
    const slot=Array.from({length:MOB_TIERS[mobTier(state,u.side)].cranes},(_,i)=>i).find(i=>!occupied(i))
    if(queue[0]===u&&slot!==undefined){m.mobDock=slot;phase('mob-approach')}
    else {
      u.mission='QUEUED FOR MOB CRANE'
      const rank=Math.max(0,queue.indexOf(u))
      travel(u,mobWorld(u.side,{x:60,y:125+rank*28}),nav,state.time,6,0)
    }
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
    if(travel(u,{x:AIRBASES[u.side].x+18,y:AIRBASES[u.side].y-135},nav,state.time,24,0)){
      if(u.external)return 'retire'
      phase('loading')
    }
  }else return false
  return true
}

