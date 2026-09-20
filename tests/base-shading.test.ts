import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from '../lib/game/scene-data'
import { conformBase, createBase } from '../lib/game/base-models'
import { computeAngleNormals } from '../lib/game/geometry-normals'
import { disposeModel } from '../lib/game/aircraft-models'

test('base grounding preserves smooth poles and cylinders through repeated height changes', () => {
  for (const kind of ['AIRFIELD', 'MOB'] as const) {
    const base = createBase(kind, 'BLU'), original = new Map<T.Mesh, Float32Array>()
    base.traverse(node => { if (node instanceof T.Mesh) original.set(node, new Float32Array(node.geometry.getAttribute('normal').array)) })
    try {
      for (const elevation of [{ high: 0, low: 0 }, { high: 37, low: 12 }, { high: 80, low: 79 }, { high: 0, low: 0 }]) {
        conformBase(base, undefined, elevation)
        for (const [mesh, normals] of original) {
          const current = mesh.geometry.getAttribute('normal').array
          for (let i = 0; i < current.length; i++) assert.ok(Math.abs(current[i] - normals[i]) < 1e-6, `${kind} ${mesh.name} normal component ${i}`)
        }
      }
    } finally { disposeModel(base) }
  }
})

test('grounding updates a sloped skirt without flattening the smooth geometry in its batch', () => {
  const root = new T.Group(); root.name = 'AIRFIELD'; root.userData.tier = 1
  const skirt = computeAngleNormals(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute([
    0,0,-.5, 2,0,-.5, 2,1,0, 0,0,-.5, 2,1,0, 0,1,0,
  ], 3)))
  const pole = new T.CylinderGeometry(.5, .5, 3, 16).toNonIndexed().rotateX(Math.PI / 2).translate(5, 0, 2)
  const mesh = new T.Mesh(T.mergeGeometries([skirt, pole]), new T.MeshStandardMaterial()); root.add(mesh)
  const before = new Float32Array(mesh.geometry.getAttribute('normal').array)
  skirt.dispose(); pole.dispose()
  try {
    conformBase(root, undefined, { high: 8, low: 0 })
    const positions = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal')
    const edge = new T.Vector3().fromBufferAttribute(positions, 2).sub(new T.Vector3().fromBufferAttribute(positions, 0)).normalize()
    for (let i = 0; i < 6; i++) {
      const normal = new T.Vector3().fromBufferAttribute(normals, i)
      assert.ok(Math.abs(normal.dot(edge)) < 1e-6, 'the skirt normal follows the deformed plane')
      assert.ok(Math.abs(normal.z - before[2]) > .5, 'the skirt normal changes with its slope')
    }
    assert.deepEqual(Array.from(normals.array.slice(18)), Array.from(before.slice(18)), 'the merged pole retains every authored normal')
    const grounded = Array.from(normals.array)
    conformBase(root, undefined, { high: 8, low: 0 })
    assert.deepEqual(Array.from(mesh.geometry.getAttribute('normal').array), grounded)
  } finally { disposeModel(root) }
})
