import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh'
import { BabylonRuntime, prepareFirefoxWGSL, sanitizeFirefoxWGSL } from '../lib/game/babylon-runtime'
import { WebGPUShaderProcessorWGSL } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL'
import { LodDitherPlugin } from '../lib/game/babylon-lod-dither'
import { BAYER_4, bayerThreshold, LodTransition, LOD_TRANSITION_MS, lodDitherRange, lodPixelVisible } from '../lib/game/lod-transition'
import { createBlenderVehicle } from '../lib/game/blender-vehicles'
import { poseVehicleClip } from '../lib/game/vehicle-animation'
import { disposeModel } from '../lib/game/aircraft-models'
import * as D from '../lib/game/scene-data'
import { GeographicTiles, geographicZoomLevel, GEOGRAPHIC_TILE_RETRY_MS, GEOGRAPHIC_TILE_RETRY_MAX_MS } from '../lib/game/geo-tiles'
import { tileKey, type TileAddress } from '../lib/game/geography'
import { ORIGIN } from '../lib/game/theater'

const runtime = () => new (BabylonRuntime as unknown as new (canvas: HTMLCanvasElement, engine: NullEngine) => BabylonRuntime)({ dataset: {} } as HTMLCanvasElement, new NullEngine())

test('Bayer ranges divide each screen pixel exactly once at all steps and endpoints', () => {
  assert.equal(new Set(BAYER_4).size, 16)
  for (let step = 0; step <= 256; step++) {
    const detail = step / 256, high = lodDitherRange(detail, true), low = lodDitherRange(detail, false)
    let highCount = 0
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const a = lodPixelVisible(high, x, y), b = lodPixelVisible(low, x, y)
      assert.notEqual(a, b, `coverage at ${detail}, ${x}, ${y}`)
      assert.equal(bayerThreshold(x, y), bayerThreshold(x + 8, y + 12))
      if (a) highCount++
    }
    assert.equal(highCount, Math.max(0, Math.ceil(detail * 16 - .5)))
  }
})

test('LOD transitions have hysteresis, continuous reversal, and a fixed time limit', () => {
  const state = new LodTransition()
  assert.equal(state.update(100, 96, 8, 0), 1)
  assert.equal(state.update(90, 96, 8, 50), 1)
  assert.equal(state.target, 1)
  assert.equal(state.update(87, 96, 8, 100), 1)
  assert.equal(state.target, 0)
  assert.equal(state.update(96, 96, 8, 100 + LOD_TRANSITION_MS / 2), .5)
  assert.equal(state.update(105, 96, 8, 100 + LOD_TRANSITION_MS / 2), .5)
  assert.equal(state.target, 1)
  assert.equal(state.update(96, 96, 8, 100 + LOD_TRANSITION_MS * 1.5), 1)
  state.update(80, 96, 8, 1000)
  assert.equal(state.update(80, 96, 8, 1000 + LOD_TRANSITION_MS), 0)
})

test('building instances keep both levels during a fade and prune only at endpoints', () => {
  const renderer = runtime(), scene = new D.Scene(), geometry = new D.BoxGeometry()
  geometry.setAttribute('buildingOrigin', new D.InstancedBufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 2))
  geometry.setAttribute('buildingLod', new D.InstancedBufferAttribute(new Float32Array([-1, 1, 0]), 1))
  const material = new D.MeshStandardMaterial({ uniforms: { buildingFocus: { value: new D.Vector2() }, buildingDetailFade: { value: 0 } } })
  const source = new D.InstancedMesh(geometry, material, 3)
  source.name = 'lod-building'; scene.add(source)
  for (let i = 0; i < 3; i++) source.setMatrixAt(i, new D.Matrix4())
  try {
    renderer.sync(scene)
    const mesh = renderer.scene.getMeshByName(source.name) as Mesh
    assert.equal(mesh.thinInstanceCount, 2)
    material.uniforms.buildingDetailFade.value = .25; renderer.sync(scene)
    assert.equal(mesh.thinInstanceCount, 3)
    assert.equal(mesh.metadata.gridLodDetail, .25)
    assert.ok(mesh.isVerticesDataPresent('buildingLod'))
    let uploads = 0
    const update = mesh.thinInstanceBufferUpdated.bind(mesh)
    mesh.thinInstanceBufferUpdated = (...args) => { uploads++; return update(...args) }
    material.uniforms.buildingDetailFade.value = .75; renderer.sync(scene)
    assert.equal(mesh.metadata.gridLodDetail, .75)
    assert.equal(uploads, 0, 'coverage is a uniform; instance buffers remain stable')
    material.uniforms.buildingDetailFade.value = 1; renderer.sync(scene)
    assert.equal(mesh.thinInstanceCount, 2)
    const pbr = mesh.material as PBRMaterial
    assert.equal(pbr.transparencyMode, PBRMaterial.PBRMATERIAL_OPAQUE)
    assert.equal(pbr.disableDepthWrite, false)
    assert.equal(pbr.shadowDepthWrapper?.baseMaterial, pbr)
  } finally { renderer.dispose(); disposeModel(scene) }
})

