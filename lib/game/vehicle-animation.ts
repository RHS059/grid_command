import { poseAircraftWeapons } from './aircraft-weapons'
import * as T from './scene-data'
import type { Role } from './types'
import tank from './generated/tank_rig.json'
import troop from './generated/troop_transport_rig.json'
import apc from './generated/apc_rig.json'
import cannonApc from './generated/cannon_apc_rig.json'
import amphibiousApc from './generated/amphibious_apc_rig.json'
import cargo from './generated/vtol_cargo_rig.json'
import attack from './generated/vtol_attack_rig.json'
import cas from './generated/cas_rig.json'
import reconUav from './generated/recon_uav_rig.json'
import fighter from './generated/fighter_rig.json'
import patrolBoat from './generated/patrol_boat_rig.json'
import landingCraft from './generated/landing_craft_rig.json'
import aircraftCarrier from './generated/aircraft_carrier_rig.json'
import missileCruiser from './generated/missile_cruiser_rig.json'
import { updateVehicleEffects } from './vehicle-effects'
import { nativeVehicleAsset, setNativeVehicleClip } from './native-vehicle-assets'

export interface VehicleClip { id:string; label:string; duration:number; loop:boolean }
export interface RigNode { pivot:number[]; kind:string; parent?:string; closed?:number; open?:number; phase?:number; trackRotationSign?:number; retractLift?:number; anchor?:number[]; rampPoint?:number[]; parentRamp?:string }
export interface VehicleSeat { name:string; id:string; position:number[]; yaw:number; anchor:string; forward_axis:string; canonical_soldier_yaw:number }
export interface VehicleRig { nodes:Record<string,RigNode>; clips:VehicleClip[]; variant:string; seats?:VehicleSeat[] }
const rigs:Partial<Record<Role,VehicleRig>>={TANK:tank,TROOP_TRUCK:troop,APC:apc,CANNON_APC:cannonApc,AMPHIBIOUS_APC:amphibiousApc,HEAVY_LIFT_HELI:cargo,ATTACK_HELI:attack,CAS_FIGHTER:cas,RECON_UAV:reconUav,JET:fighter,PATROL_BOAT:patrolBoat,LANDING_CRAFT:landingCraft,FRIGATE:missileCruiser,AIRCRAFT_CARRIER:aircraftCarrier}
type RigBinding={rig:VehicleRig;nodes:{node:RigNode;object:T.Object3D;base:number[]}[];turret?:T.Object3D}
const bindings=new WeakMap<T.Object3D,RigBinding>()
/** Each constructed rig has a stable hierarchy. Resolve names once instead of
 * recursively searching all track links for every node on every frame. */
