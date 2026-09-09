import test from 'node:test'
import assert from 'node:assert/strict'
import { MercatorCoordinate, tileAt, tileURL } from '../lib/game/geography'
import { ORIGIN, fromPoint, toPoint } from '../lib/game/theater'
import { geographicTileUV, uploadGeographicTexture } from '../lib/game/geo-tiles'

test('San Diego battlefield coordinates round-trip through local map space', () => {
  const locations: [number, number][] = [ORIGIN, [-117.23, 32.525], [-116.91, 33.12]]
  for (const [longitude, latitude] of locations) {
    const result = fromPoint(toPoint(longitude, latitude))
    assert.ok(Math.abs(result[0] - longitude) < 1e-9)
    assert.ok(Math.abs(result[1] - latitude) < 1e-9)
  }
})

test('local map axes point east and north', () => {
  const origin = toPoint(...ORIGIN)
  const east = toPoint(ORIGIN[0] + .01, ORIGIN[1])
  const north = toPoint(ORIGIN[0], ORIGIN[1] + .01)
  assert.ok(east.x > origin.x)
  assert.ok(north.y > origin.y)
})

test('tile addressing and URL substitution use standard Web Mercator rows', () => {
  const address = tileAt(ORIGIN, 10)
  const coordinate = MercatorCoordinate.fromLngLat(ORIGIN)
  assert.deepEqual(address, { z: 10, x: Math.floor(coordinate.x * 1024), y: Math.floor(coordinate.y * 1024) })
  assert.equal(tileURL('https://tiles.example/{z}/{x}/{y}.pbf', address), `https://tiles.example/10/${address.x}/${address.y}.pbf`)
})

test('painted geographic canvas is uploaded with north at the top of the tile', () => {
  const updates: unknown[][] = []
  uploadGeographicTexture({ update: (...arguments_: unknown[]) => { updates.push(arguments_) } })
  assert.deepEqual(updates, [[true]], 'the painted canvas must be copied to the GPU with its Y axis inverted')
  assert.deepEqual(geographicTileUV(0, 0, 24), [0, 1], 'the north-west canvas corner maps to the top-left mesh vertex')
  assert.deepEqual(geographicTileUV(24, 24, 24), [1, 0], 'the south-east canvas corner maps to the bottom-right mesh vertex')
})
