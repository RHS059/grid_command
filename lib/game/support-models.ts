import { createCargoContainer } from './container-model'
import { containerOnTruck, truckContainerPose } from './mob'
import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { shell, rod } from './model-geometry'
import { SIDE_COLOR, type Role, type Side, type MissionState } from './types'
export const isSupportModel=(role:Role)=>['FORKLIFT','TRUCK','TROOP_TRUCK','UAV_JAMMER'].includes(role)
export function createSupportModel(role:Role,side:Side){
  const root=new T.Group();root.name=role
  const body=new T.MeshStandardMaterial({color:'#73765a',roughness:.9,flatShading:true}),dark=new T.MeshStandardMaterial({color:'#262c29',roughness:.9,flatShading:true}),metal=new T.MeshStandardMaterial({color:'#565f51',metalness:.15,roughness:.8,flatShading:true}),glass=new T.MeshStandardMaterial({color:'#293e4c',metalness:.6,roughness:.15}),mark=new T.MeshStandardMaterial({color:SIDE_COLOR[side]})
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
    // Eight-wheel cab-over logistics carrier with a ribbed container.
    b(2.45,9.2,.28,0,-.25,.95,dark);b(2.6,5.4,.18,0,-1.9,1.38,metal)
    const cab=new T.Mesh(shell([{z:1.1,w:2.15,d:2.2,y:3.05},{z:1.7,w:2.65,d:2.65,y:3.1},{z:3.05,w:2.5,d:1.85,y:2.9},{z:3.2,w:2.25,d:1.65,y:2.86}],'#ffffff'),body);root.add(cab)
    for(const x of [-.62,.62]){const screen=b(1.08,.035,.98,x,3.96,2.49,glass);screen.rotation.x=.31}
    b(2.7,.2,.23,0,4.43,1.48,metal);b(1.35,.06,.35,0,4.33,1.79,dark)
    for(let i=0;i<4;i++)b(1.3,.025,.025,0,4.37,1.67+i*.07,metal)
    for(const sign of [-1,1]){
      for(const y of [3.1,1.55,-2.5,-4.1]){wheel(sign*1.35,y,.7,.69);b(.5,1.5,.1,sign*1.15,y,1.43)}
      b(.025,1,.7,sign*1.28,2.95,2.48,glass);b(.04,.9,.035,sign*1.29,2.9,1.84,metal)
      b(.075,.23,.045,sign*1.32,2.57,2,dark);b(.38,.62,.1,sign*1.39,2.58,1.14,metal)
      const mirror=new T.Mesh(rod([sign*1.2,3.35,2.7],[sign*1.65,3.5,2.75],.025,'#ffffff'),metal);root.add(mirror);b(.09,.27,.4,sign*1.65,3.5,2.68,glass)
      for(const x of [sign*.95,sign*1.17])b(.17,.045,.18,x,4.43,1.83,metal)
      b(.055,.75,.2,sign*1.33,1.02,1.83,mark)
      const tank=new T.Mesh(new T.CylinderGeometry(.43,.43,1.4,10),metal);tank.position.set(sign*1.05,-.15,1.04);root.add(tank)
      for(const y of [-.7,.4])b(.88,.045,.65,sign*1.05,y,1.03,dark)
      b(.08,.65,.55,sign*1.35,-4.55,.75,dark)
    }
    const container=createCargoContainer();container.name='truck-container-0';const pose=truckContainerPose(0);container.position.set(pose.x,pose.y,pose.z);root.add(container)
    b(2.65,.17,.2,0,-4.83,1.18,metal)
    const spare=new T.Mesh(new T.CylinderGeometry(.64,.64,.3,12),dark);spare.rotation.z=Math.PI/2;spare.position.set(0,1.15,2.05);root.add(spare)
    for(let i=0;i<2;i++){
      const trailer=new T.Group();trailer.name=`cargo-trailer-${i+1}`;trailer.position.y=-7-i*6.2;trailer.visible=false;root.add(trailer)
      b(.2,2,.2,0,3,.6,metal,trailer);b(2.5,4.8,.3,0,0,.8,dark,trailer);const cargo=createCargoContainer();cargo.name=`truck-container-${i+1}`;cargo.position.z=truckContainerPose(i+1).z;trailer.add(cargo)
      for(const x of [-1.3,1.3])for(const y of [-1.3,1.3]){const tire=new T.Mesh(new T.CylinderGeometry(.5,.5,.3,16),dark);tire.rotation.z=Math.PI/2;tire.position.set(x,y,.5);trailer.add(tire)}
    }
  }else if(role==='TROOP_TRUCK'){
    const sculpt=(rings:Parameters<typeof shell>[0],m=body)=>{const o=new T.Mesh(shell(rings,'#ffffff'),m);root.add(o);return o}
    const rail=(a:[number,number,number],end:[number,number,number],r=.04,m=body)=>{const o=new T.Mesh(rod(a,end,r,'#ffffff'),m);root.add(o);return o}
    b(2.15,4.6,.24,0,0,.66,dark);b(1.9,3.1,.12,0,-.3,.88)
    sculpt([{z:.83,w:2.05,d:1.3,y:1.6},{z:1.27,w:2.1,d:1.4,y:1.65},{z:1.5,w:1.82,d:1.06,y:1.5}])
    b(1.25,.045,.27,0,2.35,1.07,dark)
    for(let i=0;i<5;i++)b(1.18,.025,.022,0,2.38,.96+i*.045,metal)
    b(2.25,.2,.16,0,2.43,.69,metal)
    for(const x of [-.84,.84]){
      b(.28,.05,.09,x,2.3,1.23,glass);b(.11,.04,.065,x,2.47,.72,mark)
      rail([x*.85,2.47,.66],[x*.85,2.47,.49],.035,metal)
    }
    // Open-sided cabin and rear passenger bay, with eight visible seats.
    for(const x of [-.49,.49])for(const y of [.35,-.55,-1.45,-2.12]){
      b(.61,.55,.12,x,y,1.02,dark)
      const back=b(.59,.12,.64,x,y-.24,1.37,dark);back.rotation.x=-.08
      b(.32,.13,.19,x,y-.27,1.8,dark)
      b(.035,.028,.5,x+.14,y-.165,1.37,metal)
    }
    for(const x of [-1,1]){
      for(const y of [1.5,-1.7]){
        wheel(x*1.1,y,.58,.57)
        const fender=sculpt([{z:1.02,w:.47,d:1.4,y},{z:1.27,w:.5,d:1.25,y},{z:1.35,w:.34,d:.96,y}]);fender.position.x=x
      }
      rail([x,.8,.94],[x*.86,.45,2.18]);rail([x*.86,.45,2.18],[x*.86,-2.2,2.18])
      rail([x,-2.35,.85],[x*.86,-2.2,2.18]);rail([x,-.55,.9],[x*.86,-.55,2.18])
      rail([x,-2.3,1.05],[x*.86,-1.4,2.18],.035)
      b(.15,2.8,.11,x,-.45,.8,metal);b(.035,.4,.11,x*1.01,-1.05,.98,mark)
    }
    for(const y of [.45,-.55,-2.2])rail([-.86,y,2.18],[.86,y,2.18])
    const screen=b(1.75,.025,.38,0,.66,1.71,glass);screen.rotation.x=-.27
    rail([-.91,.79,1.49],[.91,.79,1.49]);rail([0,.79,1.49],[0,.54,1.92],.025)
    // Instrument binnacle and low-sided rear bed retain the utility silhouette.
    b(1.73,.26,.16,0,.77,1.4,dark);b(.35,.06,.12,-.46,.61,1.46,glass)
    const steering=new T.Mesh(new T.TorusGeometry(.15,.018,4,8),dark);steering.position.set(-.49,.39,1.48);steering.rotation.x=.7;root.add(steering)
    b(1.95,.1,.25,0,-2.52,1.03);b(2.12,.18,.16,0,-2.63,.66,metal)
    // Bake stationary details into one mesh per material, instead of extra draw calls.
    const meshes=root.children.filter((o):o is T.Mesh=>o instanceof T.Mesh)
    for(const material of [body,dark,metal,glass,mark]){
      const group=meshes.filter(m=>m.material===material);if(!group.length)continue
      const geometries=group.map(m=>{m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.deleteAttribute('color');g.applyMatrix4(m.matrix);return g})
      const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());group.forEach(m=>{root.remove(m);m.geometry.dispose()});root.add(new T.Mesh(merged,material))
    }
  }else{
    b(2,1.6,.2,0,0,.15,metal);b(1.35,1.2,1.4,0,0,.95);b(.8,.04,.4,0,.62,1.2,dark);b(.55,.045,.1,0,.65,1.2,mark)
    for(let i=0;i<6;i++)b(.85,.04,.04,0,-.62,.55+i*.12,dark)
    b(.13,.13,5,0,0,3.8,metal);for(const x of [-.7,.7]){b(.08,.08,2,x,0,5.1,dark);b(1.5,.09,.08,0,0,4.6,metal)}
    b(.65,.7,.6,1.15,0,.45,dark);b(.35,.05,.13,1.15,.36,.5,mark)
  }
  if(role==='TRUCK'){
    const meshes=root.children.filter((o):o is T.Mesh=>o instanceof T.Mesh&&!o.name.startsWith('truck-container-'))
    for(const material of [body,dark,metal,glass,mark]){
      const group=meshes.filter(m=>m.material===material);if(!group.length)continue
      const geos=group.map(m=>{m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.deleteAttribute('color');g.applyMatrix4(m.matrix);return g})
      const merged=mergeGeometries(geos);geos.forEach(g=>g.dispose());group.forEach(m=>{root.remove(m);m.geometry.dispose()});root.add(new T.Mesh(merged,material))
    }
  }
  return root
}
export function animateSupport(root:T.Object3D,time:number,mission?:MissionState){
  for(let i=0;i<3;i++){const container=root.getObjectByName(`truck-container-${i}`);if(container)container.visible=containerOnTruck(mission,i,time)}
for(let i=1;i<=2;i++){const trailer=root.getObjectByName(`cargo-trailer-${i}`);if(trailer)trailer.visible=i<=(mission?.trailers||0)}const forks=root.getObjectByName('fork-carriage'),pallet=root.getObjectByName('pallet');if(forks)forks.position.z=mission?(['loading','placing'].includes(mission.phase)?Math.min(.8,Math.max(0,time-mission.since)*.2):.35):.4+Math.sin(time)*.35;if(pallet)pallet.visible=mission?!!mission.cargo:true}

