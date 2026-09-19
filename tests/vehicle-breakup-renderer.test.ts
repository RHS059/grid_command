import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { BattlefieldVehicleBreakup } from '../lib/game/vehicle-breakup-renderer'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import { breakupWorldHalfExtents } from '../lib/game/vehicle-breakup'
import { createAircraft, disposeModel } from '../lib/game/aircraft-models'
import { createUnit, initialState, DEFAULT_GRAPHICS, type Casualty } from '../lib/game/types'
import * as T from '../lib/game/scene-data'

const ground = () => 0
const visible = () => true
const loss = (id: string, time: number): Casualty => ({ id, role: 'JET', side: 'BLU', x: 10, y: 0, heading: 0, altitude: 20, observed: ['BLU'], time })

test('rotating section collision bounds use the same Euler convention as the rendered model', () => {
  const rotation = new T.Vector3(.3, .5, .8), halfExtents = { x: 1, y: 2, z: 3 }
  const bounds = breakupWorldHalfExtents({ rotation, halfExtents }), quaternion = new T.Quaternion().setFromEuler(rotation)
  const actual = new T.Vector3()
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const point = new T.Vector3(x, y * 2, z * 3).applyQuaternion(quaternion)
    actual.max(new T.Vector3(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)))
  }
  for (const axis of ['x', 'y', 'z'] as const) assert.ok(Math.abs(bounds[axis] - actual[axis]) < .00001)
})

test('casualty handoff inherits flight motion and releases the ordinary static wreck fallback after expiry', () => {
  const scene = new T.Scene(), breakup = new BattlefieldVehicleBreakup(scene), source = createAircraft('JET', 'BLU')
  const state = initialState(), unit = createUnit('BLU', 'JET', 'aircraft', { x: 0, y: 0 })
  unit.altitude = 20; unit.engine = true; state.units = [unit]
  const aircraft = new Map([[unit.id, source]])
  try {
    breakup.update(state, 0, ground, visible, aircraft, DEFAULT_GRAPHICS)
    unit.x = 10; state.time = .1
    breakup.update(state, .1, ground, visible, aircraft, DEFAULT_GRAPHICS)
    unit.hp = 0; state.time = .2; state.casualties = [loss(unit.id, .2)]
    breakup.update(state, .2, ground, visible, aircraft, DEFAULT_GRAPHICS)
    assert.equal(breakup.has(unit.id), true)
    assert.equal(source.visible, false)
    assert.equal(source.userData.intactColliderEnabled, false)
    const event = breakup.system.events.get(unit.id)!
    const moving = event.sections.filter(piece => piece.phase === 'dynamic')
    assert.ok(moving.length > 0 && moving.length <= 2)
    assert.ok(moving.every(piece => piece.velocity.x > 85), 'sampled 100 m/s flight is retained after impulse and drag')
    assert.ok(scene.getObjectByName(`vehicle-breakup-${unit.id}`))
    assert.ok(event.shards.length > 0)
    const gear = event.sections.filter(piece => piece.id.startsWith('gear_'))
    assert.equal(gear.length, 3)
    assert.ok(gear.every(piece => piece.phase === 'removed' && !piece.colliderEnabled), 'deployed fracture gear must not pop into an airborne loss')
    assert.ok(gear.every(piece => scene.getObjectByName(`vehicle-breakup-${unit.id}`)!.getObjectByName(piece.id)!.visible === false))
    for (let index = 1; index < 2800; index++) { state.time = .2 + index / 60; breakup.update(state, state.time, ground, visible, aircraft, DEFAULT_GRAPHICS) }
    assert.equal(breakup.system.events.size, 0)
    assert.equal(breakup.has(unit.id), false, 'renderer must show the ordinary persistent static wreck after fracture expiry')
    assert.equal(scene.getObjectByName(`vehicle-breakup-${unit.id}`), undefined)
    assert.equal(source.visible, false)
    breakup.update(state, state.time + .01, ground, visible, aircraft, DEFAULT_GRAPHICS)
    assert.equal(breakup.system.events.size, 0, 'the tracked casualty cannot replay its explosion')
    state.casualties = []; breakup.update(state, state.time + .1, ground, visible, aircraft, DEFAULT_GRAPHICS)
    assert.equal(breakup.has(unit.id), false)
  } finally { breakup.dispose(); disposeModel(source) }
})

test('event capacity eviction releases the old casualty to its persistent static wreck fallback', () => {
  const scene = new T.Scene(), breakup = new BattlefieldVehicleBreakup(scene), state = initialState()
  try {
    state.casualties = Array.from({ length: 17 }, (_, index) => loss(`wreck-${index}`, 0))
    for (let frame = 0; frame < 17; frame++) {
      state.time = frame / 60
      breakup.update(state, state.time, ground, visible, new Map(), DEFAULT_GRAPHICS)
    }
    assert.equal(breakup.system.events.size, 16)
    assert.equal(breakup.has('wreck-0'), false)
    assert.equal(scene.getObjectByName('vehicle-breakup-wreck-0'), undefined)
    assert.equal(breakup.has('wreck-16'), true)
    breakup.update(state, state.time + .1, ground, visible, new Map(), DEFAULT_GRAPHICS)
    assert.equal(breakup.has('wreck-0'), false, 'evicted explosions do not replay while the ordinary wreck remains')
  } finally { breakup.dispose() }
})

