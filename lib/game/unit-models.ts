import * as T from './scene-data'
import { mergeGeometries } from './scene-data'
import { maritimeGeometry } from './maritime-models'
import { SIDE_COLOR, isNaval, isAir, type Role, type Side, type Soldier } from './types'
import { createSupportModel, isSupportModel } from './support-models'
import { createAircraft, disposeModel } from './aircraft-models'
import { shell, profile, rod } from './model-geometry'
import { armoredGeometry } from './armored-models'
import { hasBlenderVehicle, blenderVehicleGeometry } from './blender-vehicles'
import { cloneSoldierRig, cloneSoldierWeapon, createSoldierTemplate, loadSoldierAsset, loadSoldierWeaponAsset, type SoldierWeapon } from './soldier-asset'

const kit = '#68694c', armor = '#30332d', black = '#222524', face = '#b6a084'
const clothLight = '#7b7b59', clothDark = '#505640', steel = '#454945'

function colored(g:T.BufferGeometry,color:string){const c=new T.Color(color),a=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b}g.setAttribute('color',new T.BufferAttribute(a,3));return g}
function block(w:number,d:number,h:number,x=0,y=0,z=0,color=kit){const g=new T.BoxGeometry(w,d,h).toNonIndexed();g.translate(x,y,z);return colored(g,color)}
function combine(parts:T.BufferGeometry[]){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g}
/** M4 and belt-fed silhouettes share the rig's forward +Y axis. */
function weaponGeometry(mg:boolean) {
  const parts:T.BufferGeometry[]=[]
  const b=(w:number,d:number,h:number,x:number,y:number,z:number,c=black)=>parts.push(block(w,d,h,x,y,z,c))
  if(!mg){
    parts.push(profile([[-.19,-.025],[-.18,.035],[.09,.035],[.12,.005],[.08,-.065],[-.035,-.065],[-.06,-.025]],.065,black))
    parts.push(profile([[-.22,.02],[-.43,.02],[-.46,-.035],[-.46,-.18],[-.42,-.17],[-.33,-.065],[-.22,-.06]],.06,black))
    parts.push(profile([[-.15,-.04],[-.085,-.05],[-.14,-.2],[-.21,-.18]],.045,black))
    parts.push(profile([[.005,-.055],[.075,-.05],[.085,-.16],[.13,-.245],[.055,-.26],[.025,-.17]],.042,steel))
    b(.075,.26,.075,0,.205,.005);b(.045,.38,.012,0,.08,.052,steel)
    parts.push(rod([0,.33,.005],[0,.54,.005],.012,black,8));b(.03,.05,.032,0,.55,.005)
    parts.push(profile([[.325,.015],[.35,.015],[.35,.115],[.33,.115],[.3,.02]],.014,steel))
    b(.065,.055,.035,0,-.07,.085);parts.push(rod([0,-.11,.105],[0,-.03,.105],.026,black,8))
    b(.033,.012,.034,0,-.025,.105,'#485650')
    b(.009,.1,.032,.037,-.035,.008,steel)
    // Open trigger guard: bars leave actual negative space below the receiver.
    b(.015,.018,.065,0,-.035,-.08);b(.015,.08,.012,0,-.07,-.115)
    for(let i=0;i<7;i++){b(.088,.01,.014,0,.095+i*.033,.047,steel);b(.009,.015,.04,.042,.095+i*.033,0);b(.009,.015,.04,-.042,.095+i*.033,0)}
  }else{
    b(.09,.39,.105,0,0,0);b(.08,.25,.065,0,.3,-.015);b(.08,.34,.025,0,.025,.065,steel)
    parts.push(rod([0,.38,.015],[0,.67,.015],.016,steel,8));b(.035,.06,.035,0,.69,.015)
    parts.push(profile([[-.22,.025],[-.4,-.01],[-.52,.01],[-.53,-.14],[-.43,-.135],[-.34,-.09],[-.22,-.05]],.065,black))
    parts.push(profile([[-.1,-.04],[-.025,-.04],[-.055,-.21],[-.13,-.19]],.05,black))
    b(.15,.15,.17,.115,.04,-.115,clothDark);b(.16,.16,.023,.115,.04,-.02,kit)
    for(let i=0;i<5;i++){b(.025,.075,.02,.045+i*.026,.045,.02,'#b69a4b');b(.01,.082,.023,.045+i*.026,.045,.02,black)}
    parts.push(rod([0,.48,-.025],[-.095,.57,-.25],.009,steel));parts.push(rod([0,.48,-.025],[.095,.57,-.25],.009,steel))
    parts.push(rod([.045,.21,.035],[.045,.19,.14],.008,steel));b(.035,.1,.027,.045,.15,.14)
    b(.012,.025,.09,0,.53,.055);b(.035,.02,.02,0,.53,.1)
    for(let i=0;i<6;i++)b(.09,.012,.012,0,-.1+i*.047,.087,steel)
  }
  return combine(parts)
}
export function soldierParts(side:Side){
  const helmet=shell([{z:.02,w:.34,d:.36},{z:.17,w:.36,d:.37},{z:.27,w:.27,d:.29},{z:.3,w:.13,d:.15}],kit)
  const limb=(length:number,top:number,bottom:number)=>shell([{z:-length,w:bottom,d:bottom*.95},{z:-length*.52,w:top*.94,d:top},{z:-.025,w:top,d:top*.95},{z:0,w:top*.8,d:top*.8}],kit)
  return {
    pelvis:combine([shell([{z:-.11,w:.34,d:.24},{z:.08,w:.36,d:.25}],kit),block(.38,.26,.045,0,0,.05,armor),block(.07,.025,.045,0,.14,.05,steel)]),
    torso:combine([
      shell([{z:-.01,w:.35,d:.24},{z:.16,w:.41,d:.27},{z:.35,w:.47,d:.28},{z:.43,w:.33,d:.23}],kit),
      shell([{z:.025,w:.36,d:.09,y:.17},{z:.29,w:.42,d:.095,y:.17},{z:.38,w:.27,d:.08,y:.17}],armor),
      shell([{z:.04,w:.34,d:.09,y:-.17},{z:.31,w:.4,d:.085,y:-.17},{z:.38,w:.26,d:.08,y:-.17}],armor),
      shell([{z:.02,w:.28,d:.18,y:-.3},{z:.3,w:.32,d:.22,y:-.3},{z:.4,w:.23,d:.16,y:-.28}],clothDark),
      block(.23,.055,.2,0,-.425,.18,armor),block(.24,.02,.025,0,-.46,.23,black),
      ...[-.14,.14].flatMap(x=>[block(.06,.34,.035,x,0,.37,armor),block(.045,.018,.3,x*.8,-.42,.19,armor)]),
      ...[-.12,0,.12].flatMap(x=>[block(.1,.07,.14,x,.24,.115,clothDark),block(.105,.08,.025,x,.24,.19,kit)]),
      block(.065,.012,.04,0,.225,.315,SIDE_COLOR[side]),block(.055,.07,.14,.24,-.04,.07,clothDark)
    ]),
    head:combine([shell([{z:-.1,w:.18,d:.19,y:.025},{z:.02,w:.255,d:.255,y:.025},{z:.14,w:.23,d:.24}],face),helmet,
      block(.26,.045,.085,0,.165,.055,armor),...[-.066,.066].map(x=>block(.115,.014,.06,x,.194,.06,'#414b49')),
      shell([{z:-.105,w:.16,d:.08,y:.095},{z:-.045,w:.24,d:.085,y:.12},{z:.015,w:.24,d:.07,y:.13}],black),
      ...[-.175,.175].map(x=>block(.045,.13,.12,x,-.005,.04,clothDark)),block(.08,.04,.06,0,.184,.19,steel),block(.31,.015,.026,0,-.183,.12,clothDark)
    ]),
    thigh:combine([limb(.4,.205,.155),block(.055,.135,.15,.105,-.005,-.16,clothDark),block(.06,.14,.025,.106,-.005,-.09,clothLight)]),
    shin:combine([limb(.37,.165,.115),shell([{z:-.15,w:.12,d:.04,y:.09},{z:-.04,w:.15,d:.065,y:.105},{z:.015,w:.115,d:.04,y:.09}],armor)]),
    boot:combine([shell([{z:-.105,w:.16,d:.29,y:.065},{z:-.055,w:.17,d:.3,y:.065},{z:.045,w:.135,d:.21,y:.025},{z:.09,w:.125,d:.145}],black),block(.17,.3,.027,0,.065,-.097,armor)]),
    arm:combine([limb(.28,.185,.14),block(.03,.09,.13,.09,0,-.1,clothDark),block(.035,.065,.035,.11,0,-.095,SIDE_COLOR[side])]),
    forearm:combine([limb(.245,.15,.105),block(.115,.12,.045,0,0,-.23,armor),shell([{z:-.335,w:.085,d:.085},{z:-.275,w:.12,d:.1},{z:-.24,w:.105,d:.09}],black),block(.07,.018,.045,0,.055,-.305,face)]),
    rifle:weaponGeometry(false),
    mg:weaponGeometry(true),
    medic:combine([block(.43,.22,.36,0,-.48,.2,kit),block(.2,.025,.07,0,-.6,.2,SIDE_COLOR[side]),block(.07,.025,.23,0,-.6,.2,SIDE_COLOR[side])]),
    radio:combine([block(.38,.24,.45,0,-.46,.22,black),block(.025,.025,.7,.14,-.46,.68,black)]),
    engineer:combine([block(.035,.035,.75,.28,-.4,.14,black),block(.18,.05,.23,.28,-.4,-.27,armor),block(.23,.18,.2,-.28,-.3,0,kit)]),
    supplies:combine([block(.45,.25,.55,0,-.5,.22,kit),block(.48,.03,.045,0,-.64,.07,black),block(.48,.03,.045,0,-.64,.37,black)]),
    pilot:block(.32,.08,.13,0,.18,.02,black),
    mortar:combine([block(.8,.8,.07,.85,.1,.04,armor),colored(new T.CylinderGeometry(.075,.09,1.15,12).toNonIndexed().rotateX(.65).translate(.85,.1,.65),armor),block(.06,.06,.7,.55,.3,.36,black),block(.06,.06,.7,1.15,.3,.36,black)]),
    aaLauncher:combine([colored(new T.CylinderGeometry(.11,.11,1.35,12).toNonIndexed().translate(.1,0,.25),armor),block(.09,.18,.15,.1,.2,.1,black),block(.13,.22,.1,.1,.15,.4,black),block(.06,.08,.06,.1,.27,.4,SIDE_COLOR[side])]),
    launcher:combine([colored(new T.CylinderGeometry(.07,.07,.85,8).toNonIndexed(),armor),block(.08,.09,.15,0,0,-.1,black)]),
  }
}

