import test from 'node:test'
import assert from 'node:assert/strict'
import { withStartupDeadline } from '../lib/game/startup-deadline'

test('startup deadline returns an operation that completes in time', async () => {
  assert.equal(await withStartupDeadline(Promise.resolve('ready'), 50, 'graphics'), 'ready')
})

test('startup deadline rejects a stalled operation so compatibility rendering can start', async () => {
  const stalled = new Promise<never>(() => undefined)
  await assert.rejects(withStartupDeadline(stalled, 5, 'WebGPU startup'), /WebGPU startup timed out after 5ms/)
})

test('startup deadline cleans up an operation that completes after fallback', async () => {
  let finish!: () => void
  const operation = new Promise<void>(resolve => { finish = resolve })
  let cleaned = false
  await assert.rejects(withStartupDeadline(operation, 5, 'WebGPU startup', () => { cleaned = true }))
  assert.equal(cleaned, false)
  finish()
  await operation
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(cleaned, true)
})
