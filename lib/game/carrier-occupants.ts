import * as T from './scene-data'
import { mergeGeometries } from './scene-data'
import { soldierParts } from './unit-models'
import type { Side, Unit, BattleState } from './types'

// Baked seated variants reuse the infantry art without seven independent rigs.
export function addCarrierOccupants(root:T.Object3D,side:Side){
  const parts=soldierParts(side),material=new T.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:.08,flatShading:true})
  const build=(driver:boolean)=>{
    const pieces:T.BufferGeometry[]=[]
    const place=(key:keyof typeof parts,x:number,y:number,z:number)=>pieces.push(parts[key].clone().scale(.85,.85,.85).translate(x,y,z))
    const limb=(key:keyof typeof parts,a:[number,number,number],b:[number,number,number],length:number)=>{
      const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.sub(from),g=parts[key].clone()
      g.scale(.85,.85,delta.length()/length);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),delta.normalize()));g.translate(...a);pieces.push(g)
    }
    place('pelvis',0,0,0);place('torso',0,0,.034);place('head',0,0,.527)
    for(const sign of [-1,1]){
      const hip:[number,number,number]=[sign*.098,0,-.05],knee:[number,number,number]=[sign*.098,.32,-.09]
      limb('thigh',hip,knee,.4);limb('shin',knee,[sign*.098,.34,-.4],.37);place('boot',sign*.098,.34,-.42)
      const shoulder:[number,number,number]=[sign*.264,0,.306]
      const elbow:[number,number,number]=[sign*.22,driver?.03:.12,.12]
      const hand:[number,number,number]=[sign*.12,driver?.27:.27,driver?.34:.08]
      limb('arm',shoulder,elbow,.28);limb('forearm',elbow,hand,.31)
    }
    const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());return geometry
  }
  const driver=new T.Mesh(build(true),material);driver.name='seated-driver';driver.position.set(-.49,.12,1.14);root.add(driver)
  const passengers=build(false)
  for(let i=0;i<6;i++){const person=new T.Mesh(passengers,material);person.name=`seated-passenger-${i}`;person.position.set(i%2?.49:-.49,[-.78,-1.68,-2.35][Math.floor(i/2)],1.14);person.visible=false;root.add(person)}
  Object.values(parts).forEach(g=>g.dispose())
}
export function updateCarrierOccupants(root:T.Object3D,carrier:Unit,state:BattleState){
  const driver=root.getObjectByName('seated-driver');if(driver)driver.visible=carrier.hp>0&&carrier.members>0&&!carrier.crewBailed
  const passengers=state.units.filter(u=>u.carrier===carrier.id).flatMap(u=>u.soldiers||[]).filter(s=>s.status==='active'&&!s.disembarked)
  for(let i=0;i<6;i++){const seat=root.getObjectByName(`seated-passenger-${i}`);if(seat)seat.visible=carrier.hp>0&&i<passengers.length}
}
