import fs from 'node:fs/promises'
import path from 'node:path'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'

const SCHEMA = 1
const REGION = 'san-diego-theater'
const ZOOM = 13
const CELL = 4
const EARTH_CIRCUMFERENCE = 40075016.68557849
const ORIGIN = [-117.08, 32.82]
const CENTER = [-117.098, 32.832]
const BASES = [[-117.035, 32.546], [-117.005, 33.092]]
const AIRBASES = [[-117.026, 32.553], [-117.019, 33.084]]
const output = path.join(process.cwd(), 'public', 'san-diego-buildings.json')

const rad = value => value * Math.PI / 180
const mercator = ([lon, lat]) => ({ x: (lon + 180) / 360, y: (1 - Math.log(Math.tan(rad(lat)) + 1 / Math.cos(rad(lat))) / Math.PI) / 2 })
const originMercator = mercator(ORIGIN)
const meterScale = 1 / (EARTH_CIRCUMFERENCE * Math.cos(rad(ORIGIN[1])))
const toPoint = ([lon, lat]) => { const value = mercator([lon, lat]); return { x: (value.x - originMercator.x) / meterScale, y: (originMercator.y - value.y) / meterScale } }
const FACILITIES = [...BASES.map(value => ({ ...toPoint(value), width: 84, depth: 94 })), ...AIRBASES.map(value => ({ ...toPoint(value), width: 88, depth: 610 }))]
const centerPoint = toPoint(CENTER)
const radius = Math.max(...[...BASES, ...AIRBASES].map(value => { const p = toPoint(value); return Math.hypot(p.x - centerPoint.x, p.y - centerPoint.y) })) + 200
const tileX = lon => Math.floor((lon + 180) / 360 * 2 ** ZOOM)
const tileY = lat => Math.floor((1 - Math.log(Math.tan(rad(lat)) + 1 / Math.cos(rad(lat))) / Math.PI) / 2 * 2 ** ZOOM)
const tileLon = x => x / 2 ** ZOOM * 360 - 180
const tileLat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** ZOOM))) * 180 / Math.PI
const hash = value => { let result = 2166136261; for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619); return result >>> 0 }
const seed = key => `${String(hash(key)).padStart(10, '0')}${String(hash(`map:${key}`)).padStart(10, '0')}`.replace(/\D/g, '').slice(0, 16).padEnd(16, '0')
const pointInside = (p, ring) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if ((ring[i].y > p.y) !== (ring[j].y > p.y) && p.x < (ring[j].x - ring[i].x) * (p.y - ring[i].y) / (ring[j].y - ring[i].y) + ring[i].x) inside = !inside; return inside }
const featureValid = feature => feature && typeof feature.key === 'string' && Array.isArray(feature.rings) && feature.rings[0]?.length >= 4
const recordValid = record => record && typeof record.key === 'string' && Number.isFinite(record.x) && Number.isFinite(record.y) && Number.isFinite(record.rotation) && record.preset && typeof record.preset.id === 'string' && typeof record.preset.type === 'string' && Number.isInteger(record.preset.width) && record.preset.width > 0 && Number.isInteger(record.preset.depth) && record.preset.depth > 0 && Number.isInteger(record.preset.floors) && record.preset.floors > 0 && typeof record.preset.seed === 'string' && /^\d{16}$/.test(record.preset.seed)
async function fetchWithRetry(url, label) { let error; for (let attempt = 1; attempt <= 4; attempt++) try { const response = await fetch(url); if (!response.ok) throw new Error(`${label} failed: ${response.status}`); return response } catch (value) { error = value; if (attempt < 4) await new Promise(resolve => setTimeout(resolve, attempt * 1000)) } throw error }

function tilesForRegion() {
  const latitudeRadius = radius / 111320, longitudeRadius = radius / (111320 * Math.cos(rad(CENTER[1])))
  const minX = tileX(CENTER[0] - longitudeRadius), maxX = tileX(CENTER[0] + longitudeRadius)
  const minY = tileY(CENTER[1] + latitudeRadius), maxY = tileY(CENTER[1] - latitudeRadius), tiles = []
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
    const west = tileLon(x), east = tileLon(x + 1), north = tileLat(y), south = tileLat(y + 1)
    const nearest = toPoint([Math.max(west, Math.min(CENTER[0], east)), Math.max(south, Math.min(CENTER[1], north))])
    if (Math.hypot(nearest.x - centerPoint.x, nearest.y - centerPoint.y) <= radius) tiles.push({ x, y, key: `${ZOOM}/${x}/${y}` })
  }
  return tiles
}

async function writeCatalog(value) {
  const temporary = `${output}.tmp`
  await fs.writeFile(temporary, JSON.stringify(value))
  await fs.rename(temporary, output)
}

