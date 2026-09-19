import test from 'node:test'
import assert from 'node:assert/strict'
import { breakupWorldHalfExtents, VehicleBreakupSystem, VEHICLE_BREAKUP_LIMITS } from '../lib/game/vehicle-breakup'
import { VehicleBreakupModels } from '../lib/game/vehicle-breakup-models'
import { createBlenderVehicle } from '../lib/game/blender-vehicles'
import { animateVehicleGameplay, poseVehicleClip, vehicleClips } from '../lib/game/vehicle-animation'
import * as D from '../lib/game/scene-data'

const origin = { x: 0, y: 0, z: 0 }
const sections = (count = 12) => Array.from({ length: count }, (_, index) => ({
  id: `section-${index.toString().padStart(2, '0')}`,
  center: { x: (index % 4 - 1.5) * 3, y: (Math.floor(index / 4) - 1) * 3, z: 0 },
  halfExtents: { x: .5, y: .4, z: .3 },
  mass: 10 + index,
}))

function begin(system: VehicleBreakupSystem, id = 'vehicle', overrides = {}) {
  const event = system.begin({ id, sections: sections(), position: { x: 0, y: 0, z: 12 }, seed: 71, destruction: 1, ...overrides })
  assert.ok(event, 'an unsaturated system accepts an event')
  return event
}

function advance(system: VehicleBreakupSystem, seconds: number, dt = 1 / 60) {
  for (let frame = 0; frame < Math.ceil(seconds / dt); frame++) system.update(dt)
}

test('the default breakup budget bounds bodies, event count and release work', () => {
  assert.equal(VEHICLE_BREAKUP_LIMITS.maxActiveBodies, 48)
  assert.equal(VEHICLE_BREAKUP_LIMITS.maxEvents, 16)
  assert.equal(VEHICLE_BREAKUP_LIMITS.minPiecesPerEvent, 4)
  assert.equal(VEHICLE_BREAKUP_LIMITS.maxPiecesPerEvent, 12)
  assert.equal(VEHICLE_BREAKUP_LIMITS.releasesPerFrame, 2)
  assert.equal(VEHICLE_BREAKUP_LIMITS.fixedStep, 1 / 60)
  assert.ok(VEHICLE_BREAKUP_LIMITS.maxSubsteps <= 6)
  assert.ok(VEHICLE_BREAKUP_LIMITS.maxDynamicAge <= 12)
  assert.ok(VEHICLE_BREAKUP_LIMITS.wreckLifetime <= 45)
  assert.equal(VEHICLE_BREAKUP_LIMITS.minShardsPerEvent, 16)
  assert.equal(VEHICLE_BREAKUP_LIMITS.maxShardsPerEvent, 48)
  assert.equal(VEHICLE_BREAKUP_LIMITS.maxCosmeticShards, 256)
  assert.ok(VEHICLE_BREAKUP_LIMITS.shardLifetime <= 2.5)
})

test('zero destruction keeps the entire vehicle attached without dynamic bodies', () => {
  const system = new VehicleBreakupSystem()
  const event = begin(system, 'intact', { destruction: 0 })
  advance(system, .5)
  assert.equal(event.destruction, 0)
  assert.equal(event.intactColliderEnabled, true)
  assert.equal(system.stats.activeBodies, 0)
  assert.equal(system.stats.cosmeticShards, 0)
  assert.ok(event.sections.length > 0)
  assert.ok(event.sections.every(piece => piece.phase === 'attached'))
})

test('the same seed chooses the same bounded sections and physical trajectory', () => {
  const run = (seed: number) => {
    const system = new VehicleBreakupSystem()
    const event = begin(system, 'seeded', { seed, sections: sections(20), pieceCount: 4 })
    const selected = new Set<string>()
    for (let frame = 0; frame < 90; frame++) {
      system.update(1 / 60)
      for (const piece of event.sections) if (piece.phase === 'dynamic') selected.add(piece.id)
    }
    return {
      selected: [...selected].sort(),
      pieces: event.sections.map(piece => ({ id: piece.id, phase: piece.phase, position: piece.position, rotation: piece.rotation, velocity: piece.velocity })),
    }
  }
  const first = run(71)
  assert.deepEqual(run(71), first)
  assert.equal(first.selected.length, 4, 'requested selection remains within the per-event cap')
  assert.notDeepEqual(run(72).selected, first.selected, 'different seeds vary the selected sections')
  assert.equal(new Set(first.selected).size, first.selected.length)
})

