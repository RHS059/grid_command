import test from 'node:test'
import assert from 'node:assert/strict'
import { createBlenderVehicle } from '../lib/game/blender-vehicles'
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
