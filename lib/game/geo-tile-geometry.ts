import earcut from 'earcut'
import { Color3 } from '@babylonjs/core/Maths/math.color'

export type TilePoint = { x: number; y: number }
type TileFeature = { type: number; properties: Record<string, string | number | boolean>; loadGeometry(): TilePoint[][] }
type TileLayer = { extent: number; length: number; feature(index: number): TileFeature }
export type GeographicLayers = Record<string, TileLayer>
export type TileTerrain = { positions: ArrayLike<number>; resolution: number }
export type GeographicBatch = { positions: number[]; indices: number[]; colors: number[] }
export const GEOGRAPHIC_PALETTE = {
  ground: '#030717', water: '#3e8dcf', roads: '#293847', highways: '#536d7b',
  buildings: '#ffffff', edges: '#269dff',
} as const
export type GeographicBatchKind = Exclude<keyof typeof GEOGRAPHIC_PALETTE, 'ground'>
export type GeographicBatches = Record<GeographicBatchKind, GeographicBatch>
export const GEOGRAPHIC_LABEL_SIZE = 512
const GEOGRAPHIC_LABEL_LIMIT = 8

/** Labels remain a sparse top-down aid, with at most one 1 MiB texture per tile. */
export function selectGeographicLabels(layer: TileLayer | undefined, zoom: number) {
  const candidates: { text: string; x: number; y: number; rank: number }[] = []
  const maxRank = zoom >= 12 ? 12 : zoom >= 9 ? 8 : 5
  for (let i = 0; layer && i < layer.length; i++) {
    const feature = layer.feature(i), name = feature.properties['name:en'] || feature.properties.name
    const suppliedRank = Number(feature.properties.rank), rank = Number.isFinite(suppliedRank) ? suppliedRank : 12
    if (!name || rank > maxRank) continue
    const point = feature.loadGeometry()[0]?.[0]
    if (!point || point.x < 0 || point.x > layer.extent || point.y < 0 || point.y > layer.extent) continue
    candidates.push({ text: String(name).slice(0, 48), x: point.x * GEOGRAPHIC_LABEL_SIZE / layer.extent, y: point.y * GEOGRAPHIC_LABEL_SIZE / layer.extent, rank })
  }
  candidates.sort((a, b) => a.rank - b.rank || a.text.localeCompare(b.text))
  const labels: typeof candidates = []
  for (const candidate of candidates) {
    if (labels.some(label => label.text === candidate.text || (Math.abs(label.y - candidate.y) < 22 && Math.abs(label.x - candidate.x) < (label.text.length + candidate.text.length) * 3.5 + 12))) continue
    labels.push(candidate)
    if (labels.length === GEOGRAPHIC_LABEL_LIMIT) break
  }
  return labels
}

// PBR albedo and vertex colors are linear; author the palette in display RGB
// and convert once, before upload, to avoid pale gamma-expanded buildings.
const linearRGB = (r: number, g: number, b: number): [number, number, number] => {
  const color = new Color3(r / 255, g / 255, b / 255).toLinearSpace()
  return [color.r, color.g, color.b]
}
const BUILDING_ROOF = linearRGB(27, 44, 122)
const BUILDING_WALL_BASE = linearRGB(15, 21, 48)
const BUILDING_WALL_TOP = linearRGB(22, 32, 83)

const cross = (a: TilePoint, b: TilePoint, c: TilePoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
const area = (ring: TilePoint[]) => ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p.x * q.y - q.x * p.y }, 0)
const cleanPath = (path: TilePoint[]) => path.filter((p, i) => Number.isFinite(p.x) && Number.isFinite(p.y) && (!i || p.x !== path[i - 1].x || p.y !== path[i - 1].y))
const emptyBatch = (): GeographicBatch => ({ positions: [], indices: [], colors: [] })

/** Vector tiles order each exterior before its opposite-winding interior rings. */
export function geographicPolygons(paths: TilePoint[][]): TilePoint[][][] {
  const polygons: TilePoint[][][] = []
  let exteriorSign = 0
  for (const path of paths) {
    const ring = cleanPath(path)
    if (ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y) ring.pop()
    const signed = area(ring)
    if (ring.length < 3 || Math.abs(signed) < 1e-8) continue
    exteriorSign ||= Math.sign(signed)
    if (Math.sign(signed) === exteriorSign) polygons.push([ring])
    else polygons[polygons.length - 1].push(ring)
  }
  return polygons
}

function triangulate(rings: TilePoint[][]) {
  const points: TilePoint[] = [], holes: number[] = []
  for (let i = 0; i < rings.length; i++) { if (i) holes.push(points.length); points.push(...rings[i]) }
  return { points, indices: earcut(points.flatMap(p => [p.x, p.y]), holes, 2) }
}