test('one explosion releases sections over multiple updates rather than in one burst', () => {
  const system = new VehicleBreakupSystem()
  const event = begin(system)
  assert.equal(system.stats.activeBodies, 0, 'begin queues work without creating a burst of active bodies')
  system.update(1 / 60)
  assert.ok(system.stats.activeBodies > 0)
  assert.ok(system.stats.activeBodies <= VEHICLE_BREAKUP_LIMITS.releasesPerFrame)
  const previous = system.stats.activeBodies
  system.update(1 / 60)
  assert.ok(system.stats.activeBodies > previous)
  assert.ok(system.stats.activeBodies - previous <= VEHICLE_BREAKUP_LIMITS.releasesPerFrame)
  advance(system, .5)
  assert.ok(event.sections.every(piece => piece.phase !== 'attached'))
  assert.equal(event.intactColliderEnabled, false)
})

test('release work and active bodies stay globally capped across simultaneous explosions', () => {
  const system = new VehicleBreakupSystem()
  const events = Array.from({ length: VEHICLE_BREAKUP_LIMITS.maxEvents }, (_, i) => begin(system, `vehicle-${i}`, {
    sections: sections(20), position: { x: i * 40, y: 0, z: 30 }, pieceCount: 12,
  }))
  let previousActive = 0, peakActive = 0
  for (let frame = 0; frame < 180; frame++) {
    system.update(1 / 60)
    const stats = system.stats
    assert.ok(stats.activeBodies <= VEHICLE_BREAKUP_LIMITS.maxActiveBodies, `frame ${frame}: ${stats.activeBodies} active bodies`)
    assert.ok(stats.activeBodies - previousActive <= VEHICLE_BREAKUP_LIMITS.releasesPerFrame, `frame ${frame}: global release rate`)
    peakActive = Math.max(peakActive, stats.activeBodies)
    previousActive = stats.activeBodies
  }
  assert.ok(peakActive > 0)
  assert.equal(system.stats.events, VEHICLE_BREAKUP_LIMITS.maxEvents)
  for (const event of events) {
    assert.ok(event.sections.filter(piece => piece.phase === 'dynamic').length <= VEHICLE_BREAKUP_LIMITS.maxPiecesPerEvent)
    assert.ok(event.sections.every(piece => piece.phase !== 'attached'), `${event.id}: backlog drains even when the body cap is full`)
    assert.equal(event.intactColliderEnabled, false)
  }
})

test('section velocity inherits parent translation before receiving the explosion impulse', () => {
  const still = new VehicleBreakupSystem(), moving = new VehicleBreakupSystem()
  const inherited = { x: 8, y: -4, z: 2 }
  const a = begin(still, 'same'), b = begin(moving, 'same', { velocity: inherited })
  still.update(1 / 60); moving.update(1 / 60)
  const active = a.sections.filter(piece => piece.phase === 'dynamic')
  assert.ok(active.length > 0)
  for (const piece of active) {
    const paired = b.sections.find(other => other.id === piece.id)!
    for (const axis of ['x', 'y', 'z'] as const) {
      const delta = paired.velocity[axis] - piece.velocity[axis]
      assert.ok(Math.abs(delta - inherited[axis]) < .15, `${axis}: inherited velocity remains present after one integration step (${delta})`)
    }
  }
})

