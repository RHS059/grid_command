import test from 'node:test'
import assert from 'node:assert/strict'
import { BATTLE_BUILDINGS_ENABLED, loadBattleGeometry } from '../lib/game/geometry-loader'

test('disabled buildings skip the catalog fetch and still provide ready navigation coverage', async () => {
  assert.equal(BATTLE_BUILDINGS_ENABLED, false)
  const originalFetch = globalThis.fetch
  let fetched = false
  globalThis.fetch = (async () => { fetched = true; throw new Error('building catalog must not load') }) as typeof fetch
  const packets: Parameters<Parameters<typeof loadBattleGeometry>[0]>[0][] = []
  let cancel = () => {}
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('empty geometry did not become ready')), 2000)
      cancel = loadBattleGeometry(packet => packets.push(packet), status => {
        if (status === 'Building loading disabled') { clearTimeout(timeout); resolve() }
      })
    })
  } finally {
    cancel()
    globalThis.fetch = originalFetch
  }
  assert.equal(fetched, false)
  assert.ok(packets.length > 0)
  assert.ok(packets.every(packet => packet.complete && packet.features.length === 0))
})
