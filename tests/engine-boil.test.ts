import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from '../lib/game/scene-data'
import { EngineBoil, applyEngineBoil } from '../lib/game/engine-boil'

test('motor boil is deterministic, restrained, independently phased and reduced in motion',()=>{
  const a=new EngineBoil('TANK','unit:1'),b=new EngineBoil('TANK','unit:1'),c=new EngineBoil('TANK','unit:2'),moving=new EngineBoil('TANK','unit:1')
  let difference=0
  for(let i=0;i<600;i++){
    const time=i/60,p=a.sample(time,true),same=b.sample(time,true),other=c.sample(time,true),drive=moving.sample(time,true,true)
    assert.deepEqual(p,same);assert.ok(p.position.length()<.0031);assert.ok(p.rotation.length()<.0005)
    assert.ok(Math.abs(drive.position.length()-p.position.length()*.35)<1e-12)
    difference+=p.position.clone().sub(other.position).length()
  }
  assert.ok(difference>.1)
})

test('power transitions fade, paused sampling freezes, and dead or non-ground roles stay still',()=>{
  const motor=new EngineBoil('TRUCK','u')
  motor.sample(0,false)
  const starting=motor.sample(1/60,true)
  assert.ok(starting.position.length()>0&&starting.position.length()<.0005)
  for(let i=2;i<120;i++)motor.sample(i/60,true)
  const stopped=motor.sample(2,false)
  assert.ok(stopped.position.length()>0)
  assert.deepEqual(motor.sample(2,false),stopped)
  for(let i=121;i<300;i++)motor.sample(i/60,false)
  assert.equal(motor.sample(5,false).position.length(),0)
  assert.equal(motor.sample(6,true,false,false).rotation.length(),0)
  for(const role of ['RIFLE','MOB','AIRFIELD','JET','PATROL_BOAT','AMPHIBIOUS_APC','UAV_JAMMER']){
    const excluded=new EngineBoil(role,'u');excluded.sample(0,true)
    assert.equal(excluded.sample(.1,true).position.length(),0)
  }
})

test('complete assembly shares a stable motor transform without altering local articulation or drifting',()=>{
  const motor=new EngineBoil('IFV','u'),body=new T.Group(),turret=new T.Group(),wheel=new T.Group(),stowage=new T.Group()
  turret.position.set(0,0,2);turret.rotation.z=.6;wheel.position.set(1,0,.4);stowage.position.set(-1,0,2);body.add(turret,wheel,stowage)
  const locals=body.children.map(child=>({position:child.position.toArray(),rotation:child.rotation.toArray()}))
  motor.sample(0,true);const pose=motor.sample(.1,true)
  let matrix:number[]=[]
  for(let i=0;i<10000;i++){
    body.position.set(30,40,0);body.rotation.set(0,0,.8);applyEngineBoil(body,pose);body.updateMatrixWorld(true)
    if(i===0)matrix=[...body.matrix.elements];else assert.deepEqual(body.matrix.elements,matrix)
  }
  assert.deepEqual(body.children.map(child=>({position:child.position.toArray(),rotation:child.rotation.toArray()})),locals)
  assert.notDeepEqual(body.matrix.elements,new T.Matrix4().elements)
  // The instanced turret uses exactly the hull matrix followed by its own aim.
  const expected=new T.Matrix4().multiplyMatrices(body.matrix,turret.matrix)
  assert.deepEqual(turret.matrixWorld.elements,expected.elements)
})
