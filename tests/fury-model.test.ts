import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import { createBlenderVehicle, blenderVehicleGeometry } from '../lib/game/blender-vehicles'
import { poseVehicleClip, vehicleRig } from '../lib/game/vehicle-animation'
import * as D from '../lib/game/scene-data'

test('Fury uses one 1024 atlas and keeps indexed vertices in budget', () => {
  const model = createBlenderVehicle('JET', 'BLU')
  let count = 0
  const maps = new Set<string>()
  model.traverse(object => {
    if (!(object instanceof D.Mesh) || object.name === 'faction-band') return
    const geometry = object.geometry, positions = geometry.getAttribute('position')
    count += positions.count
    assert.ok(geometry.index, object.name)
    assert.equal(geometry.getAttribute('uv').count, positions.count)
    assert.equal(geometry.getAttribute('normal').count, positions.count)
    assert.ok(Array.from(geometry.index!.array).every(i => i >= 0 && i < positions.count))
    const material = object.material as D.Material
    assert.ok(material.map); maps.add(material.map!)
  })
  assert.ok(count >= 7500 && count <= 10000, `${count} vertices`)
  assert.deepEqual([...maps], ['/models/fighter_albedo.png'])
  const png = readFileSync(new URL('../public/models/fighter_albedo.png', import.meta.url))
  assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024)
  const merged = blenderVehicleGeometry('JET', 'BLU')
  assert.equal(merged.getAttribute('position').count, count)
  assert.ok(merged.index)
  poseVehicleClip(model, 'fly', 1)
  assert.equal(model.getObjectByName('gear_N')!.rotation.x, -Math.PI / 2)
  assert.equal(model.getObjectByName('gear_L')!.rotation.y, -Math.PI / 2)
  assert.equal(model.getObjectByName('gear_R')!.rotation.y, Math.PI / 2)
  const rig = vehicleRig('JET')!
  for (const name of ['gear_N', 'gear_L', 'gear_R']) {
    const node = rig.nodes[name]
    assert.ok(node.retractLift! > 0)
    assert.equal(model.getObjectByName(name)!.position.z, node.pivot[2] + node.retractLift!)
  }
  poseVehicleClip(model, 'gear_down', 100)
  for (const name of ['gear_N', 'gear_L', 'gear_R']) {
    assert.equal(model.getObjectByName(name)!.position.z, rig.nodes[name].pivot[2])
  }
  model.traverse(object => assert.ok(object.position.toArray().every(Number.isFinite)))
})

test('Babylon shares the atlas between fighter instances', () => {
  const engine = new NullEngine()
  const runtime = new (BabylonRuntime as unknown as new (canvas: HTMLCanvasElement, engine: NullEngine) => BabylonRuntime)({dataset:{}} as HTMLCanvasElement, engine)
  try {
    const scene = new D.Scene()
    scene.add(createBlenderVehicle('JET', 'BLU'), createBlenderVehicle('JET', 'RED'))
    runtime.sync(scene)
    const materials = runtime.scene.materials.filter(m => m instanceof PBRMaterial && m.albedoTexture) as PBRMaterial[]
    assert.equal(materials.length, 2)
    assert.equal(materials[0].albedoTexture, materials[1].albedoTexture)
    assert.equal(materials[0].albedoTexture!.gammaSpace, true)
    assert.ok(runtime.scene.meshes.filter(m => m.name !== 'faction-band').every(m => m.isVerticesDataPresent('uv')))
  } finally { runtime.dispose() }
})
