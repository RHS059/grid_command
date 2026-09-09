import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from '../lib/game/scene-data'
import { addWestSun, addBattlefieldLighting } from '../lib/game/scene-lighting'

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
