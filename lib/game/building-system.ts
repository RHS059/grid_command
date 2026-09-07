import { local, type GeometryFeature } from './types'

export type BuildingType = 'industrial' | 'commercial' | 'residential'
export type BuildingPartKind = 'wall' | 'window' | 'door' | 'floor' | 'roof' | 'trim' | 'accent' | 'awning' | 'rooftop'
export interface BuildingPreset { id: string; name: string; type: BuildingType; width: number; depth: number; floors: number; seed: number; roof?: 'auto' | 'flat' | 'gable' }
export interface BuildingPart { id: string; kind: BuildingPartKind; x: number; y: number; z: number; width: number; depth: number; height: number; rotation: number; tilt?: number; color: string }
export interface BuildingLayout { preset: BuildingPreset; parts: BuildingPart[]; roof: 'flat' | 'gable' }

export const BUILDING_MODULE = 4
export const FLOOR_HEIGHT = 3.2
const palettes: Record<BuildingType, { wall: string[]; trim: string; accent: string; window: string; door: string; roof: string }> = {
  industrial: { wall: ['#778083', '#697477', '#858277'], trim: '#c0b89c', accent: '#424b4d', window: '#24485a', door: '#39464a', roof: '#545b5b' },
  commercial: { wall: ['#c1b19a', '#aeb8b8', '#9da7ad'], trim: '#e0ddd1', accent: '#556b73', window: '#24556b', door: '#263f49', roof: '#555f62' },
  residential: { wall: ['#a66f5d', '#b29875', '#87949a'], trim: '#ded4bd', accent: '#514c45', window: '#34586a', door: '#4b3830', roof: '#67504a' },
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
  const outward = (sideIndex: number, amount: number) => sideIndex === 0 ? { x: 0, y: -amount } : sideIndex === 1 ? { x: 0, y: amount } : sideIndex === 2 ? { x: -amount, y: 0 } : { x: amount, y: 0 }
  const facadePart = (id: string, kind: BuildingPartKind, sideIndex: number, x: number, y: number, z: number, width: number, depth: number, height: number, rotation: number, color: string, offset = .13) => {
    const normal = outward(sideIndex, offset)
    parts.push(part(id, kind, x + normal.x, y + normal.y, z, width, depth, height, rotation, color))
  }
  for (let floor = 0; floor < preset.floors; floor++) {
    parts.push(part(`floor-${floor}`, 'floor', 0, 0, floor * FLOOR_HEIGHT + .08, w, d, .16, 0, palette.trim))
    for (let sideIndex = 0; sideIndex < sides.length; sideIndex++) {
      const side = sides[sideIndex]
      for (let i = 0; i < side.count; i++) {
        const id = `${side.name}-${floor}-${i}`, along = side.count
        const industrialBay = preset.type === 'industrial' && floor === 0 && sideIndex === doorSide && i === doorIndex(along)
        const door = floor === 0 && sideIndex === doorSide && i === doorIndex(along) && along >= 2 && !industrialBay
        const windowChance = Math.min(.98, .38 + along * .08 + floor * .025 + (preset.type === 'commercial' ? .24 : preset.type === 'industrial' ? -.18 : .08))
        const window = !door && random(preset.seed, id) < windowChance
        const thickness = .22
        parts.push(part(`${id}-wall`, 'wall', side.x(i), side.y(i), floor * FLOOR_HEIGHT + FLOOR_HEIGHT / 2,
          BUILDING_MODULE, thickness, FLOOR_HEIGHT, side.rotation, wallColor))
        if (industrialBay) {
          facadePart(`${id}-bay-frame`, 'trim', sideIndex, side.x(i), side.y(i), floor * FLOOR_HEIGHT + 1.35, 3.45, .12, 2.72, side.rotation, palette.trim)
          facadePart(`${id}-bay`, 'door', sideIndex, side.x(i), side.y(i), floor * FLOOR_HEIGHT + 1.3, 3.08, .08, 2.4, side.rotation, palette.door, .2)
          for (let stripe = -1; stripe <= 1; stripe++) facadePart(`${id}-bay-rib-${stripe}`, 'accent', sideIndex, side.x(i) + (sideIndex < 2 ? stripe * .75 : 0), side.y(i) + (sideIndex > 1 ? stripe * .75 : 0), floor * FLOOR_HEIGHT + 1.3, .07, .05, 2.28, side.rotation, palette.accent, .25)
        } else if (door) {
          facadePart(`${id}-door-frame`, 'trim', sideIndex, side.x(i), side.y(i), floor * FLOOR_HEIGHT + 1.2, 1.9, .11, 2.5, side.rotation, palette.trim)
          facadePart(`${id}-door`, 'door', sideIndex, side.x(i), side.y(i), floor * FLOOR_HEIGHT + 1.15, 1.52, .08, 2.3, side.rotation, palette.door, .2)
          if (preset.type !== 'industrial') facadePart(`${id}-awning`, 'awning', sideIndex, side.x(i), side.y(i), floor * FLOOR_HEIGHT + 2.62, 2.2, .9, .14, side.rotation, palette.accent, .55)
        } else if (window) {
          const storefront = preset.type === 'commercial' && floor === 0
          const windowWidth = storefront ? 3.3 : preset.type === 'industrial' ? 2.4 : 2.15
          const windowHeight = storefront ? 2.35 : preset.type === 'industrial' ? 1.25 : 1.35
          const windowZ = floor * FLOOR_HEIGHT + (storefront ? 1.45 : 1.82)
          facadePart(`${id}-window-frame`, 'trim', sideIndex, side.x(i), side.y(i), windowZ, windowWidth + .28, .1, windowHeight + .28, side.rotation, palette.trim)
          facadePart(`${id}-window`, 'window', sideIndex, side.x(i), side.y(i), windowZ, windowWidth, .07, windowHeight, side.rotation, palette.window, .21)
          facadePart(`${id}-mullion`, 'accent', sideIndex, side.x(i), side.y(i), windowZ, .08, .04, windowHeight, side.rotation, palette.accent, .27)
          if (!storefront) facadePart(`${id}-sill`, 'trim', sideIndex, side.x(i), side.y(i), windowZ - windowHeight / 2 - .13, windowWidth + .35, .18, .12, side.rotation, palette.trim, .24)
          if (preset.type === 'residential' && floor > 0 && random(preset.seed, `${id}-balcony`) > .74) {
            facadePart(`${id}-balcony`, 'accent', sideIndex, side.x(i), side.y(i), floor * FLOOR_HEIGHT + .78, 2.75, 1.05, .14, side.rotation, palette.accent, .58)
            facadePart(`${id}-rail`, 'trim', sideIndex, side.x(i), side.y(i), floor * FLOOR_HEIGHT + 1.18, 2.75, .08, .68, side.rotation, palette.trim, 1.02)
          }
        }
      }
    }
    if (floor > 0 || preset.type === 'commercial') {
      const z = floor * FLOOR_HEIGHT + .14
      parts.push(part(`band-s-${floor}`, 'trim', 0, -d / 2 - .15, z, w + .35, .18, .22, 0, palette.trim))
      parts.push(part(`band-n-${floor}`, 'trim', 0, d / 2 + .15, z, w + .35, .18, .22, 0, palette.trim))
      parts.push(part(`band-w-${floor}`, 'trim', -w / 2 - .15, 0, z, d + .35, .18, .22, Math.PI / 2, palette.trim))
      parts.push(part(`band-e-${floor}`, 'trim', w / 2 + .15, 0, z, d + .35, .18, .22, Math.PI / 2, palette.trim))
    }
  }
  const top = preset.floors * FLOOR_HEIGHT
  if (roof === 'flat') {
    parts.push(part('roof-flat', 'roof', 0, 0, top + .18, w + .35, d + .35, .36, 0, palette.roof))
    parts.push(part('parapet-s', 'trim', 0, -d / 2, top + .62, w + .45, .28, .75, 0, palette.trim), part('parapet-n', 'trim', 0, d / 2, top + .62, w + .45, .28, .75, 0, palette.trim))
    parts.push(part('parapet-w', 'trim', -w / 2, 0, top + .62, d, .28, .75, Math.PI / 2, palette.trim), part('parapet-e', 'trim', w / 2, 0, top + .62, d, .28, .75, Math.PI / 2, palette.trim))
    const rooftopCount = Math.max(1, Math.min(4, Math.floor((preset.width * preset.depth) / 12)))
    for (let i = 0; i < rooftopCount; i++) {
      const x = (random(preset.seed, `roof-unit-x-${i}`) - .5) * Math.max(0, w - 5), y = (random(preset.seed, `roof-unit-y-${i}`) - .5) * Math.max(0, d - 5)
      parts.push(part(`roof-unit-${i}`, 'rooftop', x, y, top + .78, 1.5 + random(preset.seed, `roof-unit-w-${i}`), 1.2, .85, 0, palette.accent))
    }
  }
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

