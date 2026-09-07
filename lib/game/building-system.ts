import { local, type GeometryFeature } from './types'

export type BuildingType = 'industrial' | 'commercial' | 'residential'
export type BuildingPartKind = 'wall' | 'window' | 'door' | 'floor' | 'roof'
export interface BuildingPreset { id: string; name: string; type: BuildingType; width: number; depth: number; floors: number; seed: number; roof?: 'auto' | 'flat' | 'gable' }
export interface BuildingPart { id: string; kind: BuildingPartKind; x: number; y: number; z: number; width: number; depth: number; height: number; rotation: number; tilt?: number; color: string }
export interface BuildingLayout { preset: BuildingPreset; parts: BuildingPart[]; roof: 'flat' | 'gable' }

export const BUILDING_MODULE = 4
export const FLOOR_HEIGHT = 3.2
const palettes: Record<BuildingType, { wall: string[]; trim: string; window: string; door: string; roof: string }> = {
  industrial: { wall: ['#667078', '#74786f', '#59636b'], trim: '#323b43', window: '#20394b', door: '#28323a', roof: '#454d52' },
  commercial: { wall: ['#62788a', '#718da0', '#6f777f'], trim: '#c0ccd2', window: '#183a50', door: '#263b47', roof: '#3f4b55' },
  residential: { wall: ['#826b61', '#77756c', '#756d58'], trim: '#c5b9a5', window: '#274353', door: '#42372f', roof: '#514743' },
}
const hash = (value: string | number) => [...String(value)].reduce((n, c) => (Math.imul(n, 33) + c.charCodeAt(0)) >>> 0, 5381)
const random = (seed: number, key: string) => hash(`${seed}:${key}`) / 0xffffffff
const part = (id: string, kind: BuildingPartKind, x: number, y: number, z: number, width: number, depth: number, height: number, rotation: number, color: string): BuildingPart => ({ id, kind, x, y, z, width, depth, height, rotation, color })

export function normalizeBuildingPreset(value: BuildingPreset): BuildingPreset {
  const type: BuildingType = ['industrial', 'commercial', 'residential'].includes(value.type) ? value.type : 'residential'
  return { id: String(value.id || `building-${hash(value.name || 'preset')}`), name: String(value.name || 'Untitled building'), type,
    width: Math.max(1, Math.min(24, Math.round(Number(value.width) || 1))), depth: Math.max(1, Math.min(24, Math.round(Number(value.depth) || 1))),
    floors: Math.max(1, Math.min(40, Math.round(Number(value.floors) || 1))), seed: Math.round(Number(value.seed) || 1), roof: ['flat', 'gable'].includes(value.roof || '') ? value.roof : 'auto' }
}

