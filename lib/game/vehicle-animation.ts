import * as T from './scene-data'
import type { Role } from './types'
import tank from './generated/tank_rig.json'
import troop from './generated/troop_transport_rig.json'
import apc from './generated/apc_rig.json'
import cargo from './generated/vtol_cargo_rig.json'
import attack from './generated/vtol_attack_rig.json'
import cas from './generated/cas_rig.json'
import fighter from './generated/fighter_rig.json'

export interface VehicleClip { id:string; label:string; duration:number; loop:boolean }
export interface RigNode { pivot:number[]; kind:string; parent?:string; closed?:number; phase?:number }
export interface VehicleRig { nodes:Record<string,RigNode>; clips:VehicleClip[]; variant:string }
const rigs:Partial<Record<Role,VehicleRig>>={TANK:tank,TROOP_TRUCK:troop,APC:apc,HEAVY_LIFT_HELI:cargo,ATTACK_HELI:attack,CAS_FIGHTER:cas,JET:fighter}
export const vehicleRig=(role:string)=>rigs[role as Role]
export const vehicleClips=(role:string):VehicleClip[]=>vehicleRig(role)?.clips||[]
export function advanceVehiclePlayback(time:number,dt:number,playing:boolean,duration:number,loop:boolean){
  if(!playing)return Math.max(0,Math.min(duration,time))
  const next=time+Math.max(0,dt);return loop&&duration>0?next%duration:Math.min(duration,next)
}
function trackPath(u:number):[number,number,number]{const r=.66,arc=Math.PI*r,length=10+2*arc;u=((u%length)+length)%length
  if(u<5)return[-2.5+u,1.38,0]
  if(u<5+arc){const a=Math.PI/2-(u-5)/r;return[2.5+r*Math.cos(a),.72+r*Math.sin(a),Math.PI/2-a]}
  if(u<10+arc)return[2.5-(u-5-arc),.06,Math.PI]
  const a=-Math.PI/2-(u-10-arc)/r;return[-2.5+r*Math.cos(a),.72+r*Math.sin(a),Math.PI/2-a]
}
/** Absolute sampling makes clip changes, reverse scrubbing and restart deterministic. */
export function sampleVehicleNode(node:RigNode,clip:string,time:number,duration:number){
  const q=Math.max(0,Math.min(1,time/duration)),rotation:[number,number,number]=[node.kind==='ramp'?(node.closed||0):0,0,0],offset:[number,number,number]=[0,0,0]
  if(clip==='drive'){
    if(node.kind==='wheel')rotation[0]=-time*Math.PI*4
    if(node.kind==='track'){const a=trackPath(node.phase||0),b=trackPath((node.phase||0)+time*(10+Math.PI*1.32)/duration);offset[1]=b[0]-a[0];offset[2]=b[1]-a[1];rotation[0]=b[2]-a[2]}
  }
  if(clip==='aim'&&node.kind==='turret')rotation[2]=Math.sin(q*Math.PI*2)*.7
  if(clip==='shoot'){
    if(node.kind==='recoil')offset[1]=-.24*Math.max(0,1-Math.abs(time-.12)/.12)
    if(node.kind==='store'){offset[1]=Math.max(0,time-.2)*7;offset[2]=-Math.max(0,time-.2)*.5}
  }
  if(clip==='open'||clip==='close'){const amount=clip==='open'?q:1-q;if(node.kind==='ramp')rotation[0]=(node.closed||0)*(1-amount);if(node.kind==='door')offset[1]=-amount*2.2}
  if((clip==='rotors'||clip==='fly')&&node.kind==='rotor')rotation[1]=time*Math.PI*8
  if(clip==='fly'&&node.kind==='control')rotation[0]=Math.sin(q*Math.PI*2)*.2
  if(clip==='tilt'&&node.kind==='nacelle')rotation[0]=q*Math.PI/2
  if((clip==='gear'||clip==='gear_down')&&node.kind==='gear'){const a=(clip==='gear'?q:1-q)*Math.PI/2;if(Math.abs(node.pivot[0])<.5)rotation[0]=-a;else rotation[1]=a*(node.pivot[0]>0?1:-1)}
  return{rotation,offset}
}
export function poseVehicleClip(root:T.Object3D,clipId:string,time:number){
  const rig=vehicleRig(root.name);if(!rig)return
  const clip=rig.clips.find(c=>c.id===clipId)||rig.clips[0],t=Math.max(0,Math.min(clip.duration,time))
  for(const [name,node] of Object.entries(rig.nodes)){
    const object=root.getObjectByName(name);if(!object)continue
    const base=node.pivot.map((v,i)=>v-(node.parent?rig.nodes[node.parent].pivot[i]:0)),sample=sampleVehicleNode(node,clip.id,t,clip.duration)
    object.position.set(base[0]+sample.offset[0],base[1]+sample.offset[1],base[2]+sample.offset[2]);object.rotation.set(...sample.rotation)
  }
  root.userData.activeVehicleClip=clip.id;root.userData.vehicleClipTime=t
}
export function animateVehicleGameplay(root:T.Object3D,time:number,motion?:{heading:number;aim?:number;active:boolean;x?:number;y?:number;time?:number}){
  const rig=vehicleRig(root.name);if(!rig)return
  const previous=root.userData.vehicleMotion as {x:number;y:number}|undefined
  const moving=!motion||motion.x===undefined||!previous||Math.hypot((motion.x??0)-previous.x,(motion.y??0)-previous.y)>.001
  if(motion?.x!==undefined)root.userData.vehicleMotion={x:motion.x,y:motion.y??0}
  const air=['CAS_FIGHTER','JET','ATTACK_HELI','HEAVY_LIFT_HELI'].includes(root.name),id=motion?.active===false?'idle':air?'fly':moving?'drive':'idle',clip=rig.clips.find(c=>c.id===id)||rig.clips[0]
  poseVehicleClip(root,clip.id,time%clip.duration)
  const turret=root.getObjectByName('turret');if(turret&&motion)turret.rotation.z=motion.heading-(motion.aim??motion.heading)
}
