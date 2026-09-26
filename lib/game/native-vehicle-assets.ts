import { assetPath } from '../asset-path'
import * as T from './scene-data'
import type { Role, Side } from './types'
import type { VehicleClip } from './vehicle-animation'

export const NATIVE_VEHICLE_IDS = [
  'HEMTT_BASE', 'HEMTT_AMMO', 'HEMTT_FOB', 'HEMTT_FUEL', 'HEMTT_MEDICAL', 'HEMTT_REPAIR', 'HEMTT_SUPPLY', 'HEMTT_TROOP',
  'APC_BASE', 'APC_30MM', 'APC_AA', 'APC_MG', 'APC_TANKKILLER',
] as const

export type NativeVehicleId = typeof NATIVE_VEHICLE_IDS[number]
export interface NativeVehicleBounds { min: readonly [number, number, number]; max: readonly [number, number, number] }
export interface NativeVehicleAsset {
  id: NativeVehicleId
  label: string
  family: 'HEMTT' | 'APC'
  variant: string
  url: string
  rigUrl: string
  moduleUrl?: string
  moduleRigUrl?: string
  bounds: NativeVehicleBounds
  clips: readonly VehicleClip[]
  gameplayRole?: Role
  materialPolicy: 'preserve-gltf-pbr'
}

const clip = (id:string,label:string,duration:number,loop:boolean):VehicleClip => ({id,label,duration,loop})
const roadClips = [clip('idle','Idle',2,true),clip('drive','Drive',2,true),clip('steer','Steer',2,true)] as const
const rampClips = [...roadClips,clip('open','Open ramp',2,false),clip('close','Close ramp',2,false)] as const
const weaponClips = [...rampClips,clip('aim','Aim weapon',3,true),clip('shoot','Fire weapon',1.2,false)] as const
const bounds=(min:NativeVehicleBounds['min'],max:NativeVehicleBounds['max']):NativeVehicleBounds=>({min,max})
export const HEMTT_REAR_MODULE_MOUNT={node:'Mount_rear_module',position:[0,-1.5,1.396894] as const,rotation:[0,0,0] as const,scale:[1,1,1] as const}
const make=(id:NativeVehicleId,label:string,family:'HEMTT'|'APC',variant:string,bounds:NativeVehicleBounds,clips:readonly VehicleClip[],gameplayRole?:Role):NativeVehicleAsset=>{
  const basename=id.toLowerCase().replace('hemtt_','hemtt_').replace('apc_tankkiller','apc_tankkiller')+'_pbr'
  const composite=family==='HEMTT'&&variant!=='base',moduleBasename=`hemtt_${variant}_module_pbr`
  return{id,label,family,variant,url:`/models/vehicles/${family==='HEMTT'?'hemtt_base_pbr':basename}.glb`,rigUrl:`/models/vehicles/${family==='HEMTT'?'hemtt_base_pbr':basename}.rig.json`,moduleUrl:composite?`/models/vehicles/${moduleBasename}.glb`:undefined,moduleRigUrl:composite?`/models/vehicles/${moduleBasename}.rig.json`:undefined,bounds,clips,gameplayRole,materialPolicy:'preserve-gltf-pbr'}
}

export const NATIVE_VEHICLE_ASSETS:Record<NativeVehicleId,NativeVehicleAsset>={
  HEMTT_BASE:make('HEMTT_BASE','HEMTT base truck','HEMTT','base',bounds([-1.577006,-5.079782,0],[1.577007,5.120218,3.064882]),roadClips),
  HEMTT_AMMO:make('HEMTT_AMMO','HEMTT ammunition carrier','HEMTT','ammo',bounds([-1.577006,-5.079782,0],[1.577007,5.120218,3.064882]),roadClips),
  HEMTT_FOB:make('HEMTT_FOB','HEMTT FOB module','HEMTT','fob',bounds([-1.577006,-5.079782,0],[1.577007,5.120218,4.358836]),roadClips),
  HEMTT_FUEL:make('HEMTT_FUEL','HEMTT fuel carrier','HEMTT','fuel',bounds([-1.577006,-5.079782,0],[1.577007,5.120218,3.782622]),roadClips),
  HEMTT_MEDICAL:make('HEMTT_MEDICAL','HEMTT medical carrier','HEMTT','medical',bounds([-1.577006,-5.079782,0],[1.577007,5.120218,3.823058]),roadClips),
  HEMTT_REPAIR:make('HEMTT_REPAIR','HEMTT repair carrier','HEMTT','repair',bounds([-1.693261,-5.079782,0],[1.69326,5.120218,3.064882]),roadClips),
  HEMTT_SUPPLY:make('HEMTT_SUPPLY','HEMTT supply truck','HEMTT','supply',bounds([-1.577006,-5.079782,0],[1.577007,5.120218,3.069937]),roadClips,'TRUCK'),
  HEMTT_TROOP:make('HEMTT_TROOP','HEMTT troop module','HEMTT','troop',bounds([-1.577006,-5.079782,0],[1.577007,5.352725,3.833167]),roadClips),
  APC_BASE:make('APC_BASE','APC personnel carrier','APC','base',bounds([-1.62656,-3.913439,0],[1.62656,3.886561,3.042592]),rampClips,'APC'),
  APC_30MM:make('APC_30MM','APC 30 mm cannon','APC','30mm',bounds([-1.62656,-3.913439,0],[1.62656,4.203722,4.09621]),weaponClips,'CANNON_APC'),
  APC_AA:make('APC_AA','APC anti-air variant','APC','aa',bounds([-1.62656,-3.913439,0],[1.62656,3.886561,4.0102]),weaponClips),
  APC_MG:make('APC_MG','APC machine-gun variant','APC','mg',bounds([-1.62656,-3.913439,0],[1.62656,3.886561,3.150104]),weaponClips),
  APC_TANKKILLER:make('APC_TANKKILLER','APC tank-killer variant','APC','tankkiller',bounds([-1.62656,-3.913439,0],[1.62656,7.224811,3.934942]),weaponClips),
}

