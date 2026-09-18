import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import { applyVehiclePbrMaps, createDestroyedMaterial, DEFAULT_VEHICLE_DAMAGE, DestroyedVehiclePlugin, hasDestroyedAppearance, normalizeVehicleDamage, setVehicleDamage } from '../lib/game/babylon-destroyed'
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
    assert.equal(damaged.roughness, original.roughness)
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
      for (const plane of ['yz', 'xz', 'xy']) assert.ok(fragment.CUSTOM_FRAGMENT_UPDATE_ALPHA.includes(`gridP.${plane}`))
      assert.doesNotMatch(Object.values(fragment).join(''), /\btime\b|\buv\b/)
      assert.match(fragment.CUSTOM_FRAGMENT_UPDATE_ALPHA, /gridWorldEye/, 'world position is used only to reconstruct the local parallax view ray')
      assert.match(fragment.CUSTOM_FRAGMENT_BEFORE_LIGHTS, /surfaceAlbedo/)
      assert.match(fragment.CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION, /finalEmissive\s*\+=\s*gridEmberColor/)
    }
  } finally { runtime.dispose() }
})

test('PBR maps use linear normal and ORM data and damage variants retain the shared texture storage', () => {
  const runtime = makeRuntime()
  try {
    const source = new PBRMaterial('shell', runtime.scene)
    const normal = new Texture(null, runtime.scene), orm = new Texture(null, runtime.scene)
    source.metallic = 0
    applyVehiclePbrMaps(source, { normal, orm })
    assert.equal(source.bumpTexture, normal)
    assert.equal(source.metallicTexture, orm)
    assert.equal(normal.gammaSpace, false)
    assert.equal(orm.gammaSpace, false)
    assert.equal(source.invertNormalMapX, false)
    assert.equal(source.invertNormalMapY, true)
    assert.equal(source.metallic, 1, 'a zero scalar must not erase metalness from the map')
    assert.equal(source.roughness, 1)
    assert.equal(source.useRoughnessFromMetallicTextureAlpha, false)
    assert.equal(source.useRoughnessFromMetallicTextureGreen, true)
    assert.equal(source.useMetallnessFromMetallicTextureBlue, true)
    assert.equal(source.useAmbientOcclusionFromMetallicTextureRed, true)
    const variant = createDestroyedMaterial(source)
    assert.equal(variant.bumpTexture, normal)
    assert.equal(variant.metallicTexture, orm)
    assert.equal(variant.shadowDepthWrapper?.baseMaterial, variant, 'shadow pass must use the same clipping material')
    assert.equal(runtime.scene.textures.filter(texture => texture === normal || texture === orm).length, 2)
  } finally { runtime.dispose() }
})

test('per-draw damage binding isolates adjacent vehicles that share one material', () => {
  const runtime = makeRuntime()
  try {
    const material = createDestroyedMaterial(new PBRMaterial('shared-shell', runtime.scene))
    const plugin = material.pluginManager!.getPlugin('GridDestroyedVehicle') as DestroyedVehiclePlugin
    assert.equal(plugin.registerForExtraEvents, true)
    const left = new Mesh('left', runtime.scene), right = new Mesh('right', runtime.scene)
    left.material = right.material = material
    left.metadata = { gridVehicleDamage: { damage: .2, destruction: .15, heat: .9, seed: 42 } }
    right.metadata = { gridVehicleDamage: { damage: .8, destruction: .8, heat: 0, seed: 7, holeDepth: 0 } }
    const updates = new Map<string, number[]>()
    const buffer = { updateFloat4(name: string, ...values: number[]) { updates.set(name, values) } } as unknown as UniformBuffer
    const bind = (mesh: Mesh) => plugin.hardBindForSubMesh(buffer, runtime.scene, runtime.engine, { getRenderingMesh: () => mesh } as SubMesh)
    bind(left)
    assert.deepEqual(updates.get('gridDamage'), [.15, .9, 42, DEFAULT_VEHICLE_DAMAGE.holeScale])
    bind(right)
    assert.deepEqual(updates.get('gridDamage'), [.8, 0, 7, DEFAULT_VEHICLE_DAMAGE.holeScale])
    assert.deepEqual(updates.get('gridDamageStyle')!.slice(0, 2), [0, .8])
    bind(left)
    assert.equal(updates.get('gridDamage')![0], .15)
    setVehicleDamage(material, { damage: .4, destruction: .4, heat: .25 })
    right.metadata = null
    bind(right)
    assert.deepEqual(updates.get('gridDamage'), [.4, .25, 0, DEFAULT_VEHICLE_DAMAGE.holeScale])
    assert.equal(updates.get('gridDamageStyle')![1], .4)
  } finally { runtime.dispose() }
})

test('destruction settings clamp invalid inputs while retaining the exact intact and invisible endpoints', () => {
  assert.equal(normalizeVehicleDamage({ destruction: 0 }).destruction, 0)
  assert.equal(normalizeVehicleDamage({ damage: -1 }).damage, 0)
  assert.equal(normalizeVehicleDamage({ damage: 9 }).damage, 1)
  assert.equal(normalizeVehicleDamage({ destruction: 1 }).destruction, 1)
  assert.equal(normalizeVehicleDamage({ destruction: -1 }).destruction, 0)
  assert.equal(normalizeVehicleDamage({ destruction: 9 }).destruction, 1)
  assert.deepEqual(normalizeVehicleDamage({ destruction: NaN, heat: Infinity, holeScale: NaN, holeDepth: NaN }), DEFAULT_VEHICLE_DAMAGE)
  assert.equal(normalizeVehicleDamage({ heat: -2 }).heat, 0)
  assert.equal(normalizeVehicleDamage({ holeDepth: -1 }).holeDepth, 0)
  assert.ok(normalizeVehicleDamage({ holeScale: 0 }).holeScale > 0)
})

test('the shared damage mask is a single 1024 square PNG', () => {
  const png = readFileSync(new URL('../public/textures/vehicle_destroyed_mask.png', import.meta.url))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 1024)
  assert.equal(png.readUInt32BE(20), 1024)
})
