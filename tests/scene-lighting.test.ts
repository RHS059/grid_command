import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from '../lib/game/scene-data'
import { addWestSun } from '../lib/game/scene-lighting'

test('the shared scene rig contains one low warm sun west of the theater',()=>{
  const scene=new T.Scene(),sun=addWestSun(scene,100)
  const globalLights=scene.children.filter(node=>node instanceof T.DirectionalLight||node instanceof T.HemisphereLight)
  assert.deepEqual(globalLights,[sun])
  assert.ok(sun.position.x<0)
  assert.ok(sun.position.z/Math.hypot(sun.position.x,sun.position.y)<.25)
  assert.ok(sun.color.r>sun.color.g&&sun.color.g>sun.color.b)
})
