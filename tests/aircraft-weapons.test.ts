import test from 'node:test'
import assert from 'node:assert/strict'
import { AIRCRAFT_HARDPOINTS, aircraftAmmoPercent, aircraftRounds, createAircraftLoadout, releaseAircraftWeapon } from '../lib/game/aircraft-loadout'
import { createBlenderVehicle } from '../lib/game/blender-vehicles'
import { poseVehicleClip, vehicleClips } from '../lib/game/vehicle-animation'
import { syncAircraftWeapons, createAircraftProjectile } from '../lib/game/aircraft-weapons'
import { Mesh } from '../lib/game/scene-data'
import { readFileSync } from 'node:fs'
import fighter from '../lib/game/generated/fighter.json'
import { resolveCombat } from '../lib/game/combat'
import { Visibility } from '../lib/game/visibility'
import { battleFixture } from './fixtures'
import { prepareUnit, type GeometryPacket } from '../lib/game/types'
import { recordCasualties } from '../lib/game/casualties'
import { Navigation } from '../lib/game/navigation'

test('two independent pods fire eight rockets each without releasing a pod', () => {
  const state = createAircraftLoadout('JET'), model = createBlenderVehicle('JET', 'BLU')
  const launches = Array.from({ length: 16 }, () => releaseAircraftWeapon('JET', state, 'rocket')!)
  assert.equal(aircraftRounds('JET', state, 'rocket'), 0)
  assert.equal(releaseAircraftWeapon('JET', state, 'rocket'), undefined)
  for (const id of ['pod_R_0', 'pod_R_1']) {
    assert.deepEqual(launches.filter(r => r.hardpoint === id).map(r => r.round), [0,1,2,3,4,5,6,7])
    syncAircraftWeapons(model, state)
    assert.equal(model.getObjectByName(id)!.visible, true)
    assert.ok(Array.from({ length: 8 }, (_, n) => model.getObjectByName(`${id}_round_${n}`)).every(o => o?.visible === false))
    assert.deepEqual(model.getObjectByName(id)!.position.toArray(), AIRCRAFT_HARDPOINTS.JET!.find(p => p.id === id)!.position)
  }
  assert.equal(aircraftAmmoPercent('JET', state), 36)
})

test('bomb commands release one distinct attachment at a time and run out', () => {
  const state = createAircraftLoadout('JET'), model = createBlenderVehicle('JET', 'RED')
  assert.equal(releaseAircraftWeapon('JET', state, 'bomb')!.hardpoint, 'bomb_L_0')
  syncAircraftWeapons(model, state)
  assert.equal(model.getObjectByName('bomb_L_0')!.visible, false)
  assert.equal(model.getObjectByName('bomb_L_1')!.visible, true)
  assert.equal(releaseAircraftWeapon('JET', state, 'bomb')!.hardpoint, 'bomb_L_1')
  assert.equal(releaseAircraftWeapon('JET', state, 'bomb'), undefined)
  assert.equal(aircraftRounds('JET', state, 'rocket'), 16)
})

test('preview scrubs individual launches and resets without changing game state', () => {
  const ids = vehicleClips('JET').map(c => c.id)
  assert.equal(new Set(ids).size, ids.length)
  const model = createBlenderVehicle('JET', 'BLU')
  poseVehicleClip(model, 'bombs', 1)
  assert.ok(model.getObjectByName('bomb_L_0')!.position.z < .59)
  assert.equal(model.getObjectByName('bomb_L_1')!.position.z, .59)
  poseVehicleClip(model, 'bombs', 1.8)
  assert.equal(model.getObjectByName('bomb_L_0')!.visible, false)
  assert.ok(model.getObjectByName('bomb_L_1')!.position.z < .59)
  poseVehicleClip(model, 'rockets', 1)
  assert.deepEqual(model.getObjectByName('pod_R_0')!.position.toArray(), [1.445,-1.65,.59])
  assert.ok(model.getObjectByName('pod_R_0_round_0')!.position.y > .65)
  poseVehicleClip(model, 'rockets', Number.POSITIVE_INFINITY)
  for (const pod of ['pod_R_0','pod_R_1']) for (let round = 0; round < 8; round++) assert.equal(model.getObjectByName(`${pod}_round_${round}`)!.visible, false)
  poseVehicleClip(model, 'idle', 0)
  assert.equal(model.getObjectByName('bomb_L_0')!.visible, true)
  assert.ok(Math.abs(model.getObjectByName('pod_R_0_round_0')!.position.y - .65) < 1e-8)
})

