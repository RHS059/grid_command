import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import { hasUnitSurface, UNIT_CONTOUR, UnitContourPlugin } from '../lib/game/babylon-unit-contour'
import { createAircraft, disposeModel } from '../lib/game/aircraft-models'
import { createSupportModel } from '../lib/game/support-models'
import { createBase } from '../lib/game/base-models'
import { cloneSoldierWeapon, createSoldierTemplate } from '../lib/game/soldier-asset'
import * as D from '../lib/game/scene-data'

const makeRuntime = () => new (BabylonRuntime as unknown as new (canvas: HTMLCanvasElement, engine: NullEngine) => BabylonRuntime)({ dataset: {} } as HTMLCanvasElement, new NullEngine())

test('unit contour stays per draw with shared materials, textures, damage, and thin instances', () => {
  const runtime = makeRuntime()
  try {
    const scene = new D.Scene(), unit = new D.Group(), building = new D.Group()
    unit.userData.unitSurface = true
    const paint = new D.MeshStandardMaterial({ color: '#506553', map: '/textures/unit-contour-test.png' })
    const unitMesh = new D.Mesh(new D.BoxGeometry(), paint), wall = new D.Mesh(new D.BoxGeometry(), paint)
    unitMesh.name = 'unit'; wall.name = 'wall'; unit.add(unitMesh); building.add(wall); scene.add(unit, building)
    const instances = new D.InstancedMesh(new D.BoxGeometry(), paint, 2)
    instances.name = 'unit-batch'; instances.userData.unitSurface = true; instances.count = 2; scene.add(instances)
    runtime.sync(scene)
    const nativeUnit = runtime.scene.getMeshByName('unit')!, nativeWall = runtime.scene.getMeshByName('wall')!, nativeBatch = runtime.scene.getMeshByName('unit-batch')!
    const material = nativeUnit.material as PBRMaterial
    assert.equal(nativeWall.material, material)
    assert.equal(nativeBatch.material, material, 'one material and shader serve the entire batch')
    assert.equal(nativeBatch.hasThinInstances, true)
    assert.equal(nativeUnit.metadata.gridUnitContour, true)
    assert.equal(nativeWall.metadata.gridUnitContour, false)
    assert.equal(material.transparencyMode, PBRMaterial.PBRMATERIAL_OPAQUE)
    const plugin = material.pluginManager!.getPlugin('GridUnitContour') as UnitContourPlugin
    assert.ok(plugin)
    const values: number[] = []
    const buffer = { updateFloat(_name: string, value: number) { values.push(value) } } as UniformBuffer
    for (const mesh of [nativeUnit, nativeWall, nativeBatch]) plugin.hardBindForSubMesh(buffer, runtime.scene, runtime.engine, { getRenderingMesh: () => mesh } as SubMesh)
    assert.deepEqual(values, [UNIT_CONTOUR.strength, 0, UNIT_CONTOUR.strength])
    assert.ok(material.albedoTexture)
    // Damage clones must preserve the maps and regain the nonserialized plugin.
    unit.userData.destroyed = true
    runtime.sync(scene)
    const damaged = nativeUnit.material as PBRMaterial
    assert.notEqual(damaged, material)
    assert.ok(damaged.pluginManager?.getPlugin('GridUnitContour'))
    assert.ok(damaged.pluginManager?.getPlugin('GridDestroyedVehicle'))
    assert.equal(damaged.albedoTexture, material.albedoTexture)
    assert.equal(nativeWall.metadata.gridUnitContour, false)
    const count = runtime.scene.materials.length
    unit.userData.destroyed = false; runtime.sync(scene)
    unit.userData.destroyed = true; runtime.sync(scene)
    assert.equal(runtime.scene.materials.length, count, 'changing damage reuses the variant')
  } finally { runtime.dispose() }
})

test('unit effects, unlit materials, transparency, and interior windows do not receive contour', () => {
  const runtime = makeRuntime()
  try {
    const scene = new D.Scene(), unit = new D.Group()
    unit.userData.unitSurface = true; scene.add(unit)
    const materials = [new D.MeshBasicMaterial(), new D.MeshStandardMaterial({ transparent: true, opacity: .5 }), new D.MeshStandardMaterial({ toneMapped: false, emissiveIntensity: 4 })]
    for (const [index, material] of materials.entries()) { const mesh = new D.Mesh(new D.BoxGeometry(), material); mesh.name = `effect-${index}`; unit.add(mesh) }
    const glow = new D.Group(), ordinary = new D.Mesh(new D.BoxGeometry(), new D.MeshStandardMaterial())
    glow.userData.vehicleEffect = true; ordinary.name = 'nested-glow'; glow.add(ordinary); unit.add(glow)
    runtime.sync(scene)
    for (const mesh of runtime.scene.meshes) {
      assert.equal(mesh.metadata.gridUnitContour, false)
      assert.ok(!mesh.material?.pluginManager?.getPlugin('GridUnitContour'))
    }
    assert.equal(hasUnitSurface(ordinary), false)
  } finally { runtime.dispose() }
})

test('vehicle and native soldier factories opt in while base structures stay outside the effect', () => {
  for (const model of [createAircraft('JET', 'BLU'), createSupportModel('AIRCRAFT_CARRIER', 'RED'), createSupportModel('TRUCK', 'BLU')]) {
    try { assert.equal(hasUnitSurface(model), true) } finally { disposeModel(model) }
  }
  const base = createBase('MOB', 'BLU')
  try { base.traverse(node => assert.equal(hasUnitSurface(node), false)) } finally { disposeModel(base) }
  const native = new D.Group(), weapon = new D.Group(); weapon.name = 'Weapon_RIFLE'; native.add(weapon)
  assert.equal(hasUnitSurface(createSoldierTemplate(native, 'BLU')), true)
  assert.equal(hasUnitSurface(cloneSoldierWeapon(native, 'RIFLE')!), true)
})

test('GLSL and WGSL contour shaders use restrained geometric Fresnel without texture or render-pass work', () => {
  const runtime = makeRuntime()
  try {
    const plugin = new UnitContourPlugin(new PBRMaterial('unit', runtime.scene))
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      assert.equal(plugin.isCompatible(language), true)
      assert.equal(plugin.getCustomCode('vertex', language), null)
      const shader = plugin.getCustomCode('fragment', language)!.CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION
      assert.match(shader, /abs\(dot\(geometricNormalW,viewDirectionW\)\)/)
      assert.match(shader, /pow\(1\.-gridContourFacing,4\.0\)/)
      assert.match(shader, /finalAmbient\+=/)
      assert.match(shader, /gridContourEmission/)
      assert.match(shader, /!defined\(SM_FLOAT\)/)
      assert.doesNotMatch(shader, /texture|sampler|discard|dFdx|dpdx|alpha\s*=|finalEmissive\s*[+*=]/)
      assert.equal(shader.includes('uniforms.gridUnitContour'), language === ShaderLanguage.WGSL)
    }
    assert.ok(UNIT_CONTOUR.strength > 0 && UNIT_CONTOUR.strength <= .03)
    // Fourth-power Fresnel is zero face on, narrow at 60 degrees, full at grazing.
    assert.equal((1 - 1) ** UNIT_CONTOUR.power, 0)
    assert.equal((1 - .5) ** UNIT_CONTOUR.power * UNIT_CONTOUR.strength, .0015625)
  } finally { runtime.dispose() }
})