const READY_AFTER_FIRE_SECONDS=8
const SOLDIER_WEAPONS:SoldierWeapon[]=['RIFLE','MG','AT','AA_TEAM']
const weaponForRole=(role:Role):SoldierWeapon|undefined=>role==='PILOT'?undefined:role==='MG'?'MG':role==='AT'?'AT':role==='AA_TEAM'?'AA_TEAM':'RIFLE'
const WEAPON_HAND_CANT=Math.PI/4

type SoldierRig={id:string;root:T.Group;model:T.Object3D;mixer:T.AnimationMixer;actions:Map<string,T.AnimationAction>;gears:T.Object3D[];weaponBone?:T.Object3D;weapons:Map<SoldierWeapon,T.Object3D>;clip?:string;role?:Role;atAction?:T.AnimationAction;state?:string;stateSince:number}

/** Convert only the AT arm/hand/weapon pose tracks to offsets from the rig's rest pose. */
function createAtOverlay(source:T.Object3D,clip:T.AnimationClip|undefined){
  if(!clip)return undefined
  const tracks:T.KeyframeTrack[]=[],referenceTracks:T.KeyframeTrack[]=[]
  for(const track of clip.tracks){
    const dot=track.name.lastIndexOf('.');if(dot<0)continue
    const targetName=track.name.slice(0,dot),property=track.name.slice(dot+1),normalized=targetName.toLowerCase().replace(/[^a-z]/g,'')
    if(!/(upperarm|forearm|lowerarm|hand|weapon)/.test(normalized))continue
    const target=source.getObjectByName(targetName);if(!target)continue
    let reference:T.KeyframeTrack|undefined
    if(property==='quaternion')reference=new T.QuaternionKeyframeTrack(track.name,[0],target.quaternion.toArray())
    else if(property==='position')reference=new T.VectorKeyframeTrack(track.name,[0],target.position.toArray())
    else if(property==='scale')reference=new T.VectorKeyframeTrack(track.name,[0],target.scale.toArray())
    if(!reference)continue
    tracks.push(track.clone());referenceTracks.push(reference)
  }
  if(!tracks.length)return undefined
  const overlay=new T.AnimationClip('__ik_at_overlay',clip.duration,tracks),reference=new T.AnimationClip('__ik_at_rest',-1,referenceTracks)
  T.AnimationUtils.makeClipAdditive(overlay,0,reference)
  return overlay
}