export function generateBuilding(input: BuildingPreset): BuildingLayout {
  const preset = normalizeBuildingPreset(input), palette = palettes[preset.type], parts: BuildingPart[] = []
  const w = preset.width * BUILDING_MODULE, d = preset.depth * BUILDING_MODULE
  const wallColor = palette.wall[Math.floor(random(preset.seed, 'wall') * palette.wall.length) % palette.wall.length]
  const roofChance = Math.max(.06, (preset.type === 'residential' ? .82 : preset.type === 'commercial' ? .42 : .28) - preset.floors * .1)
  const roof = preset.roof === 'auto' ? random(preset.seed, 'roof') < roofChance ? 'gable' : 'flat' : preset.roof || 'flat'
  const sides = [
    { name: 'south', count: preset.width, x: (i: number) => (i + .5) * BUILDING_MODULE - w / 2, y: () => -d / 2, rotation: 0 },
    { name: 'north', count: preset.width, x: (i: number) => w / 2 - (i + .5) * BUILDING_MODULE, y: () => d / 2, rotation: Math.PI },
    { name: 'west', count: preset.depth, x: () => -w / 2, y: (i: number) => d / 2 - (i + .5) * BUILDING_MODULE, rotation: -Math.PI / 2 },
    { name: 'east', count: preset.depth, x: () => w / 2, y: (i: number) => (i + .5) * BUILDING_MODULE - d / 2, rotation: Math.PI / 2 },
  ]
  const doorSide = Math.floor(random(preset.seed, 'door-side') * 4), doorIndex = (count: number) => Math.floor(random(preset.seed, 'door-index') * count)
  for (let floor = 0; floor < preset.floors; floor++) {
    parts.push(part(`floor-${floor}`, 'floor', 0, 0, floor * FLOOR_HEIGHT + .08, w, d, .16, 0, palette.trim))
    for (let sideIndex = 0; sideIndex < sides.length; sideIndex++) {
      const side = sides[sideIndex]
      for (let i = 0; i < side.count; i++) {
        const id = `${side.name}-${floor}-${i}`, along = side.count
        const door = floor === 0 && sideIndex === doorSide && i === doorIndex(along) && along >= 2
        const windowChance = Math.min(.92, .28 + along * .09 + floor * .035 + (preset.type === 'commercial' ? .15 : 0))
        const window = !door && random(preset.seed, id) < windowChance
        const thickness = .22
        parts.push(part(`${id}-wall`, 'wall', side.x(i), side.y(i), floor * FLOOR_HEIGHT + FLOOR_HEIGHT / 2,
          BUILDING_MODULE, thickness, FLOOR_HEIGHT, side.rotation, wallColor))
        if (door) parts.push(part(`${id}-door`, 'door', side.x(i), side.y(i) + (sideIndex === 0 ? -.13 : sideIndex === 1 ? .13 : 0), floor * FLOOR_HEIGHT + 1.15,
          1.5, .08, 2.3, side.rotation, palette.door))
        else if (window) parts.push(part(`${id}-window`, 'window', side.x(i) + (sideIndex > 1 ? (sideIndex === 2 ? -.13 : .13) : 0), side.y(i) + (sideIndex < 2 ? (sideIndex === 0 ? -.13 : .13) : 0), floor * FLOOR_HEIGHT + 1.8,
          2.05, .08, preset.type === 'industrial' && floor === 0 ? 1.35 : 1.15, side.rotation, palette.window))
      }
    }
  }
  const top = preset.floors * FLOOR_HEIGHT
  if (roof === 'flat') parts.push(part('roof-flat', 'roof', 0, 0, top + .18, w + .35, d + .35, .36, 0, palette.roof))
  else {
    const alongX = w >= d, runs = alongX ? preset.width : preset.depth
    for (let i = 0; i < runs; i++) for (const slope of [-1, 1]) parts.push({ ...part(`roof-${i}-${slope}`, 'roof', alongX ? (i + .5) * BUILDING_MODULE - w / 2 : slope * w / 4, alongX ? slope * d / 4 : (i + .5) * BUILDING_MODULE - d / 2,
      top + Math.min(w, d) / 5, alongX ? BUILDING_MODULE : w / 2 + .25, alongX ? d / 2 + .25 : BUILDING_MODULE, .28, alongX ? 0 : Math.PI / 2, palette.roof), tilt: slope * .32 })
  }
  return { preset, parts, roof }
}

export function presetFromFeature(feature: GeometryFeature): { preset: BuildingPreset; x: number; y: number; rotation: number; elevation: number } | undefined {
  const sourceRing = feature.rings[0]
  if (feature.water || !sourceRing?.length) return
  const ring = sourceRing.map(local)
  let longest = 0, rotation = 0
  for (let i = 0; i < ring.length - 1; i++) { const dx = ring[i + 1].x - ring[i].x, dy = ring[i + 1].y - ring[i].y, length = Math.hypot(dx, dy); if (length > longest) { longest = length; rotation = Math.atan2(dy, dx) } }
  const cos = Math.cos(rotation), sin = Math.sin(rotation), projected = ring.map(({ x, y }) => ({ a: x * cos + y * sin, b: -x * sin + y * cos }))
  const minA = Math.min(...projected.map(p => p.a)), maxA = Math.max(...projected.map(p => p.a)), minB = Math.min(...projected.map(p => p.b)), maxB = Math.max(...projected.map(p => p.b))
  const x = ((minA + maxA) / 2) * cos - ((minB + maxB) / 2) * sin, y = ((minA + maxA) / 2) * sin + ((minB + maxB) / 2) * cos
  const seed = hash(feature.key), height = Math.max(FLOOR_HEIGHT, (feature.roof || 6) - (feature.base || 0))
  const types: BuildingType[] = ['industrial', 'commercial', 'residential']
  return { x, y, rotation, elevation: (feature.elevation || 0) + (feature.base || 0), preset: normalizeBuildingPreset({ id: feature.key, name: feature.key, type: types[seed % types.length], width: Math.max(1, Math.round((maxA - minA) / BUILDING_MODULE)), depth: Math.max(1, Math.round((maxB - minB) / BUILDING_MODULE)), floors: Math.max(1, Math.round(height / FLOOR_HEIGHT)), seed }) }
}

export function parseBuildingPresets(value: unknown): BuildingPreset[] {
  if (!Array.isArray(value)) throw new Error('Building preset file must contain a JSON list.')
  return value.map(item => normalizeBuildingPreset(item as BuildingPreset))
}
