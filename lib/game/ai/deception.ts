import type { BattleState, Point, Unit } from '../types'
import { distance, seeded } from './model'

export interface Deception { id:string; sourceUnitId:string; position:Point; startsAt:number; endsAt:number; spent?:boolean; cancelled?:boolean }

/** Abstract deployed decoy signatures use the same observer visibility gate as a real contact. */
export function observeDeceptions(state:BattleState,sees:(observer:Unit,target:Unit)=>boolean) {
  for(const decoy of [...(state.deceptions||[])].sort((a,b)=>a.id.localeCompare(b.id))) {
    if(decoy.cancelled||state.time<decoy.startsAt||state.time>decoy.endsAt)continue
    const source=state.units.find(u=>u.id===decoy.sourceUnitId)
    if(!source)continue
    if(!decoy.spent){
      if(source.hp<=0||source.surrendered||source.carrier||distance(source,decoy.position)>50||!(source.deceptionCharges!>0)){decoy.cancelled=true;continue}
      source.deceptionCharges!--;decoy.spent=true
    }
    const id=`contact-${Math.floor(seeded(state.seed,`signature:${decoy.id}`)*4294967296).toString(16)}`
    const proxy:Unit={...source,...decoy.position,id,hp:100,carrier:undefined,soldiers:[],altitude:0}
    const side=source.side==='BLU'?'RED':'BLU'
    const observers=state.units.filter(u=>u.side===side&&u.hp>0&&!u.surrendered&&!u.carrier&&!u.crewBailed&&!u.external&&distance(u,proxy)<=2500&&sees(u,proxy)).map(u=>u.id).sort()
    if(!observers.length)continue
    state.contacts??={BLU:[],RED:[]}
    const report={unitId:id,role:source.role,position:{...decoy.position},lastSeen:state.time,confidence:1,observers}
    state.contacts[side]=[...state.contacts[side].filter(c=>c.unitId!==id),report].sort((a,b)=>a.unitId.localeCompare(b.unitId))
  }
}