/** Clip a convex polygon against an inclusive half-plane. */
function clip(polygon: TilePoint[], distance: (p: TilePoint) => number): TilePoint[] {
  const result: TilePoint[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b)
    if (da >= 0) result.push(a)
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) }
  }
  return result
}

/** Batches are fixed by visual role, never by feature or individual building. */
export function buildGeographicBatches(layers: GeographicLayers, terrain: TileTerrain): GeographicBatches {
  const batches: GeographicBatches = { water: emptyBatch(), roads: emptyBatch(), highways: emptyBatch(), buildings: emptyBatch(), edges: emptyBatch() }
  const { positions, resolution } = terrain, stride = resolution + 1
  const minX = positions[0], maxY = positions[1], maxX = positions[resolution * 3], minY = positions[resolution * stride * 3 + 1]
  const width = maxX - minX, height = maxY - minY, cellWidth = width / resolution, cellHeight = height / resolution
  const texel = width / 512
  const worldPoint = (p: TilePoint, extent: number): TilePoint => ({ x: minX + p.x / extent * width, y: maxY - p.y / extent * height })
  const sample = (p: TilePoint) => {
    const x = Math.max(0, Math.min(resolution, (p.x - minX) / cellWidth)), y = Math.max(0, Math.min(resolution, (maxY - p.y) / cellHeight))
    const col = Math.min(resolution - 1, Math.floor(x)), row = Math.min(resolution - 1, Math.floor(y)), u = x - col, v = y - row, a = (row * stride + col) * 3 + 2
    const nw = positions[a], ne = positions[a + 3], sw = positions[a + stride * 3], se = positions[a + stride * 3 + 3]
    return u + v <= 1 ? nw + (ne - nw) * u + (sw - nw) * v : se + (sw - se) * (1 - u) + (ne - se) * (1 - v)
  }
  const emit = (batch: GeographicBatch, polygon: TilePoint[], elevation: (p: TilePoint) => number, color?: [number, number, number]) => {
    if (polygon.length < 3) return
    const start = batch.positions.length / 3
    for (const p of polygon) { batch.positions.push(p.x, p.y, elevation(p)); if (color) batch.colors.push(...color, 1) }
    for (let i = 1; i < polygon.length - 1; i++) {
      const winding = cross(polygon[0], polygon[i], polygon[i + 1])
      if (Math.abs(winding) > 1e-8) batch.indices.push(start, start + (winding > 0 ? i : i + 1), start + (winding > 0 ? i + 1 : i))
    }
  }
  const clipToTile = (polygon: TilePoint[]) => clip(clip(clip(clip(polygon, p => p.x - minX), p => maxX - p.x), p => p.y - minY), p => maxY - p.y)
  // Splitting on the terrain's grid AND diagonal keeps roads/water above the
  // rendered surface even when a coarse DEM triangle contains a ridge or valley.
  const drape = (batch: GeographicBatch, triangle: TilePoint[], lift: number) => {
    const xs = triangle.map(p => (p.x - minX) / cellWidth), ys = triangle.map(p => (maxY - p.y) / cellHeight)
    const firstCol = Math.max(0, Math.floor(Math.min(...xs))), lastCol = Math.min(resolution - 1, Math.floor(Math.max(...xs)))
    const firstRow = Math.max(0, Math.floor(Math.min(...ys))), lastRow = Math.min(resolution - 1, Math.floor(Math.max(...ys)))
    for (let row = firstRow; row <= lastRow; row++) for (let col = firstCol; col <= lastCol; col++) {
      const left = minX + col * cellWidth, top = maxY - row * cellHeight
      const polygon = clip(clip(clip(clip(triangle, p => p.x - left), p => left + cellWidth - p.x), p => top - p.y), p => p.y - (top - cellHeight))
      if (polygon.length < 3) continue
      const diagonal = (p: TilePoint) => (p.x - left) / cellWidth + (top - p.y) / cellHeight - 1
      emit(batch, clip(polygon, p => -diagonal(p)), p => sample(p) + lift)
      emit(batch, clip(polygon, diagonal), p => sample(p) + lift)
    }
  }
  const surface = (batch: GeographicBatch, rings: TilePoint[][], lift: number) => {
    const { points, indices } = triangulate(rings)
    for (let i = 0; i < indices.length; i += 3) drape(batch, [points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]], lift)
  }
  const ribbon = (batch: GeographicBatch, input: TilePoint[], lineWidth: number, lift: number, closed = false, roof?: number) => {
    const path = cleanPath(input)
    if (path.length < 2) return
    const pairs: TilePoint[][] = []
    for (let i = 0; i < path.length; i++) {
      const p = path[i], before = path[closed ? (i + path.length - 1) % path.length : Math.max(0, i - 1)], after = path[closed ? (i + 1) % path.length : Math.min(path.length - 1, i + 1)]
      let ax = p.x - before.x, ay = p.y - before.y, bx = after.x - p.x, by = after.y - p.y
      const al = Math.hypot(ax, ay), bl = Math.hypot(bx, by)
      if (al) { ax /= al; ay /= al } else { ax = bx / (bl || 1); ay = by / (bl || 1) }
      if (bl) { bx /= bl; by /= bl } else { bx = ax; by = ay }
      let nx = -(ay + by), ny = ax + bx, length = Math.hypot(nx, ny)
      if (length < 1e-6) { nx = -by; ny = bx; length = 1 }
      nx /= length; ny /= length
      const half = Math.min(lineWidth * 1.25, lineWidth / 2 / Math.max(.2, Math.abs(nx * -by + ny * bx)))
      pairs.push([{ x: p.x + nx * half, y: p.y + ny * half }, { x: p.x - nx * half, y: p.y - ny * half }])
    }
    for (let i = 0; i < (closed ? path.length : path.length - 1); i++) {
      const a = pairs[i], b = pairs[(i + 1) % path.length]
      for (const triangle of [[a[0], a[1], b[0]], [b[0], a[1], b[1]]]) {
        if (roof === undefined) drape(batch, triangle, lift)
        else emit(batch, clipToTile(triangle), () => roof + lift)
      }
    }
  }
  const numberProperty = (properties: TileFeature['properties'], key: string, fallback: number) => {
    const value = properties[key]
    return value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback
  }
  for (const name of ['water', 'waterway', 'transportation', 'building']) {
    const layer = layers[name]
    if (!layer) continue
    for (let featureIndex = 0; featureIndex < layer.length; featureIndex++) {
      const feature = layer.feature(featureIndex), paths = feature.loadGeometry().map(path => path.map(p => worldPoint(p, layer.extent)))
      if (name === 'water' && feature.type === 3) {
        for (const polygon of geographicPolygons(paths)) surface(batches.water, polygon, .08)
      } else if (name === 'waterway' && feature.type === 2) {
        for (const path of paths) ribbon(batches.water, path, Math.max(3, texel * .65), .1)
      } else if (name === 'transportation' && feature.type === 2) {
        if (feature.properties.brunnel === 'tunnel') continue
        const kind = String(feature.properties.class), major = ['motorway', 'trunk', 'primary'].includes(kind), minor = ['path', 'track', 'service'].includes(kind)
        const lineWidth = Math.max(major ? 11 : minor ? 2 : 5, texel * (major ? 1.35 : minor ? .28 : .65))
        for (const path of paths) ribbon(major ? batches.highways : batches.roads, path, lineWidth, major ? .2 : .16)
      } else if (name === 'building' && feature.type === 3) {
        const bottom = Math.max(0, numberProperty(feature.properties, 'render_min_height', 0)), buildingHeight = Math.max(bottom + 1, numberProperty(feature.properties, 'render_height', 6))
        for (const rings of geographicPolygons(paths)) {
          const { points, indices } = triangulate(rings)
          const roof = points.reduce((highest, p) => Math.max(highest, sample(p)), -Infinity) + buildingHeight
          for (let i = 0; i < indices.length; i += 3) emit(batches.buildings, clipToTile([points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]]), () => roof, BUILDING_ROOF)
          for (const ring of rings) {
            for (let i = 0; i < ring.length; i++) {
              const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y
              let start = 0, end = 1
              for (const [p, q] of [[-dx, a.x - minX], [dx, maxX - a.x], [-dy, a.y - minY], [dy, maxY - a.y]]) {
                if (!p) { if (q < 0) end = -1; continue }
                const t = q / p
                if (p < 0) start = Math.max(start, t); else end = Math.min(end, t)
              }
              if (start >= end) continue
              const p = { x: a.x + dx * start, y: a.y + dy * start }, q = { x: a.x + dx * end, y: a.y + dy * end }, offset = batches.buildings.positions.length / 3
              batches.buildings.positions.push(p.x, p.y, sample(p) + bottom, q.x, q.y, sample(q) + bottom, q.x, q.y, roof, p.x, p.y, roof)
              // MVT exteriors become clockwise in world space; this winding also
              // points courtyard walls toward their oppositely wound interior.
              batches.buildings.indices.push(offset, offset + 2, offset + 1, offset, offset + 3, offset + 2)
              const light = .8 + .2 * Math.abs(dx) / (Math.hypot(dx, dy) || 1)
              for (const top of [false, false, true, true]) {
                const color = top ? BUILDING_WALL_TOP : BUILDING_WALL_BASE
                batches.buildings.colors.push(color[0] * light, color[1] * light, color[2] * light, 1)
              }
            }
            const edgeWidth = Math.max(.35, Math.min(.9, texel * .14))
            ribbon(batches.edges, ring, edgeWidth * 1.25, .24, true)
            ribbon(batches.edges, ring, edgeWidth, .035, true, roof)
          }
        }
      }
    }
  }
  return batches
}
