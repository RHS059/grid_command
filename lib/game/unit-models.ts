import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { SIDE_COLOR, isAir, type Role, type Side, type Soldier } from './types'
import { createSupportModel, isSupportModel } from './support-models'
import { createAircraft, disposeModel } from './aircraft-models'

const kit = '#65716a', armor = '#34473f', black = '#18222b', face = '#bba98d'
function colored(g:T.BufferGeometry,color:string){const c=new T.Color(color),a=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b}g.setAttribute('color',new T.BufferAttribute(a,3));return g}
function block(w:number,d:number,h:number,x=0,y=0,z=0,color=kit){const g=new T.BoxGeometry(w,d,h).toNonIndexed();g.translate(x,y,z);return colored(g,color)}
function combine(parts:T.BufferGeometry[]){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g}
export function soldierParts(side:Side){
  const helmet=colored(new T.IcosahedronGeometry(.24,1),armor);helmet.scale(1,1.15,.85);helmet.translate(0,0,.12)
  return {
    pelvis:block(.39,.25,.2,0,0,0,kit),
    torso:combine([block(.48,.28,.43,0,0,.17),block(.5,.12,.34,0,.18,.17,armor),block(.46,.13,.3,0,-.17,.16,armor),block(.36,.21,.38,0,-.33,.2,kit),...[-.16,0,.16].map(x=>block(.12,.11,.16,x,.27,.08,kit)),block(.15,.025,.09,0,.249,.32,SIDE_COLOR[side])]),
    head:combine([block(.28,.27,.24,0,.025,0,face),helmet,block(.22,.045,.075,0,.185,.045,black),block(.31,.035,.025,0,.18,-.06,armor)]),
    thigh:block(.17,.19,.4,0,0,-.2), shin:combine([block(.145,.16,.37,0,0,-.185),block(.16,.045,.14,0,.1,-.05,armor)]),
    boot:block(.18,.32,.13,0,.065,-.04,black), arm:block(.14,.16,.28,0,0,-.14),forearm:combine([block(.13,.15,.27,0,0,-.135),block(.12,.14,.1,0,0,-.28,face)]),
    rifle:combine([block(.065,.43,.08,0,0,0,black),block(.025,.38,.025,0,.35,.025,black),block(.065,.16,.07,0,-.28,-.015,armor),block(.045,.09,.15,0,.025,-.1,black),block(.03,.16,.035,0,.03,.07,black)]),
    mg:combine([block(.085,.65,.1,0,.03,0,black),block(.035,.44,.035,0,.51,.03,black),block(.11,.18,.14,.1,.02,-.06,armor),block(.07,.22,.085,0,-.4,-.02,black),block(.025,.035,.25,-.07,.58,-.1,black),block(.025,.035,.25,.07,.58,-.1,black)]),
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
export class SoldierBatch {
  root=new T.Group(); pelvis=new T.Group();torso=new T.Group(); head=new T.Group(); hips=[new T.Group(),new T.Group()];knees=[new T.Group(),new T.Group()];shoulders=[new T.Group(),new T.Group()];elbows=[new T.Group(),new T.Group()]; weapon=new T.Group()
  parts=new Map<string,T.InstancedMesh>(); nodes:{key:string;node:T.Object3D}[]=[]; counts=new Map<string,number>(); matrix=new T.Matrix4()
  constructor(scene:T.Scene,side:Side,material:T.Material){const geometries=soldierParts(side);for(const [key,g]of Object.entries(geometries)){const mesh=new T.InstancedMesh(g,material,1024);mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.parts.set(key,mesh);scene.add(mesh)}
    const add=(key:keyof typeof geometries,parent:T.Object3D,x=0,y=0,z=0)=>{const node=new T.Object3D();node.position.set(x,y,z);parent.add(node);this.nodes.push({key,node});return node}
    this.root.add(this.pelvis);add('pelvis',this.pelvis);this.pelvis.add(this.torso);this.torso.position.z=.04;add('torso',this.torso);this.torso.add(this.head);this.head.position.z=.58;add('head',this.head)
    for(let i=0;i<2;i++){const sign=i?1:-1;this.pelvis.add(this.hips[i]);this.hips[i].position.set(sign*.115,0,-.06);add('thigh',this.hips[i]);this.hips[i].add(this.knees[i]);this.knees[i].position.z=-.4;add('shin',this.knees[i]);add('boot',this.knees[i],0,0,-.39);this.torso.add(this.shoulders[i]);this.shoulders[i].position.set(sign*.31,0,.32);add('arm',this.shoulders[i]);this.shoulders[i].add(this.elbows[i]);this.elbows[i].position.z=-.28;add('forearm',this.elbows[i])}
    for(const key of ['medic','radio','engineer','supplies'] as const)add(key,this.torso);add('pilot',this.head);add('mortar',this.root)
    this.torso.add(this.weapon);this.weapon.position.set(.17,.39,.27);add('rifle',this.weapon);add('mg',this.weapon);add('launcher',this.weapon);add('aaLauncher',this.weapon)
  }
  begin(){this.counts.clear()}
  pose(s:Soldier,role:Role,time:number,z:number,detail=true){const dead=s.status!=='active',walking=['walk','cover','drag'].includes(s.action),phase=time*9+(s.id.charCodeAt(s.id.length-1)||0),stride=dead?0:walking?Math.sin(phase)*.62:Math.sin(time*2)*.015,crouch=s.stance==='crouch',prone=s.stance==='prone',recoil=Math.max(0,1-(time-s.shotAt)/.16)
    this.root.position.set(s.x,s.y,z+(dead||prone?.24:0));this.root.rotation.set(dead?Math.min(1,Math.max(0,(time-s.since)/.45))*Math.PI/2:prone?-Math.PI/2:0,dead?.12:0,-s.heading);this.root.scale.setScalar(1)
    this.pelvis.position.z=dead||prone?.05:crouch?.59:.94;this.torso.rotation.set(dead?0:crouch?-.22:Math.sin(time*2)*.015,0,Math.atan2(Math.sin(s.heading-s.aim),Math.cos(s.heading-s.aim)));if(s.action==='peek')this.torso.rotation.y=.22
    this.head.rotation.z=dead?.22:Math.sin(time*.7)*.04
    for(let i=0;i<2;i++){const sign=i?1:-1;this.hips[i].rotation.x=dead?0:crouch?1.05:detail?stride*sign:0;this.knees[i].rotation.x=dead?0:crouch?-1.7:detail?-Math.max(0,stride*sign)*1.6:0;this.shoulders[i].rotation.set(dead?.2:.95+(s.action==='walk'?stride*sign*.2:0),sign*.14,sign*.15);this.elbows[i].rotation.x=dead?.2:1.05}
    if(s.action==='throw'){this.shoulders[1].rotation.x=-1.8+Math.min(1,time-s.since)*3.5;this.elbows[1].rotation.x=.3}
    if(s.action==='drag'){this.shoulders[0].rotation.x=-.7;this.elbows[0].rotation.x=.3}
    this.weapon.position.y=(prone?-.08:.4)-recoil*.055;this.weapon.position.z=prone?.65:.27;this.weapon.rotation.x=(prone?Math.PI/2:0)+recoil*-.065;this.root.updateMatrixWorld(true)
    for(const {key,node}of this.nodes){const equipment:Record<string,Role[]>={medic:['MEDIC'],radio:['COMMAND','SCOUT','AA_TEAM'],engineer:['ENGINEER'],supplies:['LOGISTICS'],pilot:['PILOT'],mortar:['MORTAR']};if(equipment[key]&&!equipment[key].includes(role))continue;if(key==='mortar'&&(walking||dead))continue;if(key==='aaLauncher'&&role!=='AA_TEAM'||key==='launcher'&&role!=='AT'||key==='mg'&&role!=='MG'||key==='rifle'&&['AT','MG','AA_TEAM'].includes(role))continue;const mesh=this.parts.get(key)!,n=this.counts.get(key)||0;if(n<1024){mesh.setMatrixAt(n,node.matrixWorld);this.counts.set(key,n+1)}}
  }
  end(visible:boolean){for(const [key,mesh]of this.parts){mesh.count=visible?this.counts.get(key)||0:0;mesh.instanceMatrix.needsUpdate=true}}
}
export function vehicleGeometry(role:Role,side:Side,attachment=false){const c=SIDE_COLOR[side],parts:T.BufferGeometry[]=[];const b=(w:number,d:number,h:number,x=0,y=0,z=0,color=kit)=>parts.push(block(w,d,h,x,y,z,color))
  if(isAir(role)||isSupportModel(role)){const model=isAir(role)?createAircraft(role,side):createSupportModel(role,side);model.updateMatrixWorld(true);const source=attachment&&role==='ATTACK_HELI'?model.getObjectByName('main-rotor')!:model;source.traverse(o=>{if(o instanceof T.Mesh){const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);parts.push(colored(g,`#${(o.material as T.MeshStandardMaterial).color.getHexString()}`))}});disposeModel(model);return combine(parts)}
  if(attachment){if(role==='APC'){b(.85,.85,.3,0,-.3,2.5,armor);b(.08,1.25,.08,0,.4,2.75,black);return combine(parts)}if(role==='IFV'){b(.4,1.6,.4,1.15,-.3,2.7,black);b(.4,1.6,.4,-1.15,-.3,2.7,black)}b(2.1,2.2,.8,0,-.4,2);b(.18,role==='TANK'?4:2.3,.18,0,role==='TANK'?2.4:1.4,2.35,black);b(.6,.7,.15,.55,-.8,2.5,armor);return combine(parts)}
  if(role==='TRUCK'){b(2.4,6.6,.35,0,0,.85,black);b(2.6,2,1.85,0,2.2,1.85);b(2.65,1.25,.6,0,3.1,1.35);b(2.25,.05,.65,0,3.23,2.1,black);b(.07,1.2,.65,-1.32,2.1,2.1,black);b(.07,1.2,.65,1.32,2.1,2.1,black);b(2.7,3.9,.23,0,-1.2,1.2);b(2.55,3.8,1.6,0,-1.2,2,armor);for(const x of [-1.3,1.3]){for(const y of [-2.3,-.9,2.3]){const wheel=new T.CylinderGeometry(.57,.57,.42,16).toNonIndexed();wheel.rotateZ(Math.PI/2);wheel.translate(x,y,.59);parts.push(colored(wheel,black))}b(.06,.6,.32,x,2.1,1.55,c)}b(2.8,.2,.26,0,3.7,.9,black);for(const x of [-.95,.95])b(.3,.06,.23,x,3.75,1.34,face)}
  else if(role==='APC'||role==='CANNON_APC'){b(2.75,6.6,1.45,0,0,1.55);b(2.6,1.3,.35,0,2.5,2.35);b(1.5,.08,1.2,0,-3.35,1.55,black);for(const x of [-1.5,1.5]){for(const y of [-2.45,-.85,.85,2.45]){const wheel=new T.CylinderGeometry(.65,.65,.42,16).toNonIndexed();wheel.rotateZ(Math.PI/2);wheel.translate(x,y,.7);parts.push(colored(wheel,black))}b(.06,1.2,.3,x*.93,0,2.1,c)}b(.8,.6,.12,0,-1.8,2.35,armor)}
  else {b(3,5.5,1.3,0,0,1);if(role==='IFV'){const slope=block(2.85,1.7,.3,0,0,0,armor);slope.rotateX(-.28);slope.translate(0,2.5,1.7);parts.push(slope);b(.3,3.5,.7,-1.65,0,1.4,armor);b(.3,3.5,.7,1.65,0,1.4,armor)}b(.55,5.8,1.1,-1.5,0,.6,black);b(.55,5.8,1.1,1.5,0,.6,black);b(.25,1.6,.1,1.2,1,1.7,c);for(let i=-2;i<=2;i++){b(.15,.65,.65,-1.82,i,.65,armor);b(.15,.65,.65,1.82,i,.65,armor)}}
  return combine(parts)
}
