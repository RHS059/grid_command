import * as T from './scene-data'
import { mergeGeometries } from './scene-data'
import { BASES, SIDE_COLOR, type BattleState, type Side } from './types'
import { MOB_GARAGE, MOB_HELIPAD, MOB_TIERS, craneCycle, CRANE_LATCH, CRANE_RELEASE, mobDock, mobHelipadRise, mobStorage, truckContainerPose, type MobTier } from './mob'
import { createCargoContainer } from './container-model'

function mergeStatic(root:T.Group) {
  const meshes=root.children.filter((o):o is T.Mesh=>o instanceof T.Mesh)
  for(const material of new Set(meshes.map(m=>m.material))){
    const group=meshes.filter(m=>m.material===material)
    const geometries=group.map(m=>{m.updateMatrix();const g=m.geometry.toNonIndexed();g.applyMatrix4(m.matrix);return g})
    const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose())
    group.forEach(m=>{root.remove(m);m.geometry.dispose()});root.add(new T.Mesh(geometry,material))
  }
}
export function createMobYard(tier:MobTier,side:Side) {
  const yard=new T.Group();yard.name='mob-yard'
  const green=new T.MeshStandardMaterial({color:'#35432c',roughness:.92,metalness:.15})
  const steel=new T.MeshStandardMaterial({color:'#424a3c',roughness:.8,metalness:.3})
  const black=new T.MeshStandardMaterial({color:'#181e1b',roughness:1})
  const marking=new T.MeshStandardMaterial({color:SIDE_COLOR[side],roughness:.72,emissive:SIDE_COLOR[side],emissiveIntensity:.08})
  const box=(root:T.Object3D,w:number,d:number,h:number,x:number,y:number,z:number,m:T.Material=green)=>{
    const mesh=new T.Mesh(new T.BoxGeometry(w,d,h),m);mesh.position.set(x,y,z);root.add(mesh);return mesh
  }
  for(let slot=0;slot<3;slot++){
    const storage=mobStorage(slot),trailer=new T.Group();trailer.name=`mob-storage-${slot}`;yard.add(trailer)
    box(trailer,2.7,5.6,.25,storage.x,storage.y,1.35,steel)
    for(const x of [-1.3,1.3])for(const y of [-1.7,1.7]){
      const wheel=new T.Mesh(new T.CylinderGeometry(.6,.6,.3,10),black);wheel.rotation.z=Math.PI/2;wheel.position.set(storage.x+x,storage.y+y,.6);trailer.add(wheel)
    }
    mergeStatic(trailer)
    const stored=createCargoContainer();stored.position.set(storage.x,storage.y,2.7);trailer.add(stored)
    if(slot>=MOB_TIERS[tier].cranes)continue
    const crane=new T.Group();crane.name=`mob-crane-${slot}`;yard.add(crane)
    const x=mobDock(slot).x
    for(const sign of [-1,1]){
      box(crane,.5,76,.5,x+sign*3,49,10)
      for(const y of [12,86]){box(crane,.65,.65,10,x+sign*3,y,5);box(crane,1.2,2,.3,x+sign*3,y,.2,steel)}
      for(let y=16;y<85;y+=8)box(crane,.12,.12,1.2,x+sign*3,y,10.6,steel)
    }
    box(crane,6.5,1,.6,x,12,10.1);box(crane,6.5,1,.6,x,86,10.1)
    mergeStatic(crane)
    const trolley=new T.Group();trolley.name='trolley';crane.add(trolley)
    box(trolley,6.5,1.2,.5,x,0,10.4);box(trolley,1.8,1.8,1,x,0,10.9,steel)
    const cable=box(trolley,.07,.07,1,x,0,7,black);cable.name='cable'
    const spreader=box(trolley,2.6,5.3,.16,x,0,8,steel);spreader.name='spreader'
    const cargo=createCargoContainer();cargo.name='lifted-container';cargo.visible=false;crane.add(cargo)
  }
  const padTop=mobHelipadRise(tier),pad=new T.Mesh(new T.CylinderGeometry(MOB_HELIPAD.radius,MOB_HELIPAD.radius,padTop,48),steel)
  pad.rotation.x=Math.PI/2;pad.position.set(MOB_HELIPAD.x,MOB_HELIPAD.y,padTop/2);yard.add(pad)
  const ring=new T.Mesh(new T.RingGeometry(12.8,13.5,48),marking);ring.position.set(MOB_HELIPAD.x,MOB_HELIPAD.y,padTop+.015);yard.add(ring)
  box(yard,2,14,.06,MOB_HELIPAD.x-5,MOB_HELIPAD.y,padTop+.04,marking);box(yard,2,14,.06,MOB_HELIPAD.x+5,MOB_HELIPAD.y,padTop+.04,marking);box(yard,10,2,.06,MOB_HELIPAD.x,MOB_HELIPAD.y,padTop+.04,marking)
  const garage=new T.Group();garage.name='mob-garage';yard.add(garage)
  const g=MOB_GARAGE,front=g.insideY+g.depth/2
  box(garage,g.width,g.depth,.6,g.x,g.insideY,.3,steel);box(garage,g.width,g.depth,.7,g.x,g.insideY,g.height,steel)
  box(garage,1.2,g.depth,g.height,g.x-g.width/2+.6,g.insideY,g.height/2,green);box(garage,1.2,g.depth,g.height,g.x+g.width/2-.6,g.insideY,g.height/2,green);box(garage,g.width,1.2,g.height,g.x,g.insideY-g.depth/2+.6,g.height/2,green)
  box(garage,(g.width-g.doorWidth)/2,1.2,g.height,g.x-(g.width+g.doorWidth)/4,front-.6,g.height/2,green);box(garage,(g.width-g.doorWidth)/2,1.2,g.height,g.x+(g.width+g.doorWidth)/4,front-.6,g.height/2,green)
  const door=box(garage,g.doorWidth,.5,g.doorHeight,g.x,g.doorY,g.doorHeight/2,black);door.name='mob-garage-door';door.userData.closedZ=g.doorHeight/2
  if(tier===3){box(garage,g.width+2,2,.5,g.x,g.insideY-g.depth/2-1,g.height+1,marking);for(const x of [-12,0,12])box(garage,3,.3,.4,g.x+x,g.doorY+.4,g.height-1,marking)}
  // Animated parts move as a group above the same graded platform as the base.
  yard.traverse(o=>{o.userData.skipTerrainConform=true})
  return yard
}
const smooth=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x)}
export function animateMob(root:T.Group,state:BattleState,side:Side,time:number) {
  const yard=root.getObjectByName('mob-yard')
  if(!yard)return
  yard.position.z=root.userData.platformHeight||0
  const door=yard.getObjectByName('mob-garage-door')
  if(door){const garage=state.mobs?.[side]?.garage,elapsed=garage?Math.max(0,time-garage.since):0,open=!garage?0:garage.phase==='opening'?smooth(elapsed/MOB_GARAGE.openSeconds):garage.phase==='rollout'?1:1-smooth(elapsed/MOB_GARAGE.closeSeconds);door.position.z=door.userData.closedZ+Math.max(0,Math.min(1,open))*MOB_GARAGE.doorHeight}
  for(let slot=0;slot<3;slot++){
    const crane=yard.getObjectByName(`mob-crane-${slot}`)
    if(!crane)continue
    const trolley=crane.getObjectByName('trolley')!,cable=trolley.getObjectByName('cable')!,spreader=trolley.getObjectByName('spreader')!,cargo=crane.getObjectByName('lifted-container')!
    const destination=mobStorage(slot)
    const truck=state.units.find(u=>u.side===side&&u.role==='TRUCK'&&u.hp>0&&!u.servicing&&!u.emergency&&u.transport?.mobDock===slot&&u.transport.phase==='mob-unloading')
    let y=destination.y,z=7.8,angle=0
    cargo.visible=false
    if(truck){
      const cycle=craneCycle(truck.transport!,time),p=cycle.progress,pose=truckContainerPose(cycle.index)
      const fromY=truck.y-BASES[side].y+Math.cos(truck.heading)*pose.y,fromZ=pose.z+.2
      if(p<.15)y=destination.y+(fromY-destination.y)*smooth(p/.15)
      else if(p<CRANE_LATCH){y=fromY;z=7.8+(fromZ-7.8)*smooth((p-.15)/(CRANE_LATCH-.15))}
      else if(p<.45){y=fromY;z=fromZ+(7.8-fromZ)*smooth((p-CRANE_LATCH)/(.45-CRANE_LATCH))}
      else if(p<.72){y=fromY+(destination.y-fromY)*smooth((p-.45)/.27)}
      else if(p<CRANE_RELEASE){y=destination.y;z=7.8+(2.7-7.8)*smooth((p-.72)/(CRANE_RELEASE-.72))}
      else{y=destination.y;z=2.7+(7.8-2.7)*smooth((p-CRANE_RELEASE)/(1-CRANE_RELEASE))}
      angle=-truck.heading*(1-smooth((p-.45)/.27))
      cargo.visible=!cycle.complete&&p>=CRANE_LATCH&&p<CRANE_RELEASE
      cargo.position.set(destination.x,y,z);cargo.rotation.z=angle
    }
    trolley.position.y=y
    const hook=z+1.3,length=Math.max(.1,10.2-hook)
    cable.position.z=10.2-length/2;cable.scale.z=length
    spreader.position.z=hook;spreader.rotation.z=angle
  }
}