test('lowering destruction cannot reattach a released section or restore the old collider', () => {
  const system = new VehicleBreakupSystem()
  const event = begin(system, 'monotonic', { destruction: .55 })
  advance(system, .5)
  const detached = new Set(event.sections.filter(piece => piece.phase !== 'attached').map(piece => piece.id))
  assert.ok(detached.size > 0)
  const destruction = event.destruction
  system.setDestruction(event.id, 0)
  advance(system, .25)
  assert.ok(event.destruction >= destruction)
  assert.equal(event.intactColliderEnabled, false)
  for (const piece of event.sections) if (detached.has(piece.id)) assert.notEqual(piece.phase, 'attached', piece.id)
  system.setDestruction(event.id, 1)
  advance(system, .5)
  assert.ok(event.sections.every(piece => piece.phase !== 'attached'))
})

test('detached colliders remain finite and sections settle into static wrecks', () => {
  const system = new VehicleBreakupSystem()
  const event = begin(system, 'settle', { position: { x: 0, y: 0, z: 3 } })
  advance(system, VEHICLE_BREAKUP_LIMITS.maxDynamicAge + 1)
  assert.equal(system.stats.activeBodies, 0)
  assert.ok(system.stats.staticBodies > 0)
  assert.ok(event.sections.every(piece => piece.phase === 'static'))
  for (const piece of event.sections) {
    assert.ok([...Object.values(piece.position), ...Object.values(piece.rotation), ...Object.values(piece.velocity)].every(Number.isFinite))
    assert.deepEqual(piece.velocity, origin)
    assert.equal(piece.colliderEnabled, true)
    assert.ok(piece.position.z >= piece.halfExtents.z - .001, `${piece.id} does not settle below the ground`)
  }
})

test('wreck expiry, explicit removal and clear release event references and active work', () => {
  const system = new VehicleBreakupSystem()
  const event = begin(system)
  advance(system, VEHICLE_BREAKUP_LIMITS.wreckLifetime + 1)
  assert.equal(system.events.has(event.id), false)
  assert.equal(system.stats.events, 0)
  assert.equal(system.stats.activeBodies, 0)
  assert.equal(system.stats.staticBodies, 0)
  assert.equal(system.stats.attachedBodies, 0)
  assert.equal(system.stats.cosmeticShards, 0)
  assert.ok(system.stats.pooledBodies <= VEHICLE_BREAKUP_LIMITS.maxEvents * 20)
  begin(system, 'remove-me'); system.update(1 / 60); system.remove('remove-me')
  assert.equal(system.events.has('remove-me'), false)
  assert.equal(system.stats.activeBodies, 0)
  begin(system, 'clear-a'); begin(system, 'clear-b'); system.update(1 / 60); system.clear()
  assert.equal(system.stats.events, 0)
  assert.equal(system.stats.activeBodies, 0)
  assert.equal(system.stats.staticBodies, 0)
  assert.equal(system.stats.attachedBodies, 0)
  assert.equal(system.stats.cosmeticShards, 0)
})

test('repeated capacity overflow and cleanup keep event storage bounded', () => {
  const system = new VehicleBreakupSystem()
  for (let wave = 0; wave < 4; wave++) {
    for (let index = 0; index < VEHICLE_BREAKUP_LIMITS.maxEvents * 3; index++) {
      system.begin({ id: `${wave}-${index}`, sections: sections(20), position: { x: index * 30, y: 0, z: 10 }, destruction: 1, seed: index })
      assert.ok(system.stats.events <= VEHICLE_BREAKUP_LIMITS.maxEvents)
      const stats = system.stats
      assert.ok(stats.pooledBodies + stats.activeBodies + stats.staticBodies + stats.attachedBodies <= VEHICLE_BREAKUP_LIMITS.maxEvents * 20)
    }
    advance(system, 1)
    assert.ok(system.stats.activeBodies <= VEHICLE_BREAKUP_LIMITS.maxActiveBodies)
    advance(system, VEHICLE_BREAKUP_LIMITS.wreckLifetime + 1)
    assert.equal(system.stats.events, 0)
    assert.equal(system.stats.activeBodies, 0)
    assert.equal(system.stats.staticBodies, 0)
    assert.equal(system.stats.cosmeticShards, 0)
    assert.ok(system.stats.pooledShards <= VEHICLE_BREAKUP_LIMITS.maxCosmeticShards)
    assert.ok(system.stats.pooledShards + system.stats.cosmeticShards <= VEHICLE_BREAKUP_LIMITS.maxCosmeticShards)
    assert.ok(system.stats.pooledBodies <= VEHICLE_BREAKUP_LIMITS.maxEvents * 20)
  }
})