test('destroyed Fury keeps a separate snapshot of spent stores', () => {
  const state = battleFixture(), jet = state.units[0], loadout = createAircraftLoadout('JET')
  Object.assign(jet, { role: 'JET', hp: 0, altitude: 50, aircraftLoadout: loadout })
  state.units = [jet]
  for (let n = 0; n < 5; n++) releaseAircraftWeapon('JET', loadout, 'rocket')
  releaseAircraftWeapon('JET', loadout, 'bomb')
  recordCasualties(state, new Navigation(), new Visibility(), () => .5)
  const casualty = state.casualties.find(c => c.id === jet.id)!
  assert.deepEqual(casualty.aircraftLoadout, loadout)
  assert.notEqual(casualty.aircraftLoadout, loadout)
  assert.notEqual(casualty.aircraftLoadout!.remaining, loadout.remaining)
  // The renderer carries the casualty fields into the wreck, then samples and syncs.
  const wreck = createBlenderVehicle(casualty.role, casualty.side)
  wreck.userData.destroyed = true; poseVehicleClip(wreck, 'idle', 0); syncAircraftWeapons(wreck, casualty.aircraftLoadout)
  for (const point of AIRCRAFT_HARDPOINTS.JET!) {
    const remaining: number = casualty.aircraftLoadout!.remaining[point.id]
    assert.equal(wreck.getObjectByName(point.id)!.visible, point.asset === 'rocket_pod' || remaining > 0)
    if (point.asset === 'rocket_pod') for (let round = 0; round < 8; round++) assert.equal(wreck.getObjectByName(`${point.id}_round_${round}`)!.visible, round >= 8 - remaining)
  }
  const snapshot = structuredClone(casualty.aircraftLoadout)
  releaseAircraftWeapon('JET', loadout, 'bomb'); releaseAircraftWeapon('JET', loadout, 'rocket')
  assert.deepEqual(casualty.aircraftLoadout, snapshot)
})

test('reusable stores have their own atlas and no baked weapon geometry remains', () => {
  assert.ok(Object.keys(fighter).every(key => !key.startsWith('store_')))
  const model = createBlenderVehicle('JET', 'BLU'), maps = new Set<string>()
  model.traverse(o => { if (o instanceof Mesh && o.userData.weaponAttachment) { const m = Array.isArray(o.material) ? o.material[0] : o.material; maps.add(m.map!); assert.ok(o.geometry.index); assert.equal(o.geometry.getAttribute('uv').count, o.geometry.getAttribute('position').count) } })
  assert.deepEqual([...maps], ['/models/aircraft_weapons_albedo.png'])
  const released = createAircraftProjectile(model, 'bomb')!
  assert.equal(released.geometry, (model.getObjectByName('bomb_L_0_weapon_mesh') as Mesh).geometry)
  const png = readFileSync(new URL('../public/models/aircraft_weapons_albedo.png', import.meta.url))
  assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024)
})

test('combat consumes real rounds and emits separate hardpoint events', () => {
  const state = battleFixture(), jet = state.units[0], target = state.units.find(u => u.side === 'RED')!
  state.units = [jet, target]
  Object.assign(jet, { role: 'JET', x: 0, y: 0, altitude: 50, heading: 0, ammo: 100, hp: 100, servicing: false, engine: true, airPhase: 'attack', aircraftLoadout: createAircraftLoadout('JET') })
  Object.assign(target, { role: 'TANK', x: 0, y: 400, hp: 100000, ammo: 0, members: 1 }); prepareUnit(jet); prepareUnit(target)
  const v = new Visibility(), packet: GeometryPacket = { complete: true, version: 1, features: [], terrain: { x: -1000, y: -1000, step: 50, width: 61, height: 61, values: Array(61*61).fill(0) } }; v.import(packet)
  let id = 0
  for (let n = 0; n < 16; n++) { state.time = n * .5; resolveCombat(state, v, () => .5, () => ++id) }
  assert.equal(id, 16); assert.equal(aircraftRounds('JET', jet.aircraftLoadout!, 'rocket'), 0)
  assert.equal(jet.ammo, 36)
  jet.aircraftWeapon = 'bomb'; state.time = 8; resolveCombat(state, v, () => .5, () => ++id)
  assert.equal(aircraftRounds('JET', jet.aircraftLoadout!, 'bomb'), 1)
  assert.equal(state.shots.at(-1)!.hardpoint, 'bomb_L_0')
  state.time = 9.5; resolveCombat(state, v, () => .5, () => ++id)
  assert.equal(aircraftRounds('JET', jet.aircraftLoadout!, 'bomb'), 0)
  assert.equal(state.shots.at(-1)!.hardpoint, 'bomb_L_1')
  assert.equal(jet.ammo, 0)
})
