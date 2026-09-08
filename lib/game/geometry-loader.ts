import { BUILDING_MODULE, type BuildingPreset, type FootprintPoint, type PlacedBuilding } from './building-system'
import { lngLat, type BattleState, type GeometryFeature, type GeometryPacket } from './types'
import { BUILDING_RENDER_CENTER, BUILDING_RENDER_RADIUS, sectorOrigin, SECTOR_SIZE } from './theater'
import { assetPath } from '../asset-path'
import type { BuildingAssessmentProgress } from './building-consolidation'

type Catalog = { schema: number; region: string; complete: boolean; records: PlacedBuilding[] }

const validRecord = (record: PlacedBuilding) => typeof record?.key === 'string'
  && Number.isFinite(record.x) && Number.isFinite(record.y) && Number.isFinite(record.rotation)
  && Number.isFinite(record.elevation) && /^\d{16}$/.test(record.preset?.seed || '')

const signedArea = (points: FootprintPoint[]) => points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length]
  return sum + point.x * next.y - next.x * point.y
}, 0) / 2

function footprint(preset: BuildingPreset) {
  let points = preset.footprintMode === 'shape' && (preset.footprint?.length || 0) >= 3
    ? preset.footprint!.filter((point, index, all) => !index || Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) > .2)
    : [{ x: 0, y: 0 }, { x: preset.width, y: 0 }, { x: preset.width, y: preset.depth }, { x: 0, y: preset.depth }]
  if (!preset.slopedWalls) {
    const orthogonal: FootprintPoint[] = []
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length]
      orthogonal.push(point)
      if (Math.abs(next.x - point.x) > .2 && Math.abs(next.y - point.y) > .2) orthogonal.push({ x: next.x, y: point.y })
    })
    points = orthogonal
  }
  if (signedArea(points) < 0) points = points.slice().reverse()
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y))
  return points.map(point => ({ x: (point.x - (minX + maxX) / 2) * BUILDING_MODULE, y: (point.y - (minY + maxY) / 2) * BUILDING_MODULE }))
}

function collisionFeature(building: PlacedBuilding): GeometryFeature {
  const cos = Math.cos(building.rotation), sin = Math.sin(building.rotation)
  const ring = footprint(building.preset).map(point => lngLat({
    x: building.x + point.x * cos - point.y * sin,
    y: building.y + point.x * sin + point.y * cos,
  }))
  ring.push(ring[0])
  return { key: building.key, water: false, rings: [ring], base: 0, roof: building.preset.floors * 3.2, elevation: building.elevation }
}

function theaterSectors() {
  const minX = Math.floor((BUILDING_RENDER_CENTER.x - BUILDING_RENDER_RADIUS) / SECTOR_SIZE)
  const maxX = Math.floor((BUILDING_RENDER_CENTER.x + BUILDING_RENDER_RADIUS) / SECTOR_SIZE)
  const minY = Math.floor((BUILDING_RENDER_CENTER.y - BUILDING_RENDER_RADIUS) / SECTOR_SIZE)
  const maxY = Math.floor((BUILDING_RENDER_CENTER.y + BUILDING_RENDER_RADIUS) / SECTOR_SIZE)
  const keys: string[] = []
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
    const nearestX = Math.max(x * SECTOR_SIZE, Math.min(BUILDING_RENDER_CENTER.x, (x + 1) * SECTOR_SIZE))
    const nearestY = Math.max(y * SECTOR_SIZE, Math.min(BUILDING_RENDER_CENTER.y, (y + 1) * SECTOR_SIZE))
    if (Math.hypot(nearestX - BUILDING_RENDER_CENTER.x, nearestY - BUILDING_RENDER_CENTER.y) <= BUILDING_RENDER_RADIUS) keys.push(`${x},${y}`)
  }
  return keys
}

/**
 * Loads the build-time root catalog once and derives worker collision sectors from it.
 * This deliberately contains no hidden map: rendering and map tiles belong to the
 * WebGPU world, while the worker receives compact deterministic geometry here.
 */
export function loadBattleGeometry(
  done: (packet: GeometryPacket) => void,
  status: (text: string) => void,
  _getState?: () => BattleState,
  progress?: (value: BuildingAssessmentProgress) => void,
  _buildingsReady?: (features: GeometryFeature[]) => void,
  catalogReady?: (records: PlacedBuilding[]) => void,
) {
  const controller = new AbortController()
  let disposed = false, timer: ReturnType<typeof setTimeout> | undefined
  void fetch(assetPath('/san-diego-buildings.json'), { signal: controller.signal })
    .then(async response => {
      if (!response.ok) throw new Error(`catalog unavailable (${response.status})`)
      return response.json() as Promise<Catalog>
    })
    .then(catalog => {
      if (catalog.schema !== 1 || catalog.region !== 'san-diego-theater' || catalog.complete !== true
        || !Array.isArray(catalog.records) || !catalog.records.length || !catalog.records.every(validRecord)) throw new Error('catalog invalid')
      if (disposed) return
      const records = catalog.records
      status(`${records.length.toLocaleString()} cached buildings ready`)
      catalogReady?.(records)

      const sectorFeatures = new Map<string, GeometryFeature[]>(), keys = theaterSectors()
      for (const key of keys) sectorFeatures.set(key, [])
      let recordIndex = 0, sectorIndex = 0, version = 0
      const indexRecords = () => {
        if (disposed) return
        const started = performance.now()
        while (recordIndex < records.length && performance.now() - started < 7) {
          const record = records[recordIndex++], feature = collisionFeature(record), localPoints = footprint(record.preset)
          const cos = Math.cos(record.rotation), sin = Math.sin(record.rotation)
          const xs = localPoints.map(point => record.x + point.x * cos - point.y * sin)
          const ys = localPoints.map(point => record.y + point.x * sin + point.y * cos)
          const minX = Math.floor(Math.min(...xs) / SECTOR_SIZE), maxX = Math.floor(Math.max(...xs) / SECTOR_SIZE)
          const minY = Math.floor(Math.min(...ys) / SECTOR_SIZE), maxY = Math.floor(Math.max(...ys) / SECTOR_SIZE)
          for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) sectorFeatures.get(`${x},${y}`)?.push(feature)
        }
        if (recordIndex < records.length) timer = setTimeout(indexRecords, 0)
        else timer = setTimeout(emitSectors, 0)
      }
      const emitSectors = () => {
        if (disposed) return
        const started = performance.now()
        while (sectorIndex < keys.length && performance.now() - started < 7) {
          const key = keys[sectorIndex++], origin = sectorOrigin(key)
          done({
            sector: key,
            features: sectorFeatures.get(key) || [],
            terrain: { ...origin, step: 50, width: 41, height: 41, values: new Array(41 * 41).fill(0) },
            version: ++version,
            complete: true,
          })
        }
        progress?.({ done: sectorIndex, total: keys.length, phase: 'discovering' })
        if (sectorIndex < keys.length) timer = setTimeout(emitSectors, 0)
        else status(`${records.length.toLocaleString()} building collisions indexed`)
      }
      timer = setTimeout(indexRecords, 0)
    })
    .catch(error => {
      if (disposed || (error instanceof DOMException && error.name === 'AbortError')) return
      status(`Root building catalog failed to load: ${error instanceof Error ? error.message : 'unknown error'}`)
    })

  return () => {
    disposed = true
    controller.abort()
    if (timer) clearTimeout(timer)
  }
}