test('a frame hitch does not exceed the release or fixed-step catch-up budget', () => {
  const system = new VehicleBreakupSystem()
  const event = begin(system)
  system.update(10)
  assert.ok(system.stats.activeBodies <= VEHICLE_BREAKUP_LIMITS.releasesPerFrame)
  assert.ok(event.age <= VEHICLE_BREAKUP_LIMITS.fixedStep * VEHICLE_BREAKUP_LIMITS.maxSubsteps + 1e-9)
  const before = JSON.stringify(event)
  for (const invalid of [0, -1, NaN, Infinity]) system.update(invalid)
  assert.equal(JSON.stringify(event), before, 'invalid elapsed time never corrupts the simulation')
})

test('oversized section and effect requests cannot bypass per-vehicle allocation bounds', () => {
  const system = new VehicleBreakupSystem()
  const event = begin(system, 'oversized', { sections: sections(80), pieceCount: 1000, shardCount: 1000 })
  assert.equal(event.sections.length, 20)
  assert.equal(new Set(event.sections.map(piece => piece.id)).size, 20)
  advance(system, .5)
  assert.ok(system.stats.activeBodies <= VEHICLE_BREAKUP_LIMITS.maxPiecesPerEvent)
  assert.equal(event.shards.length, VEHICLE_BREAKUP_LIMITS.maxShardsPerEvent)
})

test('fixed physics steps reproduce motion across equivalent render frame partitions', () => {
  const a = new VehicleBreakupSystem(), b = new VehicleBreakupSystem()
  const left = begin(a), right = begin(b)
  // Drain the release queue identically; frame-based release intentionally remains bounded separately.
  advance(a, .5); advance(b, .5)
  advance(a, 1, 1 / 60); advance(b, 1, 1 / 30)
  assert.deepEqual(left, right)
})

test('quiet sections sleep before forced expiry and keep their static transform', () => {
  const system = new VehicleBreakupSystem()
  const event = begin(system, 'sleep', { sections: sections(1), position: { x: 0, y: 0, z: 1 } })
  advance(system, 8)
  const piece = event.sections[0]
  assert.equal(piece.phase, 'static')
  assert.ok(piece.dynamicAge < VEHICLE_BREAKUP_LIMITS.maxDynamicAge)
  assert.ok(piece.quietTime >= VEHICLE_BREAKUP_LIMITS.sleepDelay)
  const position = { ...piece.position }, rotation = { ...piece.rotation }
  advance(system, 2)
  assert.deepEqual(piece.position, position)
  assert.deepEqual(piece.rotation, rotation)
})

test('rotated section collision rests above supplied terrain rather than the default plane', () => {
  const system = new VehicleBreakupSystem()
  const event = begin(system, 'terrain', { sections: sections(1), position: { x: 4, y: 5, z: 8 }, rotation: { x: .3, y: .2, z: .4 } })
  const ground = (x: number, y: number) => 5 + x * .03 + y * .02
  for (let frame = 0; frame < 60 * 13; frame++) system.update(1 / 60, ground)
  const piece = event.sections[0]
  assert.equal(piece.phase, 'static')
  assert.ok(piece.position.z >= ground(piece.position.x, piece.position.y) + breakupWorldHalfExtents(piece).z - 1e-6)
  assert.equal(event.intactColliderEnabled, false)
  assert.equal(piece.colliderEnabled, true)
})