for (const role of ['APC', 'CANNON_APC'] as const) test(`${role} uses both authored levels with the same rig pose and complementary coverage`, t => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const renderer = runtime(), scene = new D.Scene(), root = createBlenderVehicle(role, 'BLU')
  scene.add(root)
  const camera = (distance: number) => renderer.setCamera({ x: 0, y: -distance, z: 2 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, .8, .1, 2000)
  try {
    camera(8); renderer.sync(scene)
    const high = renderer.scene.getMeshByName('hull_mesh') as Mesh
    assert.equal(high.isEnabled(), true)
    assert.equal(renderer.scene.getMeshByName('hull_mesh-lod1'), null)
    camera(1000); renderer.sync(scene)
    now += LOD_TRANSITION_MS / 2
    poseVehicleClip(root, 'aim', 1); renderer.sync(scene)
    const low = renderer.scene.getMeshByName('hull_mesh-lod1') as Mesh
    assert.ok(low)
    assert.equal(high.isEnabled(), true); assert.equal(low.isEnabled(), true)
    assert.deepEqual(high.metadata.gridLodRange, [0, .5])
    assert.deepEqual(low.metadata.gridLodRange, [.5, 1])
    assert.ok(low.getTotalVertices() < high.getTotalVertices())
    const turret = renderer.scene.getMeshByName('turret_mesh') as Mesh, lowTurret = renderer.scene.getMeshByName('turret_mesh-lod1') as Mesh
    assert.deepEqual(turret.getWorldMatrix().asArray(), lowTurret.getWorldMatrix().asArray())
    root.userData.destroyed = true; root.userData.vehicleDamage = { damage: .5, destruction: .3 }
    renderer.sync(scene)
    const paint = high.material as PBRMaterial
    assert.equal(low.material, paint)
    assert.ok(paint.pluginManager?.getPlugin('GridDestroyedVehicle'))
    assert.ok(paint.pluginManager?.getPlugin('GridLodDither'))
    const interior = renderer.scene.getMeshByName('vehicle-parallax-interior')!.material as PBRMaterial
    const interiorPlugin = interior.pluginManager?.getPlugin('GridInteriorRooms')
    assert.ok(interiorPlugin)
    assert.equal(interiorPlugin.doNotSerialize, true)
    assert.ok(interiorPlugin.isCompatible(ShaderLanguage.WGSL))
    assert.ok(interior.pluginManager?.getPlugin('GridDestroyedVehicle'))
    assert.equal(paint.shadowDepthWrapper?.baseMaterial, paint)
    assert.equal(paint.disableDepthWrite, false)
    now += LOD_TRANSITION_MS / 2; renderer.sync(scene)
    assert.equal(high.isEnabled(), false); assert.equal(low.isEnabled(), true)
    const count = renderer.scene.meshes.length
    camera(8); renderer.sync(scene); now += LOD_TRANSITION_MS; renderer.sync(scene)
    assert.equal(high.isEnabled(), true); assert.equal(low.isEnabled(), false)
    assert.equal(renderer.scene.meshes.length, count, 'later transitions reuse the low draw meshes')
    scene.remove(root); renderer.sync(scene)
    assert.equal(renderer.scene.getMeshByName('hull_mesh-lod1'), null)
  } finally { renderer.dispose(); disposeModel(root) }
})

test('dither shader and per-draw binding preserve separate coverage on shared materials', () => {
  const renderer = runtime()
  try {
    const plugin = new LodDitherPlugin(new PBRMaterial('shared-lod', renderer.scene))
    const first = new Mesh('first', renderer.scene), second = new Mesh('second', renderer.scene)
    first.metadata = { gridLodRange: [0, .25], gridLodDetail: .25 }
    second.metadata = { gridLodRange: [.25, 1], gridLodDetail: .75 }
    let values: number[] = []
    const buffer = { updateFloat4(_name: string, ...next: number[]) { values = next } } as unknown as UniformBuffer
    const bind = (mesh: Mesh) => plugin.hardBindForSubMesh(buffer, renderer.scene, renderer.engine, { getRenderingMesh: () => mesh } as SubMesh)
    bind(first); assert.deepEqual(values, [0, .25, .25, 0])
    bind(second); assert.deepEqual(values, [.25, 1, .75, 0])
    second.metadata = null; bind(second); assert.deepEqual(values, [0, 1, 1, 0])
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      const fragment = plugin.getCustomCode('fragment', language)!
      assert.match(fragment.CUSTOM_FRAGMENT_MAIN_BEGIN, /gridLodThreshold<gridLodRange.x\|\|gridLodThreshold>=gridLodRange.y/)
      assert.match(fragment.CUSTOM_FRAGMENT_MAIN_BEGIN, language === ShaderLanguage.GLSL ? /gl_FragCoord.xy/ : /fragmentInputs.position.xy/)
      assert.doesNotMatch(Object.values(fragment).join(''), /\btime\b|alpha\s*=|random/)
    }
  } finally { renderer.dispose() }
})

