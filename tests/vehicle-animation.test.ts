import test from 'node:test'
import assert from 'node:assert/strict'
import { createBlenderVehicle } from '../lib/game/blender-vehicles'
import { addCarrierOccupants } from '../lib/game/carrier-occupants'
import { vehicleRig, vehicleClips, poseVehicleClip, advanceVehiclePlayback, sampleVehicleNode } from '../lib/game/vehicle-animation'
import type { Role } from '../lib/game/types'
const roles:Role[]=['TANK','TROOP_TRUCK','APC','HEAVY_LIFT_HELI','ATTACK_HELI','CAS_FIGHTER','JET']
test('seven roles expose complete articulated hierarchies and finite independently sampled clips',()=>{
 for(const role of roles){const root=createBlenderVehicle(role,'BLU'),rig=vehicleRig(role)!;assert.ok(rig.clips.length>=2)
 for(const [name,node] of Object.entries(rig.nodes)){const part=root.getObjectByName(name)!;assert.ok(part,name);if(node.parent)assert.equal(part.parent?.name,node.parent)}
 for(const clip of rig.clips){poseVehicleClip(root,clip.id,clip.duration*.43);const positions=Object.keys(rig.nodes).map(n=>root.getObjectByName(n)!.position.toArray());assert.ok(positions.flat().every(Number.isFinite));poseVehicleClip(root,'idle',0);poseVehicleClip(root,clip.id,clip.duration*.43);assert.deepEqual(Object.keys(rig.nodes).map(n=>root.getObjectByName(n)!.position.toArray()),positions)}
 }
})
test('VTOL roles separate closed attack weaponry from cargo parallax and doors',()=>{
 const cargo=createBlenderVehicle('HEAVY_LIFT_HELI','BLU'),attack=createBlenderVehicle('ATTACK_HELI','BLU')
 assert.equal(vehicleRig('HEAVY_LIFT_HELI')!.variant,'vtol_cargo');assert.equal(vehicleRig('ATTACK_HELI')!.variant,'vtol_attack')
 assert.ok(cargo.getObjectByName('vehicle-parallax-interior'));assert.ok(cargo.getObjectByName('cargo_door'));assert.ok(!cargo.getObjectByName('cannon'))
 assert.ok(attack.getObjectByName('cannon'));assert.ok(!attack.getObjectByName('cargo_door'));assert.ok(!attack.getObjectByName('vehicle-parallax-interior'))
 assert.ok(!vehicleClips('HEAVY_LIFT_HELI').some(c=>c.id==='shoot'));assert.ok(!vehicleClips('ATTACK_HELI').some(c=>c.id==='open'))
 assert.ok(vehicleRig('ATTACK_HELI')!.nodes.rotor_L.pivot[1]>vehicleRig('HEAVY_LIFT_HELI')!.nodes.rotor_L.pivot[1])
 assert.ok(vehicleRig('ATTACK_HELI')!.nodes.rotor_L.pivot[2]<vehicleRig('HEAVY_LIFT_HELI')!.nodes.rotor_L.pivot[2])
})
test('articulation moves wheels, track pads, ramps, cannon and rotor around stable roots',()=>{
 const tank=createBlenderVehicle('TANK','BLU');poseVehicleClip(tank,'drive',.5);assert.notEqual(tank.getObjectByName('wheel_L_0')!.rotation.x,0);assert.deepEqual(tank.position.toArray(),[0,0,0])
 const track=Object.keys(vehicleRig('TANK')!.nodes).find(n=>n.startsWith('track_'))!;assert.notDeepEqual(tank.getObjectByName(track)!.position.toArray(),vehicleRig('TANK')!.nodes[track].pivot)
 poseVehicleClip(tank,'shoot',.12);assert.ok(tank.getObjectByName('cannon')!.position.y<vehicleRig('TANK')!.nodes.cannon.pivot[1]-vehicleRig('TANK')!.nodes.turret.pivot[1])
 const apc=createBlenderVehicle('APC','BLU');poseVehicleClip(apc,'open',0);const closed=apc.getObjectByName('ramp')!.rotation.x;poseVehicleClip(apc,'open',2);assert.notEqual(apc.getObjectByName('ramp')!.rotation.x,closed)
 const aircraft=createBlenderVehicle('ATTACK_HELI','BLU');poseVehicleClip(aircraft,'rotors',.125);assert.equal(aircraft.getObjectByName('rotor_L')!.rotation.y,Math.PI);poseVehicleClip(aircraft,'tilt',3);assert.equal(aircraft.getObjectByName('nacelle_L')!.rotation.x,Math.PI/2)
})
test('preview playback supports pause, looping, one-shot end, restart and arbitrary scrubbing',()=>{
 assert.equal(advanceVehiclePlayback(.7,.3,false,2,true),.7);assert.equal(advanceVehiclePlayback(1.9,.3,true,2,false),2);assert.ok(Math.abs(advanceVehiclePlayback(1.9,.3,true,2,true)-.2)<1e-8)
 const root=createBlenderVehicle('APC','BLU');poseVehicleClip(root,'open',1.2);const pose=root.getObjectByName('ramp')!.rotation.x;poseVehicleClip(root,'open',0);assert.notEqual(root.getObjectByName('ramp')!.rotation.x,pose);poseVehicleClip(root,'open',1.2);assert.equal(root.getObjectByName('ramp')!.rotation.x,pose)
})