test('simultaneous loss setup is staggered and hidden losses do not allocate visible effects', () => {
  const scene = new T.Scene(), breakup = new BattlefieldVehicleBreakup(scene), state = initialState()
  state.casualties = [loss('one', 0), loss('two', 0), loss('three', 0)]
  try {
    breakup.update(state, 0, ground, () => false, new Map(), DEFAULT_GRAPHICS)
    assert.equal(breakup.system.events.size, 0)
    for (let frame = 1; frame <= 3; frame++) {
      state.time = frame / 60
      breakup.update(state, state.time, ground, visible, new Map(), DEFAULT_GRAPHICS)
      assert.equal(breakup.system.events.size, frame)
      assert.ok(breakup.system.stats.activeBodies <= frame * 2)
    }
    state.time = 0
    state.casualties = []
    breakup.update(state, 0, ground, visible, new Map(), DEFAULT_GRAPHICS)
    assert.equal(breakup.system.events.size, 0, 'simulation restart releases all old wrecks')
    assert.equal(breakup.has('one'), false)
  } finally { breakup.dispose() }
})

test('render-time corrections and pause preserve breakup while authoritative time continues forward', () => {
  const scene = new T.Scene(), breakup = new BattlefieldVehicleBreakup(scene), state = initialState()
  state.time = 10; state.casualties = [loss('interpolated', 10)]
  const update = (renderTime: number) => breakup.update(state, renderTime, ground, visible, new Map(), DEFAULT_GRAPHICS)
  try {
    update(10)
    state.time = 10.05; update(10.15)
    const event = breakup.system.events.get('interpolated')!, age = event.age
    const pieces = event.sections.map(piece => ({ phase: piece.phase, position: { ...piece.position } }))
    const shard = event.shards[0]
    assert.ok(age > 0 && shard)
    state.time = 10.1; update(10.1)
    assert.equal(breakup.system.events.get(event.id), event, 'a delayed snapshot correction must not recreate the explosion')
    assert.equal(event.age, age)
    assert.deepEqual(event.sections.map(piece => ({ phase: piece.phase, position: { ...piece.position } })), pieces)
    assert.equal(event.shards[0], shard)
    state.paused = true; update(10.1)
    assert.equal(event.age, age, 'pausing must not clear or advance existing debris')
    assert.equal(breakup.system.events.get(event.id), event)
    state.paused = false; state.time = 10.12; update(10.12)
    assert.equal(event.age, age, 'the already extrapolated interval is not integrated again')
    state.time = 10.2; update(10.2)
    assert.ok(event.age > age)
    assert.equal(breakup.system.events.get(event.id), event)
    assert.equal(event.shards[0], shard, 'resume advances the original cosmetic emission')
  } finally { breakup.dispose() }
})

test('an old casualty first observed later becomes a static wreck without replaying its explosion', () => {
  const scene = new T.Scene(), breakup = new BattlefieldVehicleBreakup(scene), state = initialState()
  state.time = 10; state.casualties = [{ ...loss('old', 0), altitude: 0 }]
  try {
    breakup.update(state, 10, ground, visible, new Map(), DEFAULT_GRAPHICS)
    const event = breakup.system.events.get('old')!
    assert.ok(event.sections.every(piece => piece.phase === 'static' && piece.colliderEnabled))
    assert.equal(event.shards.length, 0)
    assert.equal(breakup.system.stats.activeBodies, 0)
    assert.equal(event.intactColliderEnabled, false)
  } finally { breakup.dispose() }
})

test('Babylon honors section collider picking and shadow disabling while keeping damage isolated', () => {
  const runtime = new (BabylonRuntime as unknown as new (canvas: HTMLCanvasElement, engine: NullEngine) => BabylonRuntime)({ dataset: {} } as HTMLCanvasElement, new NullEngine())
  const scene = new T.Scene(), piece = new T.Group(), mesh = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial())
  mesh.name = 'fracture-collider'; mesh.userData.disableShadow = true
  piece.userData.vehicleCollider = { enabled: true, halfExtents: { x: .5, y: .5, z: .5 }, phase: 'dynamic' }
  piece.add(mesh); scene.add(piece)
  try {
    runtime.sync(scene)
    const native = runtime.scene.meshes.find(value => value.name === mesh.name)!
    assert.equal(native.isPickable, true)
    assert.equal(native.metadata.gridVehicleCollider.phase, 'dynamic')
    piece.userData.vehicleCollider.enabled = false; runtime.sync(scene)
    assert.equal(native.isPickable, false)
    piece.visible = false; runtime.sync(scene)
    assert.equal(native.isEnabled(), false)
  } finally { runtime.dispose() }
})
