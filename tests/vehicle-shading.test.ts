import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeVehicleGeometry, createBlenderVehicle, type PackedVehiclePart } from '../lib/game/blender-vehicles'
import { disposeModel } from '../lib/game/aircraft-models'
import * as T from '../lib/game/scene-data'
import carrier from '../lib/game/generated/aircraft_carrier.json'
import tank from '../lib/game/generated/tank.json'
import fighter from '../lib/game/generated/fighter.json'

test('carrier, tank and fighter retain their authored split normals and UV coordinates', () => {
  for (const asset of [carrier, tank, fighter]) for (const part of Object.values(asset)) {
    const geometry = decodeVehicleGeometry([part])
    assert.deepEqual(Array.from(geometry.getAttribute('normal').array), Array.from(new Float32Array(part.normals)))
    assert.deepEqual(Array.from(geometry.getAttribute('uv').array), Array.from(new Float32Array(part.uv)))
    assert.deepEqual(Array.from(geometry.index!.array), part.indices)
    geometry.dispose()
  }
})

test('carrier deck triangles share a level top and keep the hard deck edge', () => {
  const geometry = decodeVehicleGeometry([carrier.deck]), p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), indices = geometry.index!
  const tops: number[] = []
  for (let face = 0; face < indices.count; face += 3) {
    const [a, b, c] = [0, 1, 2].map(corner => indices.getX(face + corner))
    if (![a, b, c].every(i => n.getZ(i) === 1)) continue
    for (const i of [a, b, c]) tops.push(p.getZ(i))
    assert.ok((p.getX(b) - p.getX(a)) * (p.getY(c) - p.getY(a)) - (p.getY(b) - p.getY(a)) * (p.getX(c) - p.getX(a)) > 0)
  }
  assert.equal(tops.length / 3, 26)
  assert.equal(Math.max(...tops), Math.min(...tops))
  assert.ok(Array.from({ length: n.count }, (_, i) => i).some(i => p.getZ(i) === tops[0] && n.getZ(i) === 0), 'side normals stay separate at the top edge')
  geometry.dispose()
})

function packedHinge(degrees: number): PackedVehiclePart {
  const angle = degrees * Math.PI / 180, values = [-1,0,0, 0,0,0, 0,1,0, Math.cos(angle),0,Math.sin(angle)]
  let buffer = 0, bits = 0; const bytes: number[] = []
  for (const value of values) {
    buffer |= (Math.round(value * 10000) & 0x7fff) << bits; bits += 15
    while (bits >= 8) { bytes.push(buffer & 255); buffer >>>= 8; bits -= 8 }
  }
  if (bits) bytes.push(buffer & 255)
  return { q: Buffer.from(bytes).toString('base64'), n: values.length, s: .0001, i: 'AAA=', palette: [[1,1,1]], indices: [0,1,2,1,3,2], uv: [0,0,1,0,0,1,1,1] }
}

test('indexed parts without normals split hard edges and expand matching UV and color corners', () => {
  for (const degrees of [15, 45]) {
    const part = packedHinge(degrees), geometry = decodeVehicleGeometry([part]), normals = geometry.getAttribute('normal')
    assert.equal(normals.count, 6)
    assert.deepEqual(Array.from(geometry.getAttribute('uv').array), part.indices!.flatMap(i => part.uv!.slice(i * 2, i * 2 + 2)))
    assert.equal(geometry.getAttribute('color').count, 6)
    const first = [normals.getX(1), normals.getY(1), normals.getZ(1)], second = [normals.getX(3), normals.getY(3), normals.getZ(3)]
    if (degrees < 30) assert.deepEqual(first, second)
    else assert.notDeepEqual(first, second)
    geometry.dispose()
  }
})

test('untextured vehicle surfaces use their generated smooth normals', () => {
  const model = createBlenderVehicle('ATTACK_HELI', 'BLU')
  try {
    const material = (model.getObjectByName('hull_mesh') as T.Mesh).material as T.Material
    assert.equal(material.flatShading, false)
  } finally { disposeModel(model) }
})