async function readCatalog(totalTiles) {
  try {
    const value = JSON.parse(await fs.readFile(output, 'utf8'))
    if (value.schema !== SCHEMA || value.region !== REGION || value.zoom !== ZOOM || typeof value.complete !== 'boolean' || !Array.isArray(value.records) || !Array.isArray(value.completedTiles)) throw new Error('invalid catalog header')
    if (value.complete && value.totalTiles === totalTiles && value.records.every(recordValid)) return value
    if (!value.complete && (!Array.isArray(value.sourceFeatures) || !value.sourceFeatures.every(featureValid))) throw new Error('invalid checkpoint')
    return { ...value, totalTiles, complete: false, records: [], sourceFeatures: value.sourceFeatures || [] }
  } catch {
    const fresh = { schema: SCHEMA, region: REGION, source: 'OpenFreeMap / OpenStreetMap', zoom: ZOOM, center: { longitude: CENTER[0], latitude: CENTER[1], ...centerPoint }, radius, complete: false, completedTiles: [], totalTiles, records: [], sourceFeatures: [] }
    await writeCatalog(fresh)
    return fresh
  }
}

function occupiedCells(feature) {
  const rings = feature.rings.map(ring => ring.map(toPoint)), outer = rings[0]
  const minX = Math.floor(Math.min(...outer.map(p => p.x)) / CELL), maxX = Math.floor(Math.max(...outer.map(p => p.x)) / CELL)
  const minY = Math.floor(Math.min(...outer.map(p => p.y)) / CELL), maxY = Math.floor(Math.max(...outer.map(p => p.y)) / CELL), cells = new Set()
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) { const p = { x: (x + .5) * CELL, y: (y + .5) * CELL }; if (pointInside(p, outer) && !rings.slice(1).some(hole => pointInside(p, hole))) cells.add(`${x},${y}`) }
  if (!cells.size) { const p = outer.reduce((sum, value) => ({ x: sum.x + value.x / outer.length, y: sum.y + value.y / outer.length }), { x: 0, y: 0 }); cells.add(`${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`) }
  return cells
}

function outline(cells) {
  const outgoing = new Map(), add = (x1, y1, x2, y2) => { const key = `${x1},${y1}`, list = outgoing.get(key) || []; list.push([x1, y1, x2, y2]); outgoing.set(key, list) }
  for (const key of cells) { const [x, y] = key.split(',').map(Number); if (!cells.has(`${x},${y - 1}`)) add(x, y, x + 1, y); if (!cells.has(`${x + 1},${y}`)) add(x + 1, y, x + 1, y + 1); if (!cells.has(`${x},${y + 1}`)) add(x + 1, y + 1, x, y + 1); if (!cells.has(`${x - 1},${y}`)) add(x, y + 1, x, y) }
  const unused = new Set([...outgoing.values()].flat().map(edge => edge.join(','))), loops = []
  while (unused.size) { const first = [...unused][0].split(',').map(Number), loop = [{ x: first[0] * CELL, y: first[1] * CELL }], maxSteps = unused.size + 4; let edge = first; for (let guard = 0; guard < maxSteps; guard++) { unused.delete(edge.join(',')); loop.push({ x: edge[2] * CELL, y: edge[3] * CELL }); if (edge[2] === first[0] && edge[3] === first[1]) break; const next = (outgoing.get(`${edge[2]},${edge[3]}`) || []).find(candidate => unused.has(candidate.join(','))); if (!next) break; edge = next } if (loop.length >= 4) loops.push(loop) }
  const area = ring => ring.reduce((sum, p, index) => { const next = ring[(index + 1) % ring.length]; return sum + p.x * next.y - next.x * p.y }, 0) / 2
  return loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))
}

function consolidate(features) {
  const parent = features.map((_, index) => index), cells = [], exact = new Map(), owner = new Map()
  const find = value => parent[value] === value ? value : (parent[value] = find(parent[value]))
  const join = (a, b) => { const aa = find(a), bb = find(b); if (aa !== bb) parent[bb] = aa }
  features.forEach((feature, index) => { const occupied = occupiedCells(feature), signature = [...occupied].sort().join('|'), duplicate = exact.get(signature); cells.push(occupied); if (duplicate !== undefined) join(index, duplicate); else exact.set(signature, index); for (const key of occupied) { const previous = owner.get(key); if (previous !== undefined) join(index, previous); else owner.set(key, index) } })
  const groups = new Map()
  features.forEach((feature, index) => { const root = find(index), group = groups.get(root) || { representative: features[root], cells: new Set() }; for (const key of cells[index]) group.cells.add(key); groups.set(root, group) })
  return [...groups.values()].map(group => ({ ...group.representative, localRings: outline(group.cells) })).filter(feature => feature.localRings.length)
}

