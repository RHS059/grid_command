import assert from 'node:assert/strict'
import test from 'node:test'
import { MODEL_CATALOG } from '../lib/game/model-catalog'
import { MODEL_DIMENSIONS, modelScale, modelGridSpacing, visibleModelBounds } from '../lib/game/model-dimensions'
import { previewCameraMovement } from '../lib/game/graphics-preview'
import { Vector3, Group, Mesh, BoxGeometry } from '../lib/game/scene-data'

test('every production model has canonical metre dimensions', () => {
  for (const id of MODEL_CATALOG) assert.ok(MODEL_DIMENSIONS[id].metres > 0, id)
  assert.equal(modelScale('RIFLE', new Vector3(.5, 1, 1.7)), 1.8 / 1.7)
  assert.equal(modelScale('COMMAND', new Vector3(.5, 1.7, .6), 'y'), 1.85 / 1.7)
  assert.equal(modelScale('CARGO_PLANE', new Vector3(20, 30, 10)), 53 / 30)
  assert.equal(modelScale('TANK', new Vector3()), 1)
})

test('normalization is uniform and ignores hidden deployed geometry', () => {
  const root = new Group(), body = new Mesh(new BoxGeometry(2, 5, 3)), deployed = new Mesh(new BoxGeometry(2, 50, 30))
  root.add(body); root.add(deployed); deployed.visible = false
  const before = visibleModelBounds(root).getSize(new Vector3())
  assert.deepEqual(before.toArray(), [2, 5, 3])
  root.scale.setScalar(modelScale('TANK', before))
  const after = visibleModelBounds(root).getSize(new Vector3())
  assert.ok(Math.abs(after.y - 9.8) < 1e-5)
  assert.ok(Math.abs(after.x / after.y - 2 / 5) < 1e-6)
  assert.deepEqual([modelGridSpacing(1.8), modelGridSpacing(10), modelGridSpacing(332), modelGridSpacing(1200)], [1, 1, 10, 100])
})

test('WASD moves relative to the camera, diagonals stay normalized, Shift boosts speed', () => {
  const offset = new Vector3(0, 10, 0), up = new Vector3(0, 0, 1)
  const move = (...keys: string[]) => previewCameraMovement(new Set(keys), offset, up, .05)
  assert.ok(move('KeyW').y < 0)
  assert.ok(move('KeyD').x < 0)
  assert.equal(move('KeyW', 'KeyS').length(), 0)
  assert.ok(Math.abs(move('KeyW', 'KeyD').length() - move('KeyW').length()) < 1e-9)
  assert.ok(Math.abs(move('KeyW', 'ShiftLeft').length() / move('KeyW').length() - 3) < 1e-9)
  const rotated = previewCameraMovement(new Set(['KeyW']), new Vector3(10, 0, 0), up, .05)
  assert.ok(rotated.x < 0 && rotated.y === 0)
})