test('WebGPU removes unused facing inputs and retains inputs used by two-sided lighting', () => {
  const inputs = 'struct FragmentInputs { @builtin(position) position: vec4<f32>, @builtin(front_facing) frontFacing: bool, };'
  assert.doesNotMatch(sanitizeFirefoxWGSL(inputs), /front_facing/)
  assert.match(sanitizeFirefoxWGSL(inputs + ' fn shade(){ let facing=fragmentInputs.frontFacing; }'), /front_facing/)
  const original = WebGPUShaderProcessorWGSL.prototype.finalizeShaders
  prepareFirefoxWGSL()
  assert.notEqual(WebGPUShaderProcessorWGSL.prototype.finalizeShaders, original, 'the patch also runs without a Firefox navigator')
  const installed = WebGPUShaderProcessorWGSL.prototype.finalizeShaders
  prepareFirefoxWGSL(); assert.equal(WebGPUShaderProcessorWGSL.prototype.finalizeShaders, installed)
})

test('active geographic tiles wait for all replacements and crossfade buildings as one pair', async t => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const renderer = runtime(), tiles = new GeographicTiles(renderer.scene, () => {})
  type LoadedTile = { address: TileAddress; mesh: Mesh; features: Mesh[] }
  const loaded: LoadedTile[] = []
  let release: (() => void) | undefined
  const loader = tiles as unknown as { load(address: TileAddress): Promise<LoadedTile> }
  t.mock.method(loader, 'load', async (address: TileAddress) => {
    const tile = { address, mesh: new Mesh(`terrain-${tileKey(address)}`, renderer.scene), features: [new Mesh(`buildings-${tileKey(address)}`, renderer.scene)] }
    loaded.push(tile)
    if (address.z === 11 && !release) await new Promise<void>(resolve => { release = resolve })
    return tile
  })
  const flush = () => new Promise<void>(resolve => setImmediate(resolve))
  try {
    tiles.update([0, 0], 11.5, false, false); await flush()
    const old = loaded.filter(tile => tile.address.z === 10)
    assert.equal(old.length, 49)
    tiles.update([0, 0], 12.5, false, false); await flush()
    assert.equal(tiles.transitioning, false)
    assert.ok(old.every(tile => tile.features[0].isEnabled()))
    assert.ok(loaded.filter(tile => tile.address.z === 11 && tile !== loaded[49]).every(tile => !tile.features[0].isEnabled()))
    release!(); await flush()
    assert.equal(tiles.transitioning, true)
    const incoming = loaded.filter(tile => tile.address.z === 11)
    assert.equal(incoming.length, 49)
    now = LOD_TRANSITION_MS / 2; tiles.update([0, 0], 13.5, false, false)
    assert.ok(loaded.every(tile => tile.address.z !== 12), 'a rapid zoom change cannot add a third level')
    for (const tile of old) for (const mesh of [tile.mesh, ...tile.features]) assert.deepEqual(mesh.metadata.gridLodRange, [.5, 1])
    for (const tile of incoming) for (const mesh of [tile.mesh, ...tile.features]) assert.deepEqual(mesh.metadata.gridLodRange, [0, .5])
    now = LOD_TRANSITION_MS; tiles.update([0, 0], 12.5, false, false)
    assert.equal(tiles.transitioning, false)
    assert.ok(old.every(tile => tile.mesh.isDisposed()))
    assert.ok(incoming.every(tile => tile.features[0].isEnabled()))
    assert.equal(renderer.scene.meshes.length, 98)
    assert.equal(geographicZoomLevel(12.02, 10), 10)
    assert.equal(geographicZoomLevel(12.09, 10), 11)
    assert.equal(geographicZoomLevel(11.98, 11), 11)
    assert.equal(geographicZoomLevel(11.91, 11), 10)
  } finally { tiles.dispose(); renderer.dispose() }
})