function placedBuilding(feature) {
  const ring = feature.localRings[0]; let longest = 0, rotation = 0
  for (let i = 0; i < ring.length - 1; i++) { const dx = ring[i + 1].x - ring[i].x, dy = ring[i + 1].y - ring[i].y, length = Math.hypot(dx, dy); if (length > longest) { longest = length; rotation = Math.atan2(dy, dx) } }
  const cos = Math.cos(rotation), sin = Math.sin(rotation), projected = ring.map(({ x, y }) => ({ a: x * cos + y * sin, b: -x * sin + y * cos })), minA = Math.min(...projected.map(p => p.a)), maxA = Math.max(...projected.map(p => p.a)), minB = Math.min(...projected.map(p => p.b)), maxB = Math.max(...projected.map(p => p.b)), midA = (minA + maxA) / 2, midB = (minB + maxB) / 2
  const footprint = projected.slice(0, -1).map(p => ({ x: (p.a - midA) / CELL, y: (p.b - midB) / CELL })), rectangular = footprint.length === 4, types = ['industrial', 'commercial', 'residential-house', 'apartment', 'parking-garage', 'government'], type = types[hash(feature.key) % types.length]
  return { key: feature.key, x: midA * cos - midB * sin, y: midA * sin + midB * cos, rotation, elevation: 0, preset: { id: feature.key, name: feature.key, type, width: Math.max(1, Math.round((maxA - minA) / CELL)), depth: Math.max(1, Math.round((maxB - minB) / CELL)), floors: Math.max(1, Math.round(Math.max(3.2, (feature.roof || 6) - (feature.base || 0)) / 3.2)), seed: seed(feature.key), ...(rectangular ? {} : { footprint }), footprintMode: rectangular ? 'rectangle' : 'shape', slopedWalls: true } }
}

const tiles = tilesForRegion()
let catalog = await readCatalog(tiles.length)
if (catalog.complete) { console.log(`Building catalog ready: ${catalog.records.length} records`); process.exit(0) }
const completed = new Set(catalog.completedTiles), seen = new Set(catalog.sourceFeatures.map(feature => feature.key))
const tileJson = await fetchWithRetry('https://tiles.openfreemap.org/planet', 'TileJSON request').then(response => response.json())
const template = tileJson.tiles?.[0]
if (!template) throw new Error('OpenFreeMap TileJSON did not contain a tile URL')
for (let index = 0; index < tiles.length; index += 8) {
  const batch = tiles.slice(index, index + 8).filter(tile => !completed.has(tile.key))
  await Promise.all(batch.map(async tile => {
    const url = template.replace('{z}', ZOOM).replace('{x}', tile.x).replace('{y}', tile.y), response = await fetchWithRetry(url, `Building tile ${tile.key}`)
    const vector = new VectorTile(new Pbf(new Uint8Array(await response.arrayBuffer()))), layer = vector.layers.building
    if (layer) for (let featureIndex = 0; featureIndex < layer.length; featureIndex++) {
      const source = layer.feature(featureIndex), geo = source.toGeoJSON(tile.x, tile.y, ZOOM), polygons = geo.geometry.type === 'Polygon' ? [geo.geometry.coordinates] : geo.geometry.type === 'MultiPolygon' ? geo.geometry.coordinates : []
      polygons.forEach((rings, polygonIndex) => { const key = `building-${source.id ?? hash(JSON.stringify(rings[0]))}-${polygonIndex}`; if (seen.has(key) || !rings[0]?.length) return; const points = rings[0].map(toPoint), center = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 }); if (Math.hypot(center.x - centerPoint.x, center.y - centerPoint.y) > radius || FACILITIES.some(box => Math.abs(center.x - box.x) <= box.width && Math.abs(center.y - box.y) <= box.depth)) return; seen.add(key); catalog.sourceFeatures.push({ key, rings, base: Number(source.properties.render_min_height) || 0, roof: Number(source.properties.render_height) || 6 }) })
    }
    completed.add(tile.key)
  }))
  catalog.completedTiles = [...completed]
  await writeCatalog(catalog)
  console.log(`${completed.size}/${tiles.length} building tiles cached`)
}
const records = consolidate(catalog.sourceFeatures).map(placedBuilding).filter(recordValid)
catalog = { schema: SCHEMA, region: REGION, source: 'OpenFreeMap / OpenStreetMap', zoom: ZOOM, center: catalog.center, radius, complete: true, completedTiles: [...completed], totalTiles: tiles.length, records }
await writeCatalog(catalog)
console.log(`Building catalog complete: ${records.length} records`)