export const isNativeVehicleId=(value:string):value is NativeVehicleId=>Object.hasOwn(NATIVE_VEHICLE_ASSETS,value)
export const nativeVehicleAsset=(value:string)=>isNativeVehicleId(value)?NATIVE_VEHICLE_ASSETS[value]:undefined
export const NATIVE_GAMEPLAY_VEHICLES:Readonly<Partial<Record<Role,NativeVehicleId>>>={TRUCK:'HEMTT_SUPPLY',APC:'APC_BASE',CANNON_APC:'APC_30MM'}
export const nativeVehicleForRole=(role:Role)=>NATIVE_GAMEPLAY_VEHICLES[role]
export const createNativeGameplayVehicle=(role:Role,side:Side)=>{
  const id=nativeVehicleForRole(role)
  return id?createNativeVehicle(id,side,role):undefined
}

export function createNativeVehicle(id:NativeVehicleId,side:Side,name:string=id){
  const asset=NATIVE_VEHICLE_ASSETS[id],root=new T.Group();root.name=name
  root.userData.nativeVehicle=true
  root.userData.nativeVehicleId=id
  root.userData.nativeMaterialPolicy=asset.materialPolicy
  root.userData.side=side
  if(asset.family==='HEMTT'){
    const base=new T.Group();base.name='GC_ASSET';base.userData.nativeAssetURL=assetPath(asset.url)
    const mount=new T.Group();mount.name=HEMTT_REAR_MODULE_MOUNT.node;mount.position.set(...HEMTT_REAR_MODULE_MOUNT.position);base.add(mount);root.add(base)
    root.userData.nativeAnimationTarget=base
    if(asset.moduleUrl){const module=new T.Group();module.name='GC_MODULE';module.userData.nativeAssetURL=assetPath(asset.moduleUrl);module.userData.nativeMaterialPolicy=asset.materialPolicy;mount.add(module)}
  }else{
    root.userData.nativeAssetURL=assetPath(asset.url)
    root.userData.nativeAnimationTarget=root
  }
  setNativeVehicleClip(root,'idle',0)
  return root
}

export function nativeVehicleBounds(id:NativeVehicleId){
  const {min,max}=NATIVE_VEHICLE_ASSETS[id].bounds
  return new T.Box3(new T.Vector3(...min),new T.Vector3(...max))
}

export function setNativeVehicleClip(root:T.Object3D,clipId:string,time:number){
  const asset=nativeVehicleAsset(root.userData.nativeVehicleId as string)||NATIVE_VEHICLE_ASSETS[nativeVehicleForRole(root.name as Role)!]
  if(!asset)return
  const selected=asset.clips.find(value=>value.id===clipId)||asset.clips[0]
  const sampled=selected.loop&&selected.duration>0?((time%selected.duration)+selected.duration)%selected.duration:Math.max(0,Math.min(selected.duration,time))
  const target=(root.userData.nativeAnimationTarget as T.Object3D|undefined)||root
  target.userData.animationState=[{name:selected.id,time:sampled,weight:1}]
  root.userData.activeVehicleClip=selected.id
  root.userData.vehicleClipTime=sampled
}

export function animateNativeVehicleGameplay(root:T.Object3D,time:number,motion?:{x:number;y:number;active:boolean}){
  const previous=root.userData.nativeVehicleMotion as {x:number;y:number}|undefined
  const moving=!motion||!previous||Math.hypot(motion.x-previous.x,motion.y-previous.y)>.001
  if(motion)root.userData.nativeVehicleMotion={x:motion.x,y:motion.y}
  setNativeVehicleClip(root,motion?.active===false?'idle':moving?'drive':'idle',time)
}