test('looping wheels return to matching orientation and gear folds inward',()=>{
 const wheel=vehicleRig('TROOP_TRUCK')!.nodes.wheel_L_0
 assert.ok(Math.abs(Math.sin(sampleVehicleNode(wheel,'drive',2,2).rotation[0]))<1e-8)
 const nodes=vehicleRig('CAS_FIGHTER')!.nodes
 assert.ok(sampleVehicleNode(nodes.gear_L,'gear',2,2).rotation[1]<0)
 assert.ok(sampleVehicleNode(nodes.gear_R,'gear',2,2).rotation[1]>0)
 assert.ok(sampleVehicleNode(nodes.gear_N,'gear',2,2).rotation[0]<0)
})

test('CAS fires paired emissive cowl flashes while every fuel pod stays mounted',()=>{
 const root=createBlenderVehicle('CAS_FIGHTER','BLU'),rig=vehicleRig('CAS_FIGHTER')!
 const pods=Object.entries(rig.nodes).filter(([name])=>name.startsWith('fuel_pod_'))
 assert.equal(pods.length,4);assert.ok(!Object.values(rig.nodes).some(node=>node.kind==='store'))
 for(const [name,node] of pods){assert.equal(node.kind,'fixed');for(const clip of rig.clips)for(let i=0;i<=120;i++){poseVehicleClip(root,clip.id,i*clip.duration/120);assert.deepEqual(root.getObjectByName(name)!.position.toArray(),node.pivot);assert.deepEqual(root.getObjectByName(name)!.scale.toArray(),[1,1,1])}}
 for(const side of ['L','R']){
  const name='muzzle_flash_'+side,node=rig.nodes[name],flash=root.getObjectByName(name)!
  assert.ok(node.pivot[1]<rig.nodes.propeller.pivot[1]&&node.pivot[1]>3.4)
  assert.equal(flash.parent?.name,'cannon_'+side)
  const mesh=root.getObjectByName(name+'_mesh') as import('../lib/game/scene-data').Mesh
  const material=mesh.material as import('../lib/game/scene-data').Material
  assert.ok(material.emissiveIntensity>=4);assert.ok(material.emissive.r>material.emissive.b)
  poseVehicleClip(root,'shoot',.1);assert.equal(flash.scale.x,1)
  poseVehicleClip(root,'shoot',.19);assert.equal(flash.scale.x,0)
  poseVehicleClip(root,'shoot',.28);assert.equal(flash.scale.x,1)
  poseVehicleClip(root,'shoot',1.2);assert.equal(flash.scale.x,0)
  poseVehicleClip(root,'idle',0);assert.equal(flash.scale.x,0)
  for(let i=0;i<6;i++){assert.equal(sampleVehicleNode(node,'shoot',Math.round((.05+i*.18)*1e6)/1e6,1.2).scale,1);assert.equal(sampleVehicleNode(node,'shoot',Math.round((.15+i*.18)*1e6)/1e6,1.2).scale,0)}
 }
})

test('carrier seats eight canonical occupants and selects an independent boarding clip for every seat',()=>{
 const root=createBlenderVehicle('TROOP_TRUCK','BLU'),rig=vehicleRig('TROOP_TRUCK')!,seats=rig.seats!
 assert.equal(seats.length,8);assert.equal(seats.filter(s=>s.yaw===0).length,6)
 assert.equal(seats[6].yaw,-Math.PI/2);assert.equal(seats[7].yaw,Math.PI/2)
 addCarrierOccupants(root,'BLU',true);assert.equal(root.userData.crewCount,8)
 const actors=root.children.filter(o=>o.userData.seatId)
 assert.equal(actors.length,8);assert.ok(actors.every(o=>o.visible&&o.scale.x===1&&o.userData.nativeAssetURL.endsWith('/models/carrier-soldier.glb')))
 for(const seat of seats){
  const marker=root.getObjectByName(seat.name)!;assert.deepEqual(marker.position.toArray(),seat.position);assert.equal(marker.rotation.z,seat.yaw)
  for(const mode of ['mount','dismount']){
   const id=`${mode}_${seat.id}`;assert.ok(rig.clips.some(c=>c.id===id))
   poseVehicleClip(root,id,1.2)
   for(const actor of actors){const action=actor.userData.animationState[0];assert.equal(action.name,actor.userData.seatId===seat.id?id:`seat_${actor.userData.seatId}`);assert.equal(action.time,actor.userData.seatId===seat.id?1.2:0)}
  }
 }
 poseVehicleClip(root,'idle',0);assert.ok(actors.every(o=>o.userData.animationState[0].name.startsWith('seat_')))
})
