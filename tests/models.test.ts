import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from '../lib/game/scene-data'
import { CATALOG, isAir, isVehicle, type Role, type Side } from '../lib/game/types'
import { MODEL_CATALOG, MODEL_NAMES } from '../lib/game/model-catalog'
import { createAircraft, animateAircraft, disposeModel } from '../lib/game/aircraft-models'
import { createBase, conformBase } from '../lib/game/base-models'
import { soldierParts, vehicleGeometry } from '../lib/game/unit-models'

function finite(root: T.Object3D) {
  let vertices = 0
  root.traverse(o => { if (o instanceof T.Mesh) { const p = o.geometry.getAttribute('position'); vertices += p.count; assert.ok(Array.from(p.array).every(Number.isFinite), o.name) } })
  const bounds = new T.Box3().setFromObject(root)
  assert.ok(vertices > 0); assert.ok(!bounds.isEmpty()); assert.ok(bounds.getSize(new T.Vector3()).toArray().every(Number.isFinite))
}
test('model browser covers every catalog role and both compound types', () => {
  assert.equal(new Set(MODEL_CATALOG).size, Object.keys(CATALOG).length + 2)
  for (const role of Object.keys(CATALOG)) assert.ok(MODEL_CATALOG.includes(role as Role))
  for (const id of MODEL_CATALOG) assert.ok(MODEL_NAMES[id])
  assert.ok(MODEL_CATALOG.includes('MOB')); assert.ok(MODEL_CATALOG.includes('AIRFIELD'))
})
test('all production aircraft and compound models have finite geometry in both liveries', () => {
  for (const side of ['BLU', 'RED'] as Side[]) {
    for (const role of Object.keys(CATALOG) as Role[]) {
      if (isAir(role)) { const model = createAircraft(role, side); finite(model); disposeModel(model) }
      else if (isVehicle(role)) { const geometry = vehicleGeometry(role, side); assert.ok(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)); geometry.dispose() }
    }
    for (const kind of ['MOB', 'AIRFIELD'] as const) { const model = createBase(kind, side); finite(model); disposeModel(model) }
    Object.values(soldierParts(side)).forEach(g => { assert.ok(Array.from(g.getAttribute('position').array).every(Number.isFinite)); g.dispose() })
  }
})
test('compound foundations remain level and terrain updates do not accumulate', () => {
  const base = createBase('AIRFIELD', 'BLU')
  const positions = () => { const values: number[] = []; base.traverse(o => { if (o instanceof T.Mesh) { const p = o.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) values.push(p.getX(i), p.getY(i), p.getZ(i)) } }); return values }
  conformBase(base, (x,y) => x * .02 + y * .01); const first = positions()
  conformBase(base, (x,y) => x * .02 + y * .01); assert.deepEqual(positions(), first)
  conformBase(base, () => 0); finite(base); assert.notDeepEqual(positions(), first)
  disposeModel(base)
})
test('aircraft have distinct silhouettes and independently animated parts', () => {
  const heli = createAircraft('ATTACK_HELI', 'BLU'), jet = createAircraft('JET', 'BLU'), uav = createAircraft('RECON_UAV', 'BLU')
  for (const name of ['hull', 'rotor_L', 'rotor_R']) assert.ok(heli.getObjectByName(name), name)
  assert.ok(jet.getObjectByName('hull'))
  for (const name of ['propeller', 'v-tail', 'sensor-turret']) assert.ok(uav.getObjectByName(name), name)
  animateAircraft(heli, 2); animateAircraft(uav, 2)
  assert.equal(heli.getObjectByName('rotor_L')!.rotation.y, Math.PI*16)
  assert.equal(heli.getObjectByName('rotor_R')!.rotation.y, Math.PI*16)
  assert.equal(uav.getObjectByName('propeller')!.rotation.y, 90)
  const before = heli.getObjectByName('rotor_L')!.rotation.y; animateAircraft(heli, 2); assert.equal(heli.getObjectByName('rotor_L')!.rotation.y, before)
  const size = (m: T.Object3D) => new T.Box3().setFromObject(m).getSize(new T.Vector3())
  assert.ok(size(uav).x > size(jet).x); assert.ok(size(jet).y > size(uav).y)
  for (const m of [heli, jet, uav]) disposeModel(m)
})
