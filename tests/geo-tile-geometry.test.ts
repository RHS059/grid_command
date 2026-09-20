import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { buildGeographicBatches, geographicPolygons, GEOGRAPHIC_PALETTE, selectGeographicLabels, type GeographicBatch, type GeographicLayers, type TilePoint, type TileTerrain } from '../lib/game/geo-tile-geometry'
import { GeographicTiles, terrainTriangleHeightAt } from '../lib/game/geo-tiles'

const ring = (left: number, top: number, right: number, bottom: number): TilePoint[] => [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }, { x: left, y: top }]
const layer = (paths: TilePoint[][][], type = 3, properties: Record<string, string | number | boolean> = {}): GeographicLayers[string] => ({
  extent: 100, length: paths.length, feature: index => ({ type, properties, loadGeometry: () => paths[index] }),
})
function terrain(resolution = 1, height: (x: number, y: number) => number = () => 0): TileTerrain {
  const positions: number[] = []
  for (let row = 0; row <= resolution; row++) for (let col = 0; col <= resolution; col++) {
    const x = col * 100 / resolution, y = 100 - row * 100 / resolution
    positions.push(x, y, height(x, y))
  }
  return { resolution, positions }
}
function area(batch: GeographicBatch) {
  let result = 0
  for (let i = 0; i < batch.indices.length; i += 3) {
    const [a, b, c] = batch.indices.slice(i, i + 3).map(index => index * 3), p = batch.positions
    const signed = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a])
    assert.ok(signed > 0, 'surface triangles face upward and have nonzero area')
    result += signed / 2
  }
  return result
}
function checkGeometry(batch: GeographicBatch) {
  assert.ok(batch.positions.every(Number.isFinite))
  assert.ok(batch.indices.every(index => Number.isInteger(index) && index >= 0 && index < batch.positions.length / 3))
  assert.equal(batch.indices.length % 3, 0)
  const normals: number[] = []
  VertexData.ComputeNormals(batch.positions, batch.indices, normals, { useRightHandedSystem: true })
  assert.ok(normals.every(Number.isFinite))
  for (let i = 0; i < batch.positions.length; i += 3) {
    assert.ok(batch.positions[i] >= -1e-6 && batch.positions[i] <= 100 + 1e-6, 'buffered vector features are clipped at the tile edge')
    assert.ok(batch.positions[i + 1] >= -1e-6 && batch.positions[i + 1] <= 100 + 1e-6)
  }
}

test('water keeps island holes and independent polygons without filling gaps or tile buffers', () => {
  const paths = [ring(-10, -10, 70, 110), ring(20, 20, 40, 40).reverse(), ring(80, 20, 95, 40)]
  assert.deepEqual(geographicPolygons(paths).map(polygon => polygon.length), [2, 1])
  const batch = buildGeographicBatches({ water: layer([paths]) }, terrain(2)).water
  assert.ok(Math.abs(area(batch) - (7000 - 400 + 300)) < 1e-6)
  checkGeometry(batch)
})

test('draped surfaces subdivide at the rendered terrain ridge instead of crossing through it', () => {
  const ground = terrain(2, (x, y) => x === 50 && y === 50 ? 40 : 0)
  const batches = buildGeographicBatches({ water: layer([[ring(0, 0, 100, 100)]]), transportation: layer([[ [{ x: -20, y: 50 }, { x: 120, y: 50 }] ]], 2) }, ground)
  assert.ok(Math.abs(area(batches.water) - 10000) < 1e-6)
  for (const [batch, lift] of [[batches.water, .08], [batches.roads, .16]] as const) {
    checkGeometry(batch)
    let peak = false
    for (let i = 0; i < batch.positions.length; i += 3) {
      const [x, y, z] = batch.positions.slice(i, i + 3)
      if (Math.abs(x - 50) < 1e-6 && Math.abs(y - 50) < 1e-6) { assert.ok(Math.abs(z - 40 - lift) < 1e-6); peak = true }
    }
    assert.ok(peak, 'a vertex must exist at the interior terrain peak')
    for (let i = 0; i < batch.indices.length; i += 3) {
      const vertices = batch.indices.slice(i, i + 3).map(index => ({ x: batch.positions[index * 3], y: batch.positions[index * 3 + 1], z: batch.positions[index * 3 + 2] }))
      const midpoint = { x: vertices.reduce((sum, p) => sum + p.x, 0) / 3, y: vertices.reduce((sum, p) => sum + p.y, 0) / 3 }, z = vertices.reduce((sum, p) => sum + p.z, 0) / 3
      const sourceVertex = (index: number) => ({ x: ground.positions[index * 3], y: ground.positions[index * 3 + 1], z: ground.positions[index * 3 + 2] })
      const heights: number[] = []
      for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
        const a = row * 3 + col
        for (const [j, k, l] of [[a, a + 3, a + 1], [a + 1, a + 3, a + 4]]) {
          const height = terrainTriangleHeightAt(sourceVertex(j), sourceVertex(k), sourceVertex(l), midpoint)
          if (height !== undefined) heights.push(height)
        }
      }
      assert.ok(heights.some(height => Math.abs(z - height - lift) < 1e-6), 'every overlay triangle follows its underlying terrain plane')
    }
  }
})

test('road ribbons remain continuous at turns and keep highways separate from ordinary roads', () => {
  const path = [{ x: -10, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 110 }]
  const ordinary = buildGeographicBatches({ transportation: layer([[path]], 2) }, terrain())
  const major = buildGeographicBatches({ transportation: layer([[path]], 2, { class: 'motorway' }) }, terrain())
  assert.ok(Math.abs(area(ordinary.roads) - 500) < 1e-6, 'joined two-leg road covers its full five-metre-wide ribbon')
  assert.ok(area(major.highways) > area(ordinary.roads))
  assert.equal(ordinary.highways.indices.length, 0)
  assert.equal(major.roads.indices.length, 0)
  checkGeometry(ordinary.roads); checkGeometry(major.highways)
  assert.equal(buildGeographicBatches({ transportation: layer([[path]], 2, { brunnel: 'tunnel' }) }, terrain()).roads.indices.length, 0)
})