test('removed body records are reused without restoring prior destruction or motion', () => {
  const system = new VehicleBreakupSystem()
  const first = begin(system, 'first')
  advance(system, .5)
  const previous = new Set(first.sections)
  system.remove(first.id)
  assert.ok(first.sections.every(piece => piece.phase === 'removed' && !piece.colliderEnabled))
  const second = begin(system, 'second', { destruction: 0, position: { x: 100, y: 0, z: 3 } })
  assert.ok(second.sections.every(piece => previous.has(piece)), 'the finite body pool is reused')
  assert.equal(second.destruction, 0)
  assert.equal(second.intactColliderEnabled, true)
  assert.ok(second.sections.every(piece => piece.phase === 'attached' && piece.position.x > 90 && piece.dynamicAge === 0 && piece.quietTime === 0))
})

test('cosmetic shards emit once when breakup starts and follow noncolliding analytic trajectories', () => {
  const system = new VehicleBreakupSystem()
  const event = begin(system, 'shards', { destruction: 0, shardCount: 48 })
  advance(system, .25)
  assert.equal(event.shards.length, 0)
  system.setDestruction(event.id, 1); system.update(1 / 60)
  assert.equal(event.shards.length, 48)
  const ids = event.shards.map(shard => shard.id)
  const initial = event.shards.map(shard => ({ position: { ...shard.position }, velocity: { ...shard.velocity }, age: shard.age }))
  advance(system, .25)
  assert.deepEqual(event.shards.map(shard => shard.id), ids, 'ongoing release does not emit another batch')
  for (const [index, shard] of event.shards.entries()) {
    const before = initial[index], dt = shard.age - before.age
    assert.equal(shard.active, true)
    assert.equal(shard.colliderEnabled, false)
    assert.deepEqual(shard.velocity, before.velocity, 'trajectory parameters are constant')
    assert.ok(Math.abs(shard.position.x - before.position.x - shard.velocity.x * dt) < 1e-8)
    assert.ok(Math.abs(shard.position.y - before.position.y - shard.velocity.y * dt) < 1e-8)
    assert.ok(shard.position.z < before.position.z + shard.velocity.z * dt, 'gravity bends the vertical trajectory')
  }
  assert.ok(system.stats.activeBodies <= 12, 'shards never consume the colliding body budget')
})

test('simultaneous breakup never exceeds the shared cosmetic shard capacity', () => {
  const system = new VehicleBreakupSystem()
  for (let index = 0; index < 16; index++) begin(system, `debris-${index}`, { shardCount: 48, position: { x: index * 40, y: 0, z: 10 } })
  let peak = 0
  for (let frame = 0; frame < 180; frame++) {
    system.update(1 / 60)
    peak = Math.max(peak, system.stats.cosmeticShards)
    assert.ok(system.stats.cosmeticShards <= VEHICLE_BREAKUP_LIMITS.maxCosmeticShards)
    assert.ok(system.stats.pooledShards <= VEHICLE_BREAKUP_LIMITS.maxCosmeticShards)
    assert.ok(system.stats.pooledShards + system.stats.cosmeticShards <= VEHICLE_BREAKUP_LIMITS.maxCosmeticShards)
    for (const event of system.events.values()) {
      assert.ok(event.shards.length <= VEHICLE_BREAKUP_LIMITS.maxShardsPerEvent)
      assert.ok(event.shards.every(shard => !shard.colliderEnabled))
    }
  }
  assert.equal(peak, VEHICLE_BREAKUP_LIMITS.maxCosmeticShards, 'the overload scenario exercises the actual cap')
  advance(system, VEHICLE_BREAKUP_LIMITS.shardLifetime + 1)
  assert.equal(system.stats.cosmeticShards, 0)
})

test('expired and explicitly removed cosmetic shards return to the same bounded pool', () => {
  const system = new VehicleBreakupSystem()
  const first = begin(system, 'pool-first', { shardCount: 48 })
  system.update(1 / 60)
  const previous = new Set(first.shards)
  advance(system, VEHICLE_BREAKUP_LIMITS.shardLifetime + .1)
  assert.equal(first.shards.length, 0)
  assert.equal(system.stats.cosmeticShards, 0)
  assert.equal(system.stats.pooledShards, 48)
  assert.ok([...previous].every(shard => !shard.active))
  const second = begin(system, 'pool-second', { shardCount: 48 })
  system.update(1 / 60)
  assert.equal(second.shards.length, 48)
  assert.ok(second.shards.every(shard => previous.has(shard)))
  assert.equal(system.stats.pooledShards, 0)
  system.remove(second.id)
  assert.equal(system.stats.cosmeticShards, 0)
  assert.equal(system.stats.pooledShards, 48)
})

