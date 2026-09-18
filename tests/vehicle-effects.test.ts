import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import * as T from '../lib/game/scene-data'
import { attachVehicleEffects, updateVehicleEffects, VEHICLE_EFFECT_ATTACHMENTS, VEHICLE_SENSOR_COLOR } from '../lib/game/vehicle-effects'
import { createBlenderVehicle } from '../lib/game/blender-vehicles'
import { animateVehicleGameplay, poseVehicleClip } from '../lib/game/vehicle-animation'

test('Fury sensor follows team color without changing the shared aircraft atlas', () => {
  for (const side of ['BLU', 'RED'] as const) {
    const root = new T.Group()
    attachVehicleEffects(root, 'JET', side)
    const lens = root.getObjectByName('vehicle-fx-sensor-lens') as T.Mesh
    assert.deepEqual((lens.material as T.Material).color, new T.Color(VEHICLE_SENSOR_COLOR[side]))
    assert.equal((lens.material as T.Material).map, undefined)
    assert.deepEqual(root.getObjectByName('vehicle-fx-sensor')!.position.toArray(), VEHICLE_EFFECT_ATTACHMENTS.JET!.sensor!.position)
    let vertices = 0, meshes = 0
    root.traverse(node => { if (node instanceof T.Mesh) { vertices += node.geometry.getAttribute('position').count; meshes++; assert.equal(node.userData.vehicleEffect, true); assert.equal(node.castShadow, false) } })
    assert.equal(meshes, 4)
    assert.ok(vertices < 250, `${vertices} effect vertices`)
    attachVehicleEffects(root, 'JET', side)
    assert.equal(root.children.length, 2, 'effect attachments are idempotent')
  }
})

test('Fury exhaust points aft and follows engine, clip and destroyed state', () => {
  const root = createBlenderVehicle('JET', 'BLU')
  const plume = root.getObjectByName('vehicle-fx-exhaust')!
  const core = root.getObjectByName('vehicle-fx-exhaust-core') as T.Mesh
  assert.equal(plume.visible, false)
  assert.ok(plume.position.y < -5.6)
  const positions = core.geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) assert.ok(positions.getY(i) <= 0, 'exhaust extends behind the nozzle')
  poseVehicleClip(root, 'fly', 1.125)
  assert.equal(plume.visible, true)
  const first = [core.scale.y, (core.material as T.Material).opacity]
  poseVehicleClip(root, 'fly', 3)
  poseVehicleClip(root, 'fly', 1.125)
  assert.deepEqual([core.scale.y, (core.material as T.Material).opacity], first)
  animateVehicleGameplay(root, 2, { heading: 0, active: false })
  assert.equal(plume.visible, false)
  animateVehicleGameplay(root, 2, { heading: 0, active: true })
  assert.equal(plume.visible, true)
  root.userData.destroyed = true
  updateVehicleEffects(root, 'fly', 2, true)
  assert.equal(plume.visible, false)
  assert.equal(root.getObjectByName('vehicle-fx-sensor')!.visible, false)
  root.userData.destroyed = false
  updateVehicleEffects(root, 'fly', 2, true)
  assert.equal(plume.visible, true)
  assert.equal(root.getObjectByName('vehicle-fx-sensor')!.visible, true)
})

test('Babylon renders small additive exhaust without depth writes or texture loads', () => {
  const engine = new NullEngine()
  const runtime = new (BabylonRuntime as unknown as new (canvas: HTMLCanvasElement, engine: NullEngine) => BabylonRuntime)({ dataset: {} } as HTMLCanvasElement, engine)
  try {
    const scene = new T.Scene(), root = new T.Group()
    attachVehicleEffects(root, 'JET', 'RED'); updateVehicleEffects(root, 'fly', 1); scene.add(root)
    runtime.sync(scene)
    const plume = runtime.scene.getMeshByName('vehicle-fx-exhaust-core')!
    const material = plume.material as PBRMaterial
    assert.equal(plume.isEnabled(), true)
    assert.equal(material.unlit, true)
    assert.equal(material.disableDepthWrite, true)
    assert.equal(material.albedoTexture, null)
    assert.ok(material.alpha > 0 && material.alpha < 1)
    root.userData.destroyed = true; updateVehicleEffects(root, 'fly', 1); runtime.sync(scene)
    assert.equal(plume.isEnabled(), false)
  } finally { runtime.dispose() }
})
