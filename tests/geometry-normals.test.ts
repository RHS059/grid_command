import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import { computeAngleNormals } from '../lib/game/geometry-normals'
import * as T from '../lib/game/scene-data'

/** Two quads hinged about the Y axis; their face normals meet at exactly `degrees`. */
function hinge(degrees: number) {
  const radians = degrees * Math.PI / 180, x = Math.cos(radians), z = Math.sin(radians)
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [...a, ...b, ...c, ...a, ...c, ...d]
  const vertices = [
    ...quad([-1, 0, 0], [0, 0, 0], [0, 1, 0], [-1, 1, 0]),
    ...quad([0, 0, 0], [x, 0, z], [x, 1, z], [0, 1, 0]),
  ]
  return new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(vertices, 3))
}

/**
 * How many distinct normals each corner position on the hinge line (x = 0) ends up with.
 * One means the two faces share a normal there; two means the edge split. Positions are
 * kept apart because area-weighted fans legitimately differ between the two hinge vertices.
 */
function hingeSplits(geometry: T.BufferGeometry) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal')
  const byPosition = new Map<string, Set<string>>()
  for (let i = 0; i < positions.count; i++) {
    // The hinge line itself is x = 0, z = 0; at 90 degrees the far edge of the second
    // quad also lands on x = 0 and must not be counted as a hinge corner.
    if (Math.abs(positions.getX(i)) > 1e-9 || Math.abs(positions.getZ(i)) > 1e-9) continue
    const key = positions.getY(i).toFixed(4)
    const found = byPosition.get(key) || new Set<string>()
    found.add([normals.getX(i), normals.getY(i), normals.getZ(i)].map(value => value.toFixed(4)).join(','))
    byPosition.set(key, found)
  }
  return [...byPosition.values()].map(found => found.size)
}

test('faces meeting at or under 30 degrees smooth, sharper ones split', () => {
  for (const degrees of [0, 1, 15, 29, 30]) assert.deepEqual(new Set(hingeSplits(computeAngleNormals(hinge(degrees)))), new Set([1]), `${degrees} degrees should smooth`)
  for (const degrees of [31, 45, 90, 120]) assert.deepEqual(new Set(hingeSplits(computeAngleNormals(hinge(degrees)))), new Set([2]), `${degrees} degrees should stay hard`)
})

test('a split edge keeps each face\'s own normal, a smoothed one blends them', () => {
  const hard = computeAngleNormals(hinge(45)), positions = hard.getAttribute('position'), hardNormals = hard.getAttribute('normal')
  const hinged = new Set<string>()
  for (let i = 0; i < positions.count; i++) if (Math.abs(positions.getX(i)) < 1e-9 && Math.abs(positions.getZ(i)) < 1e-9) hinged.add([hardNormals.getX(i), hardNormals.getZ(i)].map(value => value.toFixed(4)).join(','))
  assert.deepEqual(hinged, new Set(['0.0000,1.0000', `${(-Math.SQRT1_2).toFixed(4)},${Math.SQRT1_2.toFixed(4)}`]), 'a hard edge uses the two flat face normals')

  const smoothed = computeAngleNormals(hinge(30)), smoothPositions = smoothed.getAttribute('position'), normals = smoothed.getAttribute('normal')
  let index = 0
  while (Math.abs(smoothPositions.getX(index)) > 1e-9 || Math.abs(smoothPositions.getZ(index)) > 1e-9) index++
  const x = normals.getX(index), y = normals.getY(index), z = normals.getZ(index)
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-4, 'normals stay unit length')
  assert.ok(x < 0 && z > 0 && x > -Math.sin(Math.PI / 6), 'the shared normal lies between the two faces')
  // Corners away from the hinge keep their own flat face normal.
  for (let i = 0; i < smoothPositions.count; i++) if (smoothPositions.getX(i) < -.5) assert.ok(Math.abs(normals.getZ(i) - 1) < 1e-6)
})

test('a cube keeps six flat faces and coplanar triangles stay continuous', () => {
  const cube = computeAngleNormals(new T.BoxGeometry(1, 1, 1).toNonIndexed()), normals = cube.getAttribute('normal')
  for (let i = 0; i < normals.count; i++) {
    const axes = [normals.getX(i), normals.getY(i), normals.getZ(i)].map(Math.abs).sort((a, b) => b - a)
    assert.ok(Math.abs(axes[0] - 1) < 1e-6 && axes[1] < 1e-6, 'every cube corner normal stays axis aligned')
  }
  assert.deepEqual(new Set(hingeSplits(computeAngleNormals(hinge(0)))), new Set([1]), 'coplanar faces share one normal')
})

