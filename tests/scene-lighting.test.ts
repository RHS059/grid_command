import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from '../lib/game/scene-data'
import { addWestSun, addBattlefieldLighting, addStudioLighting } from '../lib/game/scene-lighting'

test('the shared scene rig contains one low warm sun west of the theater',()=>{
  const scene=new T.Scene(),sun=addWestSun(scene,100)
  const globalLights=scene.children.filter(node=>node instanceof T.DirectionalLight||node instanceof T.HemisphereLight)
  assert.deepEqual(globalLights,[sun])
  assert.ok(sun.position.x<0)
  assert.ok(sun.position.z/Math.hypot(sun.position.x,sun.position.y)<.25)
  assert.ok(sun.color.r>sun.color.g&&sun.color.g>sun.color.b)
})

test('battlefield lighting keeps the west sun as the sole shadow owner alongside a low ambient sky',()=>{
  const scene=new T.Scene(),{sun,sky}=addBattlefieldLighting(scene,1600)
  assert.equal(scene.profile,'battlefield')
  const globalLights=scene.children.filter(node=>node instanceof T.DirectionalLight||node instanceof T.HemisphereLight)
  assert.deepEqual(new Set(globalLights),new Set([sun,sky]))
  assert.equal(sun.castShadow,true)
  assert.ok(sky.intensity>0&&sky.intensity<.5,'hemisphere fallback stays a low ambient fill, not a substitute key light')
  assert.ok(scene.background,'a deliberate fallback clear color is set so battlefield never renders with no sky at all')
})

test('battlefield lighting does not disturb the west-sun compatibility contract',()=>{
  const scene=new T.Scene(),{sun}=addBattlefieldLighting(scene,100)
  assert.ok(sun.position.x<0)
  assert.ok(sun.position.z/Math.hypot(sun.position.x,sun.position.y)<.25)
  assert.ok(sun.color.r>sun.color.g&&sun.color.g>sun.color.b)
})

test('the studio rig is exactly key, fill and rim, with only the key owning shadows',()=>{
  const scene=new T.Scene(),rig=addStudioLighting(scene)
  assert.equal(scene.profile,'studio')
  const globalLights=scene.children.filter(node=>node instanceof T.DirectionalLight||node instanceof T.HemisphereLight)
  const directional=globalLights.filter(light=>light instanceof T.DirectionalLight)
  const ambient=globalLights.filter(light=>light instanceof T.HemisphereLight)
  assert.deepEqual(new Set(directional),new Set([rig.key,rig.fill,rig.rim]),'exactly three directional roles')
  assert.ok(ambient.length<=1,'at most one weak hemisphere fill accompanies the three roles')
  for(const light of ambient)assert.ok(light.intensity<rig.fill.intensity,'ambient never becomes a fourth key')
  // Four lights total is the PBR maxSimultaneousLights ceiling; a fifth would silently drop one.
  assert.ok(globalLights.length<=4,'the studio rig fits inside maxSimultaneousLights')
  assert.deepEqual(globalLights.filter(light=>light.castShadow),[rig.key])
  assert.ok(rig.fill.intensity<rig.key.intensity,'fill stays weaker than the key so the key still shapes the form')
  for(const light of [rig.key,rig.fill,rig.rim]){
    const {r,g,b}=light.color
    assert.ok(Math.max(r,g,b)-Math.min(r,g,b)<.2,'studio lights stay near-neutral so team colors are not misrepresented')
  }
})

test('the studio rig keeps the key camera-left through a full orbit',()=>{
  const scene=new T.Scene(),rig=addStudioLighting(scene),center=new T.Vector3(),up=new T.Vector3(0,0,1)
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*1.9]){
    const position=new T.Vector3(Math.cos(angle)*10,Math.sin(angle)*10,6)
    rig.update({position,up},center,center,4)
    const forward=position.clone().sub(center).normalize(),right=new T.Vector3().crossVectors(up,forward).normalize()
    const keyOffset=rig.key.position.clone().sub(center).normalize(),fillOffset=rig.fill.position.clone().sub(center).normalize()
    // The key sits camera-left, the fill camera-right, at every orbit angle.
    assert.ok(keyOffset.dot(right)<-.3,`key stayed camera-left at ${angle.toFixed(2)}`)
    assert.ok(fillOffset.dot(right)>.3,`fill stayed camera-right at ${angle.toFixed(2)}`)
    // Both front lights stay on the viewer's side; the rim stays behind the subject.
    assert.ok(keyOffset.dot(forward)>0&&fillOffset.dot(forward)>0)
    assert.ok(rig.rim.position.clone().sub(center).normalize().dot(forward)<0)
    for(const light of [rig.key,rig.fill,rig.rim])assert.deepEqual(light.target.position.toArray(),center.toArray())
  }
})

test('the studio rig scales light distance with the subject and survives a degenerate camera',()=>{
  const scene=new T.Scene(),rig=addStudioLighting(scene),center=new T.Vector3(2,3,1),up=new T.Vector3(0,0,1)
  rig.update({position:new T.Vector3(20,20,20),up},center,center,5)
  assert.ok(Math.abs(rig.key.position.distanceTo(center)-15)<1e-6,'lights sit three subject radii from the bounds center')
  const before=rig.key.position.clone()
  // Camera collapsed onto its own target: the last valid basis is reused rather than
  // producing NaN light positions.
  rig.update({position:center.clone(),up},center,center,5)
  for(const light of [rig.key,rig.fill,rig.rim])for(const value of light.position.toArray())assert.ok(Number.isFinite(value))
  assert.ok(rig.key.position.distanceTo(before)<1e-6)
})
