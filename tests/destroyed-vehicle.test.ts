import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import { createDestroyedMaterial, DestroyedVehiclePlugin, hasDestroyedAppearance } from '../lib/game/babylon-destroyed'
import * as D from '../lib/game/scene-data'

const makeRuntime = () => new (BabylonRuntime as unknown as new (canvas: HTMLCanvasElement, engine: NullEngine) => BabylonRuntime)({ dataset: {} } as HTMLCanvasElement, new NullEngine())

test('damage is local to one vehicle and can be removed without changing shared source materials', () => {
  const runtime = makeRuntime()
  try {
    const scene = new D.Scene(), live = new D.Group(), wreck = new D.Group()
    const paint = new D.MeshStandardMaterial({ color: '#739064', emissive: '#60baff', emissiveIntensity: .3 })
    const geometry = new D.BoxGeometry()
    const a = new D.Mesh(geometry, paint), b = new D.Mesh(geometry, paint)
    a.name = 'live'; b.name = 'wreck'; live.add(a); wreck.add(b); scene.add(live, wreck)
    wreck.userData.destroyed = true
    runtime.sync(scene)
    const nativeA = runtime.scene.meshes.find(m => m.name === 'live')!, nativeB = runtime.scene.meshes.find(m => m.name === 'wreck')!
    const original = nativeA.material as PBRMaterial, damaged = nativeB.material as PBRMaterial
    assert.notEqual(original, damaged)
    assert.equal(paint.color.getHexString(), '739064')
    assert.equal(damaged.roughness, .98)
    assert.equal(damaged.emissiveColor.r + damaged.emissiveColor.g + damaged.emissiveColor.b, 0)
    assert.ok(original.emissiveColor.r + original.emissiveColor.g + original.emissiveColor.b > 0)
    const count = runtime.scene.materials.length
    wreck.userData.destroyed = false; runtime.sync(scene)
    assert.equal(nativeB.material, original)
    wreck.userData.destroyed = true; runtime.sync(scene)
    assert.equal(nativeB.material, damaged)
    assert.equal(runtime.scene.materials.length, count, 'repeat toggles reuse the cached variant')
    assert.equal(runtime.scene.textures.filter(t => t.name.includes('vehicle_destroyed_mask')).length, 1)
  } finally { runtime.dispose() }
})

test('a damage variant preserves the original albedo texture without changing it', () => {
  const runtime = makeRuntime()
  try {
    const base = new PBRMaterial('paint', runtime.scene)
    base.albedoTexture = new Texture(null, runtime.scene)
    base.roughness = .4
    const damaged = createDestroyedMaterial(base)
    assert.equal(damaged.albedoTexture, base.albedoTexture)
    assert.equal(base.roughness, .4)
    assert.notEqual(damaged, base)
  } finally { runtime.dispose() }
})

test('attached stores inherit damage while vehicle glow effects stay outside the damage material', () => {
  const root = new D.Group(), store = new D.Group(), effect = new D.Mesh(new D.BoxGeometry(), new D.MeshBasicMaterial())
  root.userData.destroyed = true; effect.userData.vehicleEffect = true; root.add(store, effect)
  assert.equal(hasDestroyedAppearance(store), true)
  assert.equal(hasDestroyedAppearance(effect), false)
  root.userData.destroyed = false
  assert.equal(hasDestroyedAppearance(store), false)
})

test('GLSL and WGSL damage textures are deterministic and use all three local projections without UVs', () => {
  const runtime = makeRuntime()
  try {
    const plugin = new DestroyedVehiclePlugin(new PBRMaterial('test', runtime.scene))
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      const vertex = plugin.getCustomCode('vertex', language)!, fragment = plugin.getCustomCode('fragment', language)!
      assert.deepEqual(fragment, plugin.getCustomCode('fragment', language))
      assert.match(vertex.CUSTOM_VERTEX_MAIN_END, /positionUpdated/)
      for (const plane of ['yz', 'xz', 'xy']) assert.ok(fragment.CUSTOM_FRAGMENT_BEFORE_LIGHTS.includes(`gridP.${plane}`))
      assert.doesNotMatch(Object.values(fragment).join(''), /\btime\b|\buv\b|vPositionW/)
      assert.match(fragment.CUSTOM_FRAGMENT_BEFORE_LIGHTS, /surfaceAlbedo/)
    }
  } finally { runtime.dispose() }
})

test('the shared damage mask is a single 1024 square PNG', () => {
  const png = readFileSync(new URL('../public/textures/vehicle_destroyed_mask.png', import.meta.url))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 1024)
  assert.equal(png.readUInt32BE(20), 1024)
})