function bindVehicle(root:T.Object3D,rig:VehicleRig){
  let binding=bindings.get(root)
  if(!binding||binding.rig!==rig){
    const byName=new Map<string,T.Object3D>()
    root.traverse(object=>{if(!byName.has(object.name))byName.set(object.name,object)})
    binding={rig,nodes:[],turret:byName.get('turret')}
    for(const [name,node] of Object.entries(rig.nodes)){
      const object=byName.get(name);if(!object)continue
      binding.nodes.push({node,object,base:node.pivot.map((value,index)=>value-(node.parent?rig.nodes[node.parent].pivot[index]:0))})
    }
    bindings.set(root,binding)
  }
  return binding
}
export const vehicleRig=(role:string)=>rigs[role as Role]
export const vehicleClips=(role:string):VehicleClip[]=>[...(nativeVehicleAsset(role)?.clips||vehicleRig(role)?.clips||[])]
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
    if(node.kind==='track'){const a=trackPath(node.phase||0),b=trackPath((node.phase||0)+time*(10+Math.PI*1.32)/duration);offset[1]=b[0]-a[0];offset[2]=b[1]-a[1];rotation[0]=(b[2]-a[2])*(node.trackRotationSign??1)}
  }
  if(clip==='aim'&&node.kind==='turret')rotation[2]=Math.sin(q*Math.PI*2)*.7
  if((clip==='aim'||clip==='fly')&&node.kind==='sensor')rotation[2]=Math.sin(q*Math.PI*2)*.7
  if(clip==='fly'&&node.kind==='rudder')rotation[2]=Math.sin(q*Math.PI*2)*.12
  if(clip==='shoot'){
    if(node.kind==='recoil')offset[1]=-.24*Math.max(0,1-Math.abs(time-.12)/.12)
    if(node.kind==='store'){offset[1]=Math.max(0,time-.2)*7;offset[2]=-Math.max(0,time-.2)*.5}
  }
  if(clip==='open'||clip==='close'){const amount=clip==='open'?q:1-q;if(node.kind==='ramp')rotation[0]=(node.closed||0)*(1-amount)+(node.open||0)*amount;if(node.kind==='door')offset[1]=-amount*2.2}
  if((clip==='rotors'||clip==='fly')&&node.kind==='rotor')rotation[1]=time*Math.PI*8
  if(clip==='fly'&&node.kind==='control')rotation[0]=Math.sin(q*Math.PI*2)*.2
  if(clip==='tilt'&&node.kind==='nacelle')rotation[0]=q*Math.PI/2
  if((clip==='gear'||clip==='gear_down')&&node.kind==='gear'){const amount=clip==='gear'?q:1-q,a=amount*Math.PI/2;offset[2]=(node.retractLift||0)*amount;if(Math.abs(node.pivot[0])<.5)rotation[0]=-a;else rotation[1]=a*(node.pivot[0]>0?1:-1)}
  const phase=Math.round((time-.05)*1e6)%180000
  const scale=node.kind==='muzzle_flash'?(clip==='shoot'&&time>=.05&&time<1.05&&phase<100000?1:0):1
  return{rotation,offset,scale}
}
export function poseVehicleClip(root:T.Object3D,clipId:string,time:number){
  if(root.userData.nativeVehicle){setNativeVehicleClip(root,clipId,time);return}
  const rig=vehicleRig(root.name);if(!rig)return
  const clip=rig.clips.find(c=>c.id===clipId)||rig.clips[0],t=Math.max(0,Math.min(clip.duration,time))
  for(const {node,object,base} of bindVehicle(root,rig).nodes){
    const sample=['JET','CAS_FIGHTER','RECON_UAV'].includes(root.name)&&clip.id==='fly'&&node.kind==='gear'
      ? sampleVehicleNode(node,'gear',1,1)
      : sampleVehicleNode(node,clip.id,t,clip.duration)
    object.position.set(base[0]+sample.offset[0],base[1]+sample.offset[1],base[2]+sample.offset[2]);object.rotation.set(...sample.rotation)
    object.scale.setScalar(sample.scale)
  }
  poseAircraftWeapons(root,clip.id,t)
  // Bow hoist cables retain their fixed sheave endpoint as the ramp rotates.
  for(const {node,object} of bindVehicle(root,rig).nodes){
    if(node.kind!=='ramp_cable'||!node.anchor||!node.rampPoint||!node.parentRamp)continue
    const ramp=rig.nodes[node.parentRamp],a=sampleVehicleNode(ramp,clip.id,t,clip.duration).rotation[0]
    const anchor=new T.Vector3(...node.anchor as [number,number,number]),rest=new T.Vector3(...node.rampPoint as [number,number,number]).sub(anchor)
    const p=node.rampPoint,dy=p[1]-ramp.pivot[1],dz=p[2]-ramp.pivot[2]
    const current=new T.Vector3(p[0],ramp.pivot[1]+dy*Math.cos(a)-dz*Math.sin(a),ramp.pivot[2]+dy*Math.sin(a)+dz*Math.cos(a)).sub(anchor)
    object.quaternion.setFromUnitVectors(rest.clone().normalize(),current.clone().normalize());object.scale.setScalar(current.length()/rest.length())
  }
  root.userData.activeVehicleClip=clip.id;root.userData.vehicleClipTime=t
  root.userData.poseCrewClip?.(clip.id,t)
  updateVehicleEffects(root,clip.id,t)
}
export function animateVehicleGameplay(root:T.Object3D,time:number,motion?:{heading:number;aim?:number;active:boolean;x?:number;y?:number;time?:number}){
  const rig=vehicleRig(root.name);if(!rig)return
  const previous=root.userData.vehicleMotion as {x:number;y:number}|undefined
  const moving=!motion||motion.x===undefined||!previous||Math.hypot((motion.x??0)-previous.x,(motion.y??0)-previous.y)>.001
  if(motion?.x!==undefined)root.userData.vehicleMotion={x:motion.x,y:motion.y??0}
  const air=['CAS_FIGHTER','RECON_UAV','JET','ATTACK_HELI','HEAVY_LIFT_HELI'].includes(root.name),id=motion?.active===false?'idle':air?'fly':moving?'drive':'idle',clip=rig.clips.find(c=>c.id===id)||rig.clips[0]
  poseVehicleClip(root,clip.id,time%clip.duration)
  updateVehicleEffects(root,clip.id,time,motion?.active)
  if(motion)for(const {node,object} of bindVehicle(root,rig).nodes)if(node.kind==='turret')object.rotation.z=motion.heading-(motion.aim??motion.heading)
}
