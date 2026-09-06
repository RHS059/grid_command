import test from 'node:test'
import assert from 'node:assert/strict'
import { DisplayPoses, followSubject, chaseView, angleBetween } from '../lib/game/chase-camera'
import { createUnit, initialState } from '../lib/game/types'
test('rear chase is heading-relative, shoulder-offset, and altitude-aware',()=>{
  const u=createUnit('BLU','RIFLE','rifle',{x:0,y:0}),view=chaseView(u,u,0,1,()=>30)
  assert.ok(view.from.y<0);assert.ok(view.from.x>0);assert.equal(view.targetZ,31.4)
  const jet=createUnit('BLU','JET','jet',{x:0,y:0});jet.altitude=230;const elevated=chaseView(jet,jet,Math.PI/2,1,()=>30);assert.ok(elevated.from.x<0);assert.equal(elevated.targetZ,262)
  const t=(elevated.target.x-elevated.from.x)/(elevated.to.x-elevated.from.x);assert.ok(Math.abs(elevated.fromZ+(elevated.toZ-elevated.fromZ)*t-elevated.targetZ)<1e-6)
})
test('display poses interpolate position, altitude and shortest-arc heading without pursuit lag',()=>{
  const poses=new DisplayPoses(),a=initialState();a.tick=1;a.units=[createUnit('BLU','JET','jet',{x:0,y:0})];a.units[0].heading=359*Math.PI/180
  poses.sample(a,0);const b=structuredClone(a);b.tick=2;b.units[0].x=88;b.units[0].altitude=50;b.units[0].heading=Math.PI/180
  poses.sample(b,50);const middle=poses.sample(b,75);assert.equal(middle.units[0].x,44);assert.equal(middle.units[0].altitude,25);assert.ok(Math.abs(angleBetween(middle.units[0].heading,0))<1e-10)
  assert.equal(poses.sample(b,10000).units[0].x,88);assert.equal(b.units[0].x,88)
  const restart=initialState();assert.equal(poses.sample(restart,10010),restart)
})
test('embarked selection follows its living carrier and pause uses exact snapshots',()=>{
  const s=initialState(),squad=createUnit('BLU','RIFLE','squad'),heli=createUnit('BLU','TRANSPORT_HELI','heli');s.units=[squad,heli];squad.carrier=heli.id
  assert.equal(followSubject(s,squad.id)?.unit.id,heli.id);heli.hp=0;assert.equal(followSubject(s,squad.id),null)
  const poses=new DisplayPoses();poses.sample(s,0);const paused=structuredClone(s);paused.paused=true;assert.equal(poses.sample(paused,50),paused)
})