test('building masses have grounded wall bottoms, level roofs and distinct cyan edge geometry', () => {
  const batches = buildGeographicBatches({ building: layer([[ring(20, 20, 40, 40)]], 3, { render_height: 12, render_min_height: 2 }) }, terrain(2, x => x / 5))
  checkGeometry(batches.buildings); checkGeometry(batches.edges)
  const positions = batches.buildings.positions
  assert.equal(Math.max(...positions.filter((_, i) => i % 3 === 2)), 20)
  assert.equal(Math.min(...positions.filter((_, i) => i % 3 === 2)), 6)
  assert.equal(batches.buildings.colors.length, positions.length / 3 * 4)
  assert.deepEqual(batches.buildings.colors.slice(0, 3).map(channel => Math.round(Math.pow(channel, 1 / 2.2) * 255)), [27, 44, 122], 'linear vertex colors display as the authored dark indigo roof')
  const baseVertex = positions.findIndex((z, i) => i % 3 === 2 && z === 6)
  assert.deepEqual(batches.buildings.colors.slice((baseVertex - 2) / 3 * 4, (baseVertex - 2) / 3 * 4 + 3).map(channel => Math.round(Math.pow(channel, 1 / 2.2) * 255)), [15, 21, 48], 'wall bases retain their authored deep navy')
  assert.ok(batches.edges.indices.length > 0)
  assert.ok(batches.edges.positions.some((z, i) => i % 3 === 2 && Math.abs(z - 20.035) < 1e-6), 'roof outlines sit above the roof')
  assert.ok(batches.edges.positions.some((z, i) => i % 3 === 2 && z < 6), 'footprint outlines follow the terrain')
})

test('hundreds of buildings still produce one mass batch and one perimeter batch', () => {
  const paths = Array.from({ length: 400 }, (_, i) => [ring((i % 20) * 5 + 1, Math.floor(i / 20) * 5 + 1, (i % 20) * 5 + 3, Math.floor(i / 20) * 5 + 3)])
  const batches = buildGeographicBatches({ building: layer(paths) }, terrain(24))
  assert.deepEqual(Object.entries(batches).filter(([, batch]) => batch.indices.length).map(([name]) => name), ['buildings', 'edges'])
  assert.ok(batches.buildings.positions.length / 3 < 400 * 30)
  checkGeometry(batches.buildings); checkGeometry(batches.edges)
})

test('empty and degenerate features create no drawable geometry', () => {
  const batches = buildGeographicBatches({ water: layer([[[], [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]]]), transportation: layer([[ [{ x: 0, y: 0 }, { x: 0, y: 0 }] ]], 2) }, terrain())
  assert.ok(Object.values(batches).every(batch => batch.indices.length === 0))
})

test('place labels favor important names, avoid overlap and cap the per-tile count', () => {
  const places = Array.from({ length: 9 }, (_, i) => ({ text: `Town ${i}`, rank: i + 1, point: { x: 15 + i % 3 * 35, y: 15 + Math.floor(i / 3) * 35 } }))
  places.push({ text: 'Unimportant overlapping name', rank: 12, point: { x: 15, y: 15 } })
  places.push({ text: 'Outside tile', rank: 1, point: { x: -10, y: 50 } })
  const source: GeographicLayers[string] = { extent: 100, length: places.length, feature: i => ({ type: 1, properties: { name: places[i].text, rank: places[i].rank }, loadGeometry: () => [[places[i].point]] }) }
  assert.deepEqual(selectGeographicLabels(source, 14).map(label => label.text), places.slice(0, 8).map(place => place.text))
  assert.deepEqual(selectGeographicLabels(source, 7).map(label => label.rank), [1, 2, 3, 4, 5])
  assert.deepEqual(selectGeographicLabels(undefined, 14), [])
})

test('tile meshes share materials and cache disposal frees every shared resource', () => {
  const engine = new NullEngine(), scene = new Scene(engine), tiles = new GeographicTiles(scene, () => {})
  try {
    const internals = tiles as unknown as { material(kind: keyof typeof GEOGRAPHIC_PALETTE): PBRMaterial; featureMesh(name: string, batch: GeographicBatch, material: unknown): unknown; tiles: Map<string, unknown> }
    for (const kind of Object.keys(GEOGRAPHIC_PALETTE) as (keyof typeof GEOGRAPHIC_PALETTE)[]) {
      assert.equal(internals.material(kind).albedoColor.toGammaSpace().toHexString().toLowerCase(), GEOGRAPHIC_PALETTE[kind], `${kind} uses linear albedo that displays the authored sRGB palette`)
    }
    const material = internals.material('water')
    assert.equal(internals.material('water'), material)
    const batch = buildGeographicBatches({ water: layer([[ring(0, 0, 100, 100)]]) }, terrain()).water
    const mesh = internals.featureMesh('first', batch, material), feature = internals.featureMesh('second', batch, material)
    internals.tiles.set('tile', { mesh, features: [feature] })
    assert.equal(scene.materials.length, Object.keys(GEOGRAPHIC_PALETTE).length)
    tiles.dispose()
    assert.equal(scene.meshes.length, 0)
    assert.equal(scene.materials.length, 0)
  } finally { tiles.dispose(); scene.dispose(); engine.dispose() }
})
