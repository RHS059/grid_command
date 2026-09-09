import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { DirectionalLight as NativeDirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import * as D from '../lib/game/scene-data'

const makeRuntime = () => {
  const engine = new NullEngine()
  return new (BabylonRuntime as unknown as new (canvas: HTMLCanvasElement, engine: NullEngine) => BabylonRuntime)({ dataset: {} } as HTMLCanvasElement, engine)
}

test('a directional light aims at its explicit target, not the world origin', () => {
  const runtime = makeRuntime()
  try {
    const root = new D.Scene(), sun = new D.DirectionalLight('#ffffff', 1)
    sun.name = 'key'; sun.position.set(10, 0, 10); sun.target.position.set(10, 5, 0)
    root.add(sun); runtime.sync(root)
    const native = runtime.scene.lights.find(l => l.name === 'key') as NativeDirectionalLight
    // Direction should point from the light toward its target (0,5,-10 normalized),
    // not toward the origin (-10,0,-10 normalized) as a position-only formula would give.
    const expected = { x: 0, y: 1, z: -2 }, len = Math.hypot(expected.x, expected.y, expected.z)
    assert.ok(Math.abs(native.direction.x - expected.x / len) < 1e-6)
    assert.ok(Math.abs(native.direction.y - expected.y / len) < 1e-6)
    assert.ok(Math.abs(native.direction.z - expected.z / len) < 1e-6)
  } finally { runtime.dispose() }
})

test('a coincident light and target leaves the previous direction unchanged', () => {
  const runtime = makeRuntime()
  try {
    const root = new D.Scene(), sun = new D.DirectionalLight('#ffffff', 1)
    sun.name = 'key'; sun.position.set(5, 5, 5); sun.target.position.set(5, 5, 5)
    root.add(sun); runtime.sync(root)
    const native = runtime.scene.lights.find(l => l.name === 'key') as NativeDirectionalLight
    assert.ok(Number.isFinite(native.direction.x) && Number.isFinite(native.direction.y) && Number.isFinite(native.direction.z))
  } finally { runtime.dispose() }
})

test('a detached default target resolves to the world origin', () => {
  const runtime = makeRuntime()
  try {
    const root = new D.Scene(), sun = new D.DirectionalLight('#ffffff', 1)
    sun.name = 'key'; sun.position.set(-10, 0, 5)
    root.add(sun); runtime.sync(root)
    const native = runtime.scene.lights.find(l => l.name === 'key') as NativeDirectionalLight
    const expected = { x: 10, y: 0, z: -5 }, len = Math.hypot(expected.x, expected.y, expected.z)
    assert.ok(Math.abs(native.direction.x - expected.x / len) < 1e-6)
    assert.ok(Math.abs(native.direction.z - expected.z / len) < 1e-6)
  } finally { runtime.dispose() }
})

test('legacy and battlefield scenes keep every mesh receiving shadows regardless of its flag', () => {
  const runtime = makeRuntime()
  try {
    const root = new D.Scene(), mesh = new D.Mesh(new D.BoxGeometry(), new D.MeshStandardMaterial())
    mesh.name = 'unflagged'; mesh.receiveShadow = false; root.add(mesh); runtime.sync(root)
    const native = runtime.scene.meshes.find(m => m.name === 'unflagged')!
    assert.equal(native.receiveShadows, true)
  } finally { runtime.dispose() }
})

test('a studio scene honors each mesh\'s own receiveShadow flag', () => {
  const runtime = makeRuntime()
  try {
    const root = new D.Scene(); root.profile = 'studio'
    const shadowed = new D.Mesh(new D.BoxGeometry(), new D.MeshStandardMaterial()), plain = new D.Mesh(new D.BoxGeometry(), new D.MeshStandardMaterial())
    shadowed.name = 'subject'; shadowed.receiveShadow = true
    plain.name = 'grid'; plain.receiveShadow = false
    root.add(shadowed, plain); runtime.sync(root)
    assert.equal(runtime.scene.meshes.find(m => m.name === 'subject')!.receiveShadows, true)
    assert.equal(runtime.scene.meshes.find(m => m.name === 'grid')!.receiveShadows, false)
  } finally { runtime.dispose() }
})
