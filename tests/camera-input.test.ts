import test from 'node:test'
import assert from 'node:assert/strict'
import { orbitViewFromDrag } from '../lib/game/camera-input'

test('right drag follows grab-style camera orbit directions', () => {
  assert.deepEqual(orbitViewFromDrag({ bearing: 20, pitch: 45 }, 40, 20), { bearing: 6, pitch: 40 })
  assert.deepEqual(orbitViewFromDrag({ bearing: 20, pitch: 45 }, -40, -20), { bearing: 34, pitch: 50 })
})

test('right drag respects the configured pitch limits', () => {
  assert.equal(orbitViewFromDrag({ bearing: 0, pitch: 10 }, 0, 100).pitch, 0)
  assert.equal(orbitViewFromDrag({ bearing: 0, pitch: 70 }, 0, -100, 72).pitch, 72)
})