export class SoldierBatch {
  root=new T.Group(); pelvis=new T.Group();torso=new T.Group(); head=new T.Group(); hips=[new T.Group(),new T.Group()];knees=[new T.Group(),new T.Group()];shoulders=[new T.Group(),new T.Group()];elbows=[new T.Group(),new T.Group()]; weapon=new T.Group()
  parts=new Map<string,T.InstancedMesh>(); nodes:{key:string;node:T.Object3D}[]=[]; counts=new Map<string,number>(); matrix=new T.Matrix4()
  asset:'loading'|'ready'|'error'='loading';template?:T.Object3D;clips=new Map<string,T.AnimationClip>();atOverlay?:T.AnimationClip;weaponTemplates=new Map<SoldierWeapon,T.Object3D>();used=new Set<string>();disposed=false
  rigs=new Map<string,SoldierRig>()
  constructor(public scene:T.Scene,public side:Side,material:T.Material){const geometries=soldierParts(side);for(const [key,g]of Object.entries(geometries)){const mesh=new T.InstancedMesh(g,material,1024);mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.parts.set(key,mesh);scene.add(mesh)}
    const add=(key:keyof typeof geometries,parent:T.Object3D,x=0,y=0,z=0)=>{const node=new T.Object3D();node.position.set(x,y,z);parent.add(node);this.nodes.push({key,node});return node}
    this.root.add(this.pelvis);add('pelvis',this.pelvis);this.pelvis.add(this.torso);this.torso.position.z=.04;add('torso',this.torso);this.torso.add(this.head);this.head.position.z=.58;add('head',this.head)
    for(let i=0;i<2;i++){const sign=i?1:-1;this.pelvis.add(this.hips[i]);this.hips[i].position.set(sign*.115,0,-.06);add('thigh',this.hips[i]);this.hips[i].add(this.knees[i]);this.knees[i].position.z=-.4;add('shin',this.knees[i]);add('boot',this.knees[i],0,0,-.39);this.torso.add(this.shoulders[i]);this.shoulders[i].position.set(sign*.31,0,.32);add('arm',this.shoulders[i]);this.shoulders[i].add(this.elbows[i]);this.elbows[i].position.z=-.28;add('forearm',this.elbows[i])}
    for(const key of ['medic','radio','engineer','supplies'] as const)add(key,this.torso);add('pilot',this.head);add('mortar',this.root)
    this.torso.add(this.weapon);this.weapon.position.set(.17,.39,.27);add('rifle',this.weapon);add('mg',this.weapon);add('launcher',this.weapon);add('aaLauncher',this.weapon)
    loadSoldierAsset().then(gltf=>{if(this.disposed)return;this.template=createSoldierTemplate(gltf.scene,this.side);for(const clip of gltf.animations)this.clips.set(clip.name.toLowerCase(),clip);this.atOverlay=createAtOverlay(this.template,this.clips.get('ik_at'));this.asset=this.clips.size?'ready':'error'}).catch(()=>{if(!this.disposed)this.asset='error'})
    loadSoldierWeaponAsset().then(gltf=>{if(this.disposed)return;for(const weapon of SOLDIER_WEAPONS){const template=cloneSoldierWeapon(gltf.scene,weapon);if(template)this.weaponTemplates.set(weapon,template)}}).catch(()=>{})
  }
  begin(){this.counts.clear();this.used.clear()}
  private rig(id:string){let rig=this.rigs.get(id);if(rig)return rig;const spare=[...this.rigs.values()].find(value=>!this.used.has(value.id)&&!value.root.visible);if(spare){this.rigs.delete(spare.id);spare.id=id;spare.role=undefined;spare.state=undefined;spare.stateSince=0;spare.clip=undefined;spare.atAction=undefined;spare.mixer.stopAllAction();this.rigs.set(id,spare);return spare}if(!this.template)return undefined
    const root=new T.Group(),model=cloneSoldierRig(this.template),gears:T.Object3D[]=[];let weaponBone:T.Object3D|undefined;model.visible=true;model.rotation.x=Math.PI/2;model.traverse(node=>{if(node.name.startsWith('Gear_'))gears.push(node);if(node.name==='weapon')weaponBone=node;if(node.name.startsWith('Weapon_'))node.visible=false});root.add(model);this.scene.add(root);rig={id,root,model,mixer:new T.AnimationMixer(model),actions:new Map(),gears,weaponBone,weapons:new Map(),stateSince:0};this.rigs.set(id,rig);return rig
  }
  private firstClip(...names:string[]){for(const name of names){const clip=this.clips.get(name);if(clip)return clip}return undefined}
  private clipFor(s:Soldier,role:Role,time:number,rig:SoldierRig){
    if(s.status==='dead')return{clip:this.firstClip('dead','idle_ready','idle'),once:true,offset:Math.max(0,time-s.since)}
    if(s.status==='downed')return{clip:this.firstClip('downed','idle_ready','idle'),once:true,offset:Math.max(0,time-s.since)}
    if(s.action==='throw'||s.action==='drag')return{clip:this.firstClip(s.action,'idle_ready','idle'),once:s.action==='throw',offset:Math.max(0,time-s.since)}
    if(s.action==='cover')return{clip:this.firstClip('in_cover','cover','idle_ready','idle'),once:false}
    if(s.action==='peek'){
      const transition=this.firstClip('peek')
      if(transition&&time-rig.stateSince<transition.duration)return{clip:transition,once:true,offset:Math.max(0,time-rig.stateSince)}
      return{clip:this.firstClip('in_cover_shoot','fire','peek','in_cover','cover','idle_ready','idle'),once:false}
    }
    if(s.action==='fire')return{clip:this.firstClip(s.cover?'in_cover_shoot':'fire','fire','idle_ready','idle'),once:false}
    if(s.stance==='prone')return{clip:this.firstClip('prone','idle_ready','idle'),once:false}
    if(s.stance==='crouch')return{clip:this.firstClip('crouch','idle_ready','idle'),once:false}
    if(s.action==='walk')return{clip:this.firstClip('walk','idle_ready','idle'),once:false}
    if(time>=s.shotAt&&time-s.shotAt<READY_AFTER_FIRE_SECONDS)return{clip:this.firstClip('idle_ready','idle'),once:false}
    if(role==='MG')return{clip:this.firstClip('idle_passive_mg','idle_passive','idle_passive_rifle','idle_ready','idle'),once:false}
    if(role==='AT'||role==='AA_TEAM')return{clip:this.firstClip('idle_passive_at','idle_passive','idle_passive_rifle','idle_ready','idle'),once:false}
    return{clip:this.firstClip('idle_passive','idle_passive_rifle','idle_ready','idle'),once:false}
  }
  private syncWeapon(rig:SoldierRig,role:Role){const wanted=weaponForRole(role);for(const weapon of rig.weapons.values())weapon.visible=false;if(!wanted||!rig.weaponBone)return;let weapon=rig.weapons.get(wanted);if(!weapon){const template=this.weaponTemplates.get(wanted);if(!template)return;weapon=template.clone(true);weapon.rotation.x=WEAPON_HAND_CANT;rig.weaponBone.add(weapon);rig.weapons.set(wanted,weapon)}weapon.visible=true}
  private syncAtOverlay(rig:SoldierRig,enabled:boolean,time:number){if(!enabled||!this.atOverlay){rig.atAction?.stop();rig.atAction=undefined;return}if(!rig.atAction){rig.atAction=rig.mixer.clipAction(this.atOverlay);rig.atAction.setLoop(T.LoopRepeat,Infinity).setEffectiveWeight(1).play()}rig.atAction.time=this.atOverlay.duration?time%this.atOverlay.duration:0}
  private poseAsset(s:Soldier,role:Role,time:number,z:number){const rig=this.rig(s.id);if(!rig)return;this.used.add(s.id);rig.root.visible=true;rig.root.position.set(s.x,s.y,z);rig.root.rotation.set(0,0,-s.heading);const state=`${s.status}:${s.stance}:${s.action}`;if(rig.state!==state){rig.state=state;rig.stateSince=time}if(rig.role!==role){const gear=`Gear_${role}`;for(const node of rig.gears)node.visible=node.name===gear;rig.role=role}this.syncWeapon(rig,role)
    const selected=this.clipFor(s,role,time,rig),clip=selected.clip;if(!clip)return;let action=rig.actions.get(clip.name);if(!action){action=rig.mixer.clipAction(clip);rig.actions.set(clip.name,action)}action.setLoop(selected.once?T.LoopOnce:T.LoopRepeat,selected.once?1:Infinity);action.clampWhenFinished=selected.once;if(rig.clip!==clip.name){if(rig.clip)rig.actions.get(rig.clip)?.stop();action.reset().play();rig.clip=clip.name}const phase=time+(s.id.charCodeAt(s.id.length-1)||0)*.037,offset=selected.offset??phase;action.time=selected.once?Math.min(clip.duration,offset):clip.duration?offset%clip.duration:0;this.syncAtOverlay(rig,role==='AT'&&s.status==='active',time);rig.mixer.update(0)
  }
  private poseFallback(s:Soldier,role:Role,time:number,z:number,detail=true){const dead=s.status!=='active',walking=['walk','cover','drag'].includes(s.action),phase=time*9+(s.id.charCodeAt(s.id.length-1)||0),stride=dead?0:walking?Math.sin(phase)*.62:Math.sin(time*2)*.015,crouch=s.stance==='crouch',prone=s.stance==='prone',recoil=Math.max(0,1-(time-s.shotAt)/.16)
    this.root.position.set(s.x,s.y,z+(dead||prone?.24:0));this.root.rotation.set(dead?Math.min(1,Math.max(0,(time-s.since)/.45))*Math.PI/2:prone?-Math.PI/2:0,dead?.12:0,-s.heading);this.root.scale.setScalar(1)
    this.pelvis.position.z=dead||prone?.05:crouch?.59:.94;this.torso.rotation.set(dead?0:crouch?-.22:Math.sin(time*2)*.015,0,Math.atan2(Math.sin(s.heading-s.aim),Math.cos(s.heading-s.aim)));if(s.action==='peek')this.torso.rotation.y=.22
    this.head.rotation.z=dead?.22:Math.sin(time*.7)*.04
    for(let i=0;i<2;i++){const sign=i?1:-1;this.hips[i].rotation.x=dead?0:crouch?1.05:detail?stride*sign:0;this.knees[i].rotation.x=dead?0:crouch?-1.7:detail?-Math.max(0,stride*sign)*1.6:0;this.shoulders[i].rotation.set(dead?.2:.95+(s.action==='walk'?stride*sign*.2:0),sign*.14,sign*.15);this.elbows[i].rotation.x=dead?.2:1.05}
    if(s.action==='throw'){this.shoulders[1].rotation.x=-1.8+Math.min(1,time-s.since)*3.5;this.elbows[1].rotation.x=.3}
    if(s.action==='drag'){this.shoulders[0].rotation.x=-.7;this.elbows[0].rotation.x=.3}
    this.weapon.position.y=(prone?-.08:.4)-recoil*.055;this.weapon.position.z=prone?.65:.27;this.weapon.rotation.x=(prone?Math.PI/2:0)+recoil*-.065;this.root.updateMatrixWorld(true)
    for(const {key,node}of this.nodes){const equipment:Record<string,Role[]>={medic:['MEDIC'],radio:['COMMAND','SCOUT','AA_TEAM'],engineer:['ENGINEER'],supplies:['LOGISTICS'],pilot:['PILOT'],mortar:['MORTAR']};if(equipment[key]&&!equipment[key].includes(role))continue;if(key==='mortar'&&(walking||dead))continue;if(key==='aaLauncher'&&role!=='AA_TEAM'||key==='launcher'&&role!=='AT'||key==='mg'&&role!=='MG'||key==='rifle'&&['AT','MG','AA_TEAM'].includes(role))continue;const mesh=this.parts.get(key)!,n=this.counts.get(key)||0;if(n<1024){mesh.setMatrixAt(n,node.matrixWorld);this.counts.set(key,n+1)}}
  }
  pose(s:Soldier,role:Role,time:number,z:number,detail=true){const weapon=weaponForRole(role);if(this.asset==='ready'&&detail&&(!weapon||this.weaponTemplates.has(weapon)))this.poseAsset(s,role,time,z);else this.poseFallback(s,role,time,z,detail)}
  end(visible:boolean){for(const rig of this.rigs.values())rig.root.visible=visible&&this.used.has(rig.id);for(const [key,mesh]of this.parts){mesh.count=visible?this.counts.get(key)||0:0;mesh.visible=mesh.count>0;if(mesh.count)mesh.instanceMatrix.needsUpdate=true}}
  dispose(){this.disposed=true;for(const rig of this.rigs.values())rig.mixer.stopAllAction();this.rigs.clear()}
}
export function vehicleGeometry(role:Role,side:Side,attachment=false){if(isNaval(role))return maritimeGeometry(role,side);const parts:T.BufferGeometry[]=[]
  if(hasBlenderVehicle(role))return blenderVehicleGeometry(role,side,attachment)
  if(isAir(role)||isSupportModel(role)){const model=isAir(role)?createAircraft(role,side):createSupportModel(role,side);model.updateMatrixWorld(true);const source=attachment&&role==='ATTACK_HELI'?model.getObjectByName('main-rotor')!:model;source.traverse(o=>{if(o instanceof T.Mesh){const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);parts.push(colored(g,`#${(o.material as T.MeshStandardMaterial).color.getHexString()}`))}});disposeModel(model);return combine(parts)}
  return armoredGeometry(role,side,attachment)
}