test('a reduced effects request emits fewer cosmetic shards while preserving bounded bodies', () => {
  for (const [requested, expected] of [[0, 16], [16, 16], [48, 48], [1000, 48]]) {
    const system = new VehicleBreakupSystem()
    const event = begin(system, 'quality', { shardCount: requested })
    system.update(1 / 60)
    assert.equal(event.shards.length, expected)
    assert.ok(system.stats.activeBodies <= VEHICLE_BREAKUP_LIMITS.releasesPerFrame)
  }
})

test('playing every live vehicle clip cannot restore detached fracture transforms', () => {
  for (const role of ['TANK', 'JET'] as const) {
    const scene = new D.Scene(), source = createBlenderVehicle(role, 'BLU')
    const models = new VehicleBreakupModels(scene), system = new VehicleBreakupSystem()
    try {
      const definitions = models.prepare(role, 'BLU', source)
      assert.ok(definitions.length >= 8 && definitions.length <= 20)
      const event = begin(system, `animated-${role}`, { sections: definitions })
      models.attach(event, role, 'BLU'); advance(system, .5); models.sync(event, true)
      const visual = scene.getObjectByName(`vehicle-breakup-${event.id}`)!
      assert.ok(visual)
      assert.notEqual(visual, source)
      assert.equal(source.parent, null, 'fracture hierarchy is independent of the original animated model')
      const detached = visual.children.map(piece => ({ id: piece.name, position: piece.position.toArray(), rotation: piece.rotation.toArray() }))
      for (const clip of vehicleClips(role)) {
        poseVehicleClip(source, clip.id, clip.duration * .7)
        poseVehicleClip(visual, clip.id, clip.duration * .7)
        animateVehicleGameplay(source, clip.duration, { heading: 1, aim: 2, active: true })
        assert.deepEqual(visual.children.map(piece => ({ id: piece.name, position: piece.position.toArray(), rotation: piece.rotation.toArray() })), detached)
      }
      system.setDestruction(event.id, 0); models.sync(event, true)
      assert.equal(visual.userData.intactColliderEnabled, false)
      for (const piece of visual.children) {
        assert.equal(piece.userData.vehicleBreakupPiece, true)
        assert.notEqual(piece.userData.vehicleCollider.phase, 'attached')
        assert.equal(piece.userData.vehicleCollider.enabled, true)
      }
      models.sync(event, true, false)
      visual.traverse(node => { if (node instanceof D.Mesh) assert.equal(node.userData.disableShadow, true) })
    } finally { models.dispose(); system.clear() }
  }
})

test('fracture visuals are removed on expiry and reused for a later vehicle', () => {
  const scene = new D.Scene(), source = createBlenderVehicle('JET', 'BLU')
  const models = new VehicleBreakupModels(scene), system = new VehicleBreakupSystem()
  try {
    const definitions = models.prepare('JET', 'BLU', source)
    const first = begin(system, 'visual-first', { sections: definitions })
    models.attach(first, 'JET', 'BLU')
    const visual = scene.getObjectByName('vehicle-breakup-visual-first')!
    assert.ok(visual)
    system.remove(first.id); models.retain(system.events)
    assert.equal(scene.children.length, 0)
    const second = begin(system, 'visual-second', { sections: definitions, position: { x: 100, y: 0, z: 3 } })
    models.attach(second, 'JET', 'BLU')
    assert.equal(scene.getObjectByName('vehicle-breakup-visual-second'), visual)
    assert.ok(visual.children.every(piece => piece.position.x > 80))
    assert.equal(scene.children.length, 1)
  } finally { models.dispose(); system.clear() }
  assert.equal(scene.children.length, 0)
})