test('failed edge tiles retry with an unchanged camera and DEM retirement refreshes the elevation range', async t => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  t.mock.method(console, 'warn', () => {})
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const renderer = runtime(), bounds = { minX: .1, maxX: .9, minY: .1, maxY: .9 }
  let cachedHigh: number | undefined, revisions = 0
  const tiles = new GeographicTiles(renderer.scene, event => {
    if (event.elevation) { revisions++; cachedHigh = tiles.elevationRange(bounds)?.high }
  })
  type LoadedTile = { address: TileAddress; mesh: Mesh; features: Mesh[]; dem: ImageData }
  const loaded: LoadedTile[] = [], attempts = new Map<string, number>()
  let failedKey = ''
  const loader = tiles as unknown as { load(address: TileAddress): Promise<LoadedTile> }
  t.mock.method(loader, 'load', async (address: TileAddress) => {
    const key = tileKey(address), attempt = (attempts.get(key) ?? 0) + 1
    attempts.set(key, attempt)
    if (address.z === 11) {
      // The last tile is on the edge of the replacement grid.
      if (!failedKey && loaded.filter(tile => tile.address.z === 11).length === 48) failedKey = key
      if (key === failedKey && attempt < 3) throw new Error('Temporary edge tile failure')
    }
    const mesh = new Mesh(`terrain-${key}`, renderer.scene), height = address.z === 10 ? 10 : 2
    mesh.setVerticesData('position', [0, 1, height, 1, 1, height, 0, 0, height, 1, 0, height])
    mesh.setIndices([0, 2, 1, 1, 2, 3])
    const tile = { address, mesh, features: [new Mesh(`buildings-${key}`, renderer.scene)], dem: {} as ImageData }
    loaded.push(tile)
    return tile
  })
  const flush = () => new Promise<void>(resolve => setImmediate(resolve))
  const tick = async (milliseconds: number) => { now += milliseconds; t.mock.timers.tick(milliseconds); await flush() }
  try {
    tiles.update(ORIGIN, 11.5, true, false); await flush()
    assert.equal(cachedHigh, 10)
    tiles.update(ORIGIN, 12.5, true, false); await flush()
    assert.ok(failedKey)
    assert.equal(attempts.get(failedKey), 1)
    assert.equal(tiles.transitioning, false)
    tiles.update(ORIGIN, 12.5, true, false); await flush()
    assert.equal(attempts.get(failedKey), 1, 'unchanged updates must respect the retry delay')
    await tick(GEOGRAPHIC_TILE_RETRY_MS - 1)
    assert.equal(attempts.get(failedKey), 1)
    await tick(1)
    assert.equal(attempts.get(failedKey), 2)
    assert.ok(loaded.filter(tile => tile.address.z === 10).every(tile => tile.features[0].isEnabled()))
    await tick(GEOGRAPHIC_TILE_RETRY_MS * 2)
    assert.equal(attempts.get(failedKey), 3, 'the timer retries without another camera update')
    assert.equal(tiles.transitioning, true)
    assert.equal(loaded.length, 98, 'successful replacement tiles are reused')
    assert.equal(cachedHigh, 10, 'the load event still sees the old DEM')
    const beforeRetirement = revisions
    now += LOD_TRANSITION_MS; tiles.update(ORIGIN, 12.5, true, false)
    assert.equal(tiles.transitioning, false)
    assert.equal(revisions, beforeRetirement + 1)
    assert.equal(cachedHigh, 2, 'the retirement event removes the old higher elevation')
  } finally { tiles.dispose(); renderer.dispose() }
})

test('tile retries cap their delay and stop when the zoom changes or the cache is disposed', async t => {
  let now = 0, attempts = 0
  t.mock.method(performance, 'now', () => now)
  t.mock.method(console, 'warn', () => {})
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const renderer = runtime(), tiles = new GeographicTiles(renderer.scene, () => {})
  const loader = tiles as unknown as { load(address: TileAddress): Promise<never> }
  t.mock.method(loader, 'load', async () => { attempts++; throw new Error('Tile service unavailable') })
  const flush = () => new Promise<void>(resolve => setImmediate(resolve))
  const tick = async (milliseconds: number) => { now += milliseconds; t.mock.timers.tick(milliseconds); await flush() }
  try {
    tiles.update([0, 0], 11.5, false, false); await flush()
    assert.equal(attempts, 49)
    for (const delay of [500, 1000, 2000, 4000, GEOGRAPHIC_TILE_RETRY_MAX_MS, GEOGRAPHIC_TILE_RETRY_MAX_MS]) {
      const before: number = attempts
      await tick(delay - 1); assert.equal(attempts, before)
      await tick(1); assert.equal(attempts, before + 49)
    }
    tiles.update([0, 0], 12.5, false, false); await flush()
    const afterZoom = attempts
    await tick(GEOGRAPHIC_TILE_RETRY_MS)
    assert.equal(attempts, afterZoom + 49, 'only the new zoom retries')
    tiles.dispose()
    const afterDisposal = attempts
    await tick(GEOGRAPHIC_TILE_RETRY_MAX_MS * 2)
    assert.equal(attempts, afterDisposal)
  } finally { tiles.dispose(); renderer.dispose() }
})
