import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from '../lib/game/scene-data'
import { BASE_GRADE_CLEARANCE, baseSurfaceElevation, createBase, groundBase, type BaseGrounding } from '../lib/game/base-models'
import { disposeModel } from '../lib/game/aircraft-models'
import { INSTALLATION_EXCLUSIONS, INSTALLATION_MARGIN, installationFootprint } from '../lib/game/installation-footprints'
import { buildGeographicBatches, type GeographicLayers } from '../lib/game/geo-tile-geometry'
import { CITY_AIRBASES, CITY_BASES } from '../lib/game/theater'

test('the map reserves both MOB yards and the full planned airfield footprints', () => {
  for (const side of ['BLU', 'RED'] as const) for (const kind of ['MOB', 'AIRFIELD'] as const) {
    const point = kind === 'MOB' ? CITY_BASES[side] : CITY_AIRBASES[side]
    const bounds = installationFootprint(kind, 3, point), exclusion = installationFootprint(kind, 3, point, INSTALLATION_MARGIN)
    assert.ok(INSTALLATION_EXCLUSIONS.some(value => JSON.stringify(value) === JSON.stringify(exclusion)))
    assert.equal(exclusion.minX, bounds.minX - INSTALLATION_MARGIN)
    assert.equal(exclusion.maxY, bounds.maxY + INSTALLATION_MARGIN)
    const width = exclusion.maxX - exclusion.minX, height = exclusion.maxY - exclusion.minY
    const positions = [exclusion.minX, exclusion.maxY, 5, exclusion.maxX, exclusion.maxY, 5, exclusion.minX, exclusion.minY, 5, exclusion.maxX, exclusion.minY, 5]
    const layers: GeographicLayers = { building: { extent: 100, length: 1, feature: () => ({ type: 3, properties: {}, loadGeometry: () => [[{ x: 2, y: 2 }, { x: 98, y: 2 }, { x: 98, y: 98 }, { x: 2, y: 98 }]] }) } }
    assert.ok(width > 0 && height > 0)
    const batches = buildGeographicBatches(layers, { positions, resolution: 1 })
    assert.equal(batches.buildings.indices.length, 0)
    assert.equal(batches.edges.indices.length, 0)
  }
})

test('base floor tops use the same datum as the grounded model in all tiers', () => {
  for (const kind of ['MOB', 'AIRFIELD'] as const) for (const tier of [1, 2, 3] as const) {
    const model = createBase(kind, 'BLU', tier), slab = model.getObjectByName(`${kind}-2`) as T.Mesh
    try {
      const positions = slab.geometry.getAttribute('position'), floor: number[] = []
      for (let i = 0; i < positions.count; i++) if (Math.abs(positions.getZ(i)) < 1e-6) floor.push(i)
      assert.ok(floor.length > 0)
      const base: BaseGrounding = { model, point: { x: 0, y: 0 } }
      for (const height of [0, 37, -12]) {
        groundBase(base, true, height, () => ({ high: height, low: height - 9 }))
        for (const index of floor) assert.ok(Math.abs(positions.getZ(index) - height - BASE_GRADE_CLEARANCE) < 1e-5)
        assert.ok(baseSurfaceElevation(kind, base.elevation!) >= height + BASE_GRADE_CLEARANCE)
      }
    } finally { disposeModel(model) }
  }
})

test('replacement terrain updates the base grade and unchanged terrain preserves it', () => {
  const base: BaseGrounding = { model: createBase('AIRFIELD', 'BLU'), point: CITY_AIRBASES.BLU }
  try {
    let reads = 0
    groundBase(base, true, 1, bounds => { reads++; assert.deepEqual(bounds, installationFootprint('AIRFIELD', 3, base.point)); return { high: 12, low: 3 } })
    assert.equal(base.model.userData.platformHeight, 12 + BASE_GRADE_CLEARANCE)
    groundBase(base, true, 1, () => { reads++; return { high: 99, low: 3 } })
    assert.equal(reads, 1)
    groundBase(base, true, 2, () => undefined)
    assert.equal(base.terrainRevision, 1, 'an incomplete replacement remains eligible for another range query')
    groundBase(base, true, 2, () => ({ high: 28, low: 4 }))
    assert.equal(base.model.userData.platformHeight, 28 + BASE_GRADE_CLEARANCE)
    assert.equal(baseSurfaceElevation('AIRFIELD', base.elevation!), 28 + BASE_GRADE_CLEARANCE + .08)
    groundBase(base, false, 3, () => { throw new Error('flat mode does not need terrain') })
    assert.equal(base.model.userData.platformHeight, BASE_GRADE_CLEARANCE)
    groundBase(base, true, 4, () => ({ high: 9, low: -2 }))
    assert.equal(base.model.userData.platformHeight, 9 + BASE_GRADE_CLEARANCE)
  } finally { disposeModel(base.model) }
})
