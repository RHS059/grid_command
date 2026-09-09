import test from 'node:test'
import assert from 'node:assert/strict'
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent'
import '@babylonjs/core/Shaders/postprocess.vertex'
import '@babylonjs/core/ShadersWGSL/postprocess.vertex'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { BattlefieldEffects, usesCinematicEffects } from '../lib/game/babylon-effects'

type EffectState = {
  taa: unknown
  contact: unknown
  reflections: unknown
  bloom: unknown
  tone: unknown
}

const fixture = () => {
  const engine = new NullEngine()
  Object.defineProperty(engine, 'isWebGPU', { value: true })
  const scene = new Scene(engine)
  const camera = new FreeCamera('camera', Vector3.Zero(), scene)
  return { engine, effects: new BattlefieldEffects(scene, camera) }
}

test('balanced effects attach only the color pass', () => {
  const { engine, effects } = fixture()
  effects.configure('balanced')
  const state = effects as unknown as EffectState
  assert.ok(state.tone)
  assert.equal(state.taa, null)
  assert.equal(state.contact, null)
  assert.equal(state.reflections, null)
  assert.equal(state.bloom, null)
  effects.dispose()
  assert.equal(state.tone, null)
  engine.dispose()
})

test('only explicit high quality selects the cinematic pipeline', () => {
  assert.equal(usesCinematicEffects('performance'), false)
  assert.equal(usesCinematicEffects('balanced'), false)
  assert.equal(usesCinematicEffects('high'), true)
})
