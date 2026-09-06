import * as T from 'three'
import { SIDE_COLOR, type Role, type Side, type MissionState } from './types'
export const isSupportModel=(role:Role)=>['FORKLIFT','TRUCK','TROOP_TRUCK','UAV_JAMMER'].includes(role)
export function createSupportModel(role:Role,side:Side){
  const root=new T.Group();root.name=role
  const body=new T.MeshStandardMaterial({color:'#65716a',roughness:.8}),dark=new T.MeshStandardMaterial({color:'#18222b',roughness:.7}),metal=new T.MeshStandardMaterial({color:'#a4afb4',metalness:.65,roughness:.4}),glass=new T.MeshStandardMaterial({color:'#293e4c',metalness:.6,roughness:.15}),mark=new T.MeshStandardMaterial({color:SIDE_COLOR[side]})
  root.userData.materials=[body,dark,metal,glass,mark]
  const b=(w:number,d:number,h:number,x:number,y:number,z:number,m=body,parent:T.Object3D=root)=>{const o=new T.Mesh(new T.BoxGeometry(w,d,h),m);o.position.set(x,y,z);parent.add(o);return o}
  const wheel=(x:number,y:number,z:number,r=.48)=>{const o=new T.Mesh(new T.CylinderGeometry(r,r,.3,16),dark);o.rotation.z=Math.PI/2;o.position.set(x,y,z);root.add(o);b(.05,.3,.3,x*1.02,y,z,metal)}
  if(role==='FORKLIFT'){
    b(1.7,2.4,.65,0,-.1,.7);b(1.7,.8,1,0,-.95,1.15);b(.65,.65,.2,0,0,1.15,dark);b(.65,.2,.65,0,-.3,1.45,dark)
    for(const x of [-.78,.78]){for(const y of [-.7,.75]){wheel(x,y,.4,.38);b(.09,.09,1.65,x,y,1.75,metal)}b(.1,.16,3.2,x,1.3,1.8,dark)}b(1.8,1.9,.12,0,0,2.65,metal)
    const forks=new T.Group();forks.name='fork-carriage';root.add(forks);b(1.6,.12,.8,0,1.45,.8,metal,forks)
    for(const x of [-.5,.5])b(.18,1.65,.08,x,2.1,.35,metal,forks)
    const pallet=new T.Group();pallet.name='pallet';forks.add(pallet);b(1.5,1.25,.18,0,2,.5,metal,pallet);b(1.25,1.1,.8,0,2,1,body,pallet);b(.07,1.15,.85,0,2,1,dark,pallet);b(1.25,.04,.24,0,2.56,1,mark,pallet)
    b(1,.03,.25,0,-1.36,1.2,mark)
  }else if(role==='TRUCK'){
    b(2.5,7,.35,0,0,.85,dark); b(2.45,2.1,1.8,0,2.3,1.9); b(2.4,4.5,1.8,0,-1.1,1.95)
    b(2.1,.06,.8,0,3.38,2.25,glass); b(2.5,.2,.3,0,3.55,.75,dark)
    for(const x of [-1.3,1.3])for(const y of [2.3,-1,-2.6])wheel(x,y,.55,.52)
    b(1.2,.05,.3,0,-3.38,2,mark)
    for(let i=0;i<2;i++){
      const trailer=new T.Group();trailer.name=`cargo-trailer-${i+1}`;trailer.position.y=-7-i*6.2;trailer.visible=false;root.add(trailer)
      b(.2,2,.2,0,3,.6,metal,trailer);b(2.5,4.8,.3,0,0,.8,dark,trailer);b(2.4,4.5,1.9,0,0,1.9,body,trailer);b(1.2,.06,.3,0,-2.28,2,mark,trailer)
      for(const x of [-1.3,1.3])for(const y of [-1.3,1.3]){const tire=new T.Mesh(new T.CylinderGeometry(.5,.5,.3,16),dark);tire.rotation.z=Math.PI/2;tire.position.set(x,y,.5);trailer.add(tire)}
    }
  }else if(role==='TROOP_TRUCK'){
    b(2.35,4.65,.35,0,0,.7,dark);b(2.3,2.8,1.3,0,-.5,1.45);b(2.3,1.35,.55,0,1.55,1.1);b(2.4,2.9,.12,0,-.5,2.15)
    b(2,.045,.65,0,1,1.78,glass);b(.09,.07,.72,0,1.03,1.78,dark)
    for(const x of [-1.15,1.15]){wheel(x,1.45,.49);wheel(x,-1.55,.49);for(const y of [-1.2,.35]){b(.035,1.2,.56,x,y,1.8,glass);b(.05,.24,.06,x*1.01,y,1.38,metal)}b(.06,.6,.22,x,0,1.15,mark)}
    b(2.45,.25,.25,0,2.35,.65,dark);b(1.2,.06,.35,0,2.25,1,dark);for(const x of [-.88,.88])b(.25,.08,.23,x,2.27,1.05,metal)
    const spare=new T.Mesh(new T.CylinderGeometry(.48,.48,.25,16),dark);spare.position.set(.5,-2.05,1.45);root.add(spare)
  }else{
    b(2,1.6,.2,0,0,.15,metal);b(1.35,1.2,1.4,0,0,.95);b(.8,.04,.4,0,.62,1.2,dark);b(.55,.045,.1,0,.65,1.2,mark)
    for(let i=0;i<6;i++)b(.85,.04,.04,0,-.62,.55+i*.12,dark)
    b(.13,.13,5,0,0,3.8,metal);for(const x of [-.7,.7]){b(.08,.08,2,x,0,5.1,dark);b(1.5,.09,.08,0,0,4.6,metal)}
    b(.65,.7,.6,1.15,0,.45,dark);b(.35,.05,.13,1.15,.36,.5,mark)
  }
  return root
}
export function animateSupport(root:T.Object3D,time:number,mission?:MissionState){for(let i=1;i<=2;i++){const trailer=root.getObjectByName(`cargo-trailer-${i}`);if(trailer)trailer.visible=i<=(mission?.trailers||0)}const forks=root.getObjectByName('fork-carriage'),pallet=root.getObjectByName('pallet');if(forks)forks.position.z=mission?(['loading','placing'].includes(mission.phase)?Math.min(.8,Math.max(0,time-mission.since)*.2):.35):.4+Math.sin(time)*.35;if(pallet)pallet.visible=mission?!!mission.cargo:true}
