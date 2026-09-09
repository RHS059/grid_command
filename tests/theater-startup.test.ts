import test from 'node:test'
import assert from 'node:assert/strict'
import { theaterStartupDisplay } from '../lib/game/theater-startup'

test('startup names graphics work while buildings are disabled', () => {
  const display = theaterStartupDisplay({ graphicsReady: false, geometry: { done: 4, total: 12, phase: 'discovering' } }, false)
  assert.equal(display.heading, 'STARTING GRAPHICS')
  assert.match(display.detail, /Battlefield renderer/)
  assert.match(display.detail, /Navigation coverage 4 \/ 12/)
  assert.equal(display.percent, null)
})

test('building startup reports the active assessment and determinate progress', () => {
  const display = theaterStartupDisplay({ graphicsReady: true, geometry: { done: 30, total: 120, phase: 'assessing' } }, true)
  assert.equal(display.heading, 'ASSESSING BUILDINGS')
  assert.equal(display.detail, '30 / 120 buildings')
  assert.equal(display.percent, 25)
})
