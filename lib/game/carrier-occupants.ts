import * as T from './scene-data'
import { assetPath } from '@/lib/asset-path'
import { vehicleRig } from './vehicle-animation'
import { SIDE_COLOR, type Side, type Unit, type BattleState } from './types'

/** Canonical full-size crew; each imported clip contains its own vehicle-space root motion. */
export function addCarrierOccupants(root:T.Object3D,side:Side,preview=false){
  const seats=vehicleRig('TROOP_TRUCK')?.seats||[]
  const clips=new Map<string,T.AnimationClip>()
  const crew=seats.map((seat,index)=>{
    const actor=new T.Group();actor.name=index===0?'seated-driver':`seated-passenger-${index-1}`
    actor.userData.nativeAssetURL=assetPath('/models/carrier-soldier.glb');actor.userData.teamColor=SIDE_COLOR[side]
    actor.userData.seatId=seat.id;actor.visible=preview||index===0;root.add(actor);return actor
  })
  const pose=(clip:string,time:number)=>{
    for(let i=0;i<crew.length;i++){
      const id=seats[i].id,name=clip===`mount_${id}`||clip===`dismount_${id}`?clip:`seat_${id}`
      if(!clips.has(name))clips.set(name,new T.AnimationClip(name,80/24,[]))
      crew[i].userData.animationState=[{name,time:name.startsWith('seat_')?0:time,weight:1,clip:clips.get(name)!}]
    }
  }
  root.userData.poseCrewClip=pose;root.userData.crewCount=crew.length;pose('idle',0)
}

export { updateCarrierOccupants } from './carrier-runtime-occupants'