test('a cylinder keeps smooth sides and hard caps through a transform', () => {
  // Babylon authors correct cylinder normals already; transforming must preserve them
  // rather than regenerating flat ones.
  const cylinder = new T.CylinderGeometry(1, 1, 2, 16).toNonIndexed()
  const before = Array.from(cylinder.getAttribute('normal').array)
  cylinder.translate(3, 0, 0)
  const after = cylinder.getAttribute('normal').array
  for (let i = 0; i < before.length; i++) assert.ok(Math.abs(before[i] - after[i]) < 1e-6, 'translation leaves normals unchanged')
  const capNormals = Array.from({ length: cylinder.getAttribute('position').count }, (_, i) => cylinder.getAttribute('normal').getY(i)).filter(value => Math.abs(value) > .99)
  assert.ok(capNormals.length > 0, 'caps keep their own axial normals rather than blending into the wall')
})

test('shared positions without a shared edge do not smooth together', () => {
  // Two quads meeting at a single line of coincident vertices but wound as separate,
  // disconnected shells: position coincidence alone must not weld their shading.
  const strip = (offset: number) => [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0].map((value, index) => index % 3 === 2 ? value + offset : value)
  const vertices = [...strip(0), 0, 0, 0, 0, 0, 1, 1, 0, 1]
  const geometry = computeAngleNormals(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(vertices, 3)))
  const normals = geometry.getAttribute('normal')
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(Math.abs(normals.getZ(i)) - 1) < 1e-6, 'the flat quad keeps its own plane normal')
})

test('degenerate and non-manifold input still produces finite normals', () => {
  const vertices = [
    0, 0, 0, 1, 0, 0, 1, 1, 0, // ordinary triangle
    2, 2, 2, 2, 2, 2, 2, 2, 2, // zero area
    0, 0, 0, 1, 0, 0, 0, 0, 1, // third face on the same edge: non-manifold
    0, 0, 0, 1, 0, 0, 0, 0, -1,
  ]
  const geometry = computeAngleNormals(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(vertices, 3)))
  const normals = geometry.getAttribute('normal')
  for (let i = 0; i < normals.array.length; i++) assert.ok(Number.isFinite(normals.array[i]))
})

test('transforms carry normals with the inverse transpose, not a naive rotation', () => {
  const tilted = computeAngleNormals(hinge(0))
  tilted.rotateZ(Math.PI / 2)
  let normals = tilted.getAttribute('normal')
  for (let i = 0; i < normals.count; i++) assert.ok(Math.abs(normals.getZ(i) - 1) < 1e-6, 'rotating about the plane normal leaves it alone')
  const plane = computeAngleNormals(hinge(45))
  plane.scale(1, 1, 4)
  normals = plane.getAttribute('normal')
  for (let i = 0; i < normals.count; i++) {
    assert.ok(Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < 1e-6, 'normals stay unit length under non-uniform scale')
    assert.ok(Number.isFinite(normals.getX(i)))
  }
  // A non-uniform scale must actually tilt the 45 degree face's normal differently than the
  // positions moved: naive transformation would leave it at 45 degrees.
  const tiltedFace = Array.from({ length: normals.count }, (_, i) => normals.getX(i)).find(value => Math.abs(value) > 1e-6)!
  assert.ok(Math.abs(Math.abs(tiltedFace) - Math.SQRT1_2) > 1e-3)
})

test('merged geometry keeps its normal channel', () => {
  const merged = T.mergeGeometries([computeAngleNormals(hinge(10)), computeAngleNormals(hinge(90))])
  const normals = merged.getAttribute('normal')
  assert.equal(normals.count, merged.getAttribute('position').count)
  for (let i = 0; i < normals.count; i++) assert.ok(Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < 1e-4)
})

test('replacing a normal buffer uploads even though the new buffer starts at version 0', () => {
  const engine = new NullEngine()
  const runtime = new (BabylonRuntime as unknown as new (canvas: HTMLCanvasElement, engine: NullEngine) => BabylonRuntime)({ dataset: {} } as HTMLCanvasElement, engine)
  try {
    const root = new T.Scene(), geometry = new T.BoxGeometry(1, 1, 1).toNonIndexed()
    const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial()); mesh.name = 'subject'; root.add(mesh)
    runtime.sync(root)
    const native = runtime.scene.meshes.find(item => item.name === 'subject')!
    const before = Array.from(native.getVerticesData('normal')!)
    const replacement = new Float32Array(geometry.getAttribute('position').count * 3)
    for (let i = 0; i < replacement.length; i += 3) replacement.set([0, 0, 1], i)
    geometry.setAttribute('normal', new T.BufferAttribute(replacement, 3))
    assert.equal(geometry.getAttribute('normal').version, 0, 'the replacement really is a fresh version 0 buffer')
    runtime.sync(root)
    const after = Array.from(runtime.scene.meshes.find(item => item.name === 'subject')!.getVerticesData('normal')!)
    assert.notDeepEqual(after, before)
    assert.deepEqual(after.slice(0, 3), [0, 0, 1])
  } finally { runtime.dispose() }
})
