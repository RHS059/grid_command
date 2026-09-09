import * as T from './scene-data'
import { CARRIER_CLIP_SECONDS } from './carrier-transitions'
import { vehicleRig } from './vehicle-animation'
import type { Unit, BattleState } from './types'

export function updateCarrierOccupants(root:T.Object3D,carrier:Unit,state:BattleState){
  const driver=root.getObjectByName('seated-driver');if(driver)driver.visible=carrier.hp>0&&carrier.members>0&&!carrier.crewBailed
  const passengers=state.units.filter(u=>u.carrier===carrier.id).flatMap(u=>u.soldiers||[]).filter(s=>s.status==='active'&&!s.disembarked)
  const capacity=(vehicleRig('TROOP_TRUCK')?.seats?.length||1)-1
  for(let i=0;i<capacity;i++){
    const seat=root.getObjectByName(`seated-passenger-${i}`);if(!seat)continue
    const records=carrier.transport?.occupants
    if(records===undefined){seat.visible=carrier.hp>0&&i<passengers.length;continue}
    const occupant=records.find(o=>o.seatId===seat.userData.seatId&&o.phase!=='approaching')
    const living=occupant&&state.units.find(u=>u.id===occupant.squadId)?.soldiers?.some(s=>s.id===occupant.soldierId&&s.status==='active'&&!s.disembarked)
    seat.visible=carrier.hp>0&&!!living
    if(!occupant||!living)continue
    const name=`${occupant.phase==='mounting'?'mount':occupant.phase==='dismounting'?'dismount':'seat'}_${occupant.seatId}`
    seat.userData.animationState=[{name,time:occupant.phase==='seated'?0:Math.max(0,Math.min(CARRIER_CLIP_SECONDS,state.time-occupant.startedAt)),weight:1,clip:new T.AnimationClip(name,CARRIER_CLIP_SECONDS,[])}]
  }
}
