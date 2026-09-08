import { local, type GeometryFeature } from './types'

export type BuildingType = 'industrial' | 'commercial' | 'residential' | 'parking-garage' | 'government' | 'apartment' | 'residential-house' | 'power-station' | 'gas-station' | 'grocery-store' | 'department-store' | 'church'
export type BuildingPartKind = 'wall' | 'gable' | 'window' | 'window-flat' | 'window-frame' | 'door' | 'floor' | 'roof' | 'trim' | 'accent' | 'awning' | 'rooftop' | 'detail-box' | 'detail-cylinder' | 'detail-dome' | 'detail-cooling-tower' | 'detail-plane' | 'wire'
export type BuildingPrimitive = 'vertical-plane' | 'triangle-plane' | 'horizontal-plane' | 'box'
export interface InteriorRoomData { type: number; span: number; offset: number; seed: number }
export interface FootprintPoint { x: number; y: number }
export interface BuildingPreset { id: string; name: string; type: BuildingType; width: number; depth: number; floors: number; seed: string; roof?: 'auto' | 'flat' | 'gable'; footprint?: FootprintPoint[]; footprintMode?: 'rectangle' | 'shape'; slopedWalls?: boolean }
export interface BuildingPart { id: string; kind: BuildingPartKind; primitive: BuildingPrimitive; x: number; y: number; z: number; width: number; depth: number; height: number; rotation: number; tilt?: number; roll?: number; color: string; material: string; room?: InteriorRoomData; lod?: 'close' }
export interface BuildingLayout { preset: BuildingPreset; parts: BuildingPart[]; roof: 'flat' | 'gable' }

export const BUILDING_MODULE = 4, FLOOR_HEIGHT = 3.2
export const BUILDING_TYPES: { value: BuildingType; label: string }[] = [
  ['residential-house', 'Residential house'], ['apartment', 'Apartment'], ['commercial', 'Commercial office'], ['grocery-store', 'Grocery store'], ['department-store', 'Department store'], ['gas-station', 'Gas station'], ['industrial', 'Industrial'], ['power-station', 'Power station'], ['parking-garage', 'Parking garage'], ['government', 'Government building'], ['church', 'Church'], ['residential', 'Residential'],
].map(([value, label]) => ({ value: value as BuildingType, label }))
export const SEED_FIELDS = ['Wall material', 'Wall color', 'Window type', 'Window material', 'Roof material', 'Door position', 'Facade & room spans', 'Rooms & exterior details'] as const
type Family = 'industrial' | 'commercial' | 'residential' | 'civic'
type Style = { walls: string[]; trim: string; accent: string; windows: string[]; doors: string[]; roofs: string[] }
const family = (type: BuildingType): Family => ['industrial', 'power-station', 'parking-garage'].includes(type) ? 'industrial' : ['commercial', 'grocery-store', 'department-store', 'gas-station'].includes(type) ? 'commercial' : ['government', 'church'].includes(type) ? 'civic' : 'residential'
const styles: Record<Family, Style> = {
  industrial: { walls: ['#798184', '#687477', '#8a8678', '#746f68'], trim: '#c3b99d', accent: '#414b4e', windows: ['#24495b', '#33464d', '#31565a', '#5f5846'], doors: ['#39464a', '#555b56'], roofs: ['#545c5d', '#6a655e', '#445158'] },
  commercial: { walls: ['#c3b29a', '#adb8b9', '#9ca7ad', '#b59170'], trim: '#e2ded1', accent: '#526a74', windows: ['#24566d', '#293b48', '#39686a', '#6c5b42'], doors: ['#263f49', '#4e4740'], roofs: ['#555f63', '#706b63', '#48545a'] },
  residential: { walls: ['#a9705e', '#b49a76', '#87959b', '#9f8068'], trim: '#dfd4bc', accent: '#514c45', windows: ['#34596b', '#35434c', '#416766', '#655744'], doors: ['#4b3830', '#3e4a48'], roofs: ['#68504a', '#55595a', '#7a6551'] },
  civic: { walls: ['#b9b2a3', '#aaa28e', '#9ba5aa', '#c0a983'], trim: '#e2dccb', accent: '#555b5b', windows: ['#2b5162', '#303e47', '#3c6262', '#675a45'], doors: ['#473d36', '#38484b'], roofs: ['#595553', '#626a6a', '#725d4b'] },
}
const hash = (value: string | number) => [...String(value)].reduce((n, c) => (Math.imul(n, 33) + c.charCodeAt(0)) >>> 0, 5381)
export const normalizeBuildingSeed = (value: unknown) => { const digits = String(value ?? '').replace(/\D/g, ''); if (digits.length >= 16) return digits.slice(0, 16); return `${hash(digits || '1').toString().padStart(10, '0')}${hash(`seed:${digits || '1'}`).toString().padStart(10, '0')}`.slice(0, 16) }
export const seedPairs = (seed: string) => Array.from({ length: 8 }, (_, index) => Number(seed.slice(index * 2, index * 2 + 2)) || 0)
const random = (seed: string, key: string) => hash(`${seed}:${key}`) / 0xffffffff
const primitiveFor = (kind: BuildingPartKind): BuildingPrimitive => kind === 'wall' || kind === 'detail-plane' || kind === 'wire' ? 'vertical-plane' : kind === 'gable' ? 'triangle-plane' : kind === 'floor' ? 'horizontal-plane' : 'box'
const part = (id: string, kind: BuildingPartKind, x: number, y: number, z: number, width: number, depth: number, height: number, rotation: number, color: string, material: string, primitive = primitiveFor(kind)): BuildingPart => {
  const shallowDepth = kind === 'window' ? .09 : kind === 'door' ? .14 : kind === 'trim' ? .16 : depth
  return { id, kind, primitive, x, y, z, width, depth: primitive === 'box' && depth <= 0 ? shallowDepth : depth, height, rotation, color, material }
}
const area = (points: FootprintPoint[]) => points.reduce((sum, p, i) => { const n = points[(i + 1) % points.length]; return sum + p.x * n.y - n.x * p.y }, 0) / 2
const clean = (points: FootprintPoint[]) => points.filter((p, i) => !i || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > .2)
const orthogonal = (points: FootprintPoint[]) => { const result: FootprintPoint[] = []; points.forEach((p, i) => { const n = points[(i + 1) % points.length]; result.push(p); if (Math.abs(n.x - p.x) > .2 && Math.abs(n.y - p.y) > .2) result.push({ x: n.x, y: p.y }) }); return clean(result) }
const polygonFor = (preset: BuildingPreset) => { let points = preset.footprintMode === 'shape' && (preset.footprint?.length || 0) >= 3 ? clean(preset.footprint!) : [{ x: 0, y: 0 }, { x: preset.width, y: 0 }, { x: preset.width, y: preset.depth }, { x: 0, y: preset.depth }]; if (!preset.slopedWalls) points = orthogonal(points); if (area(points) < 0) points.reverse(); const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y)); return points.map(p => ({ x: (p.x - (minX + maxX) / 2) * BUILDING_MODULE, y: (p.y - (minY + maxY) / 2) * BUILDING_MODULE })) }
const inside = (p: FootprintPoint, poly: FootprintPoint[]) => { let hit = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit } return hit }
const roomTypes: Record<BuildingType, number[]> = {
  'residential-house': [0, 0, 1, 1, 2], apartment: [0, 1, 1, 2], residential: [0, 1, 2],
  commercial: [2, 2, 3, 3, 5], 'grocery-store': [4, 4, 5], 'department-store': [5, 5, 4], 'gas-station': [4, 5, 2],
  industrial: [6, 6, 2], 'power-station': [6, 6, 7], 'parking-garage': [8], government: [2, 3, 3, 7], church: [7, 3],
}
const roomFor = (preset: BuildingPreset, floor: number, edge: number, group: number, span: number, offset: number): InteriorRoomData => {
  const seed = random(preset.seed.slice(14, 16), `room-${floor}-${edge}-${group}`), choices = roomTypes[preset.type] || roomTypes.residential
  const residentialOffset = family(preset.type) === 'residential' ? floor + edge + Math.floor(group / Math.max(1, span)) : 0
  return { type: choices[(Math.floor(seed * choices.length) + residentialOffset) % choices.length], span, offset, seed }
}

export function normalizeBuildingPreset(value: BuildingPreset): BuildingPreset {
  const known = BUILDING_TYPES.map(item => item.value), type = known.includes(value.type) ? value.type : 'residential-house', footprint = Array.isArray(value.footprint) ? value.footprint.map(p => ({ x: Number(p.x), y: Number(p.y) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 96) : undefined
  return { id: String(value.id || `building-${hash(value.name || 'preset')}`), name: String(value.name || 'Untitled building'), type, width: Math.max(1, Math.min(24, Math.round(Number(value.width) || 1))), depth: Math.max(1, Math.min(24, Math.round(Number(value.depth) || 1))), floors: Math.max(1, Math.min(40, Math.round(Number(value.floors) || 1))), seed: normalizeBuildingSeed(value.seed), roof: ['flat', 'gable'].includes(value.roof || '') ? value.roof : 'auto', footprint: footprint && footprint.length >= 3 ? footprint : undefined, footprintMode: value.footprintMode === 'shape' && footprint && footprint.length >= 3 ? 'shape' : 'rectangle', slopedWalls: !!value.slopedWalls }
}

export function generateBuilding(input: BuildingPreset): BuildingLayout {
  const preset = normalizeBuildingPreset(input), group = family(preset.type), style = styles[group], seeds = seedPairs(preset.seed), points = polygonFor(preset), parts: BuildingPart[] = []
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y)), w = maxX - minX, d = maxY - minY
  const wallMaterial = preset.type === 'government' ? 'cut-stone' : ['stucco', 'brick', 'concrete', 'metal-panel'][seeds[0] % 4], wallColor = preset.type === 'government' ? '#b8b3a8' : style.walls[seeds[1] % style.walls.length], windowType = ['narrow', 'square', 'wide', 'ribbon'][seeds[2] % 4], windowMaterial = ['clear-glass', 'smoked-glass', 'green-glass', 'amber-glass'][seeds[3] % 4], windowColor = style.windows[seeds[3] % style.windows.length], roofMaterial = ['standing-seam', 'shingle', 'membrane'][seeds[4] % 3], roofColor = preset.type === 'government' ? '#697274' : style.roofs[seeds[4] % style.roofs.length]
  const shape = preset.footprintMode === 'shape', autoGable = ['residential-house', 'residential', 'church', 'government'].includes(preset.type), roof = preset.roof === 'auto' ? !shape && autoGable ? 'gable' : 'flat' : preset.roof === 'gable' && shape ? 'flat' : preset.roof || 'flat'
  const edges = points.map((start, i) => { const end = points[(i + 1) % points.length], dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy); return { start, end, dx, dy, length, rotation: Math.atan2(dy, dx), nx: dy / length, ny: -dx / length } }).filter(e => e.length > .25)
  const doorEdge = seeds[5] % edges.length, roomSpanSeed = preset.seed.slice(12, 14), detailSeed = preset.seed.slice(14, 16), buildingHasSills = random(detailSeed, 'building-sills') > .24, sizes = { narrow: [1.15, 1.55], square: [1.55, 1.55], wide: [2.35, 1.35], ribbon: [3.25, 1.05] } as const
  const windowDensity: Record<BuildingType, number> = { 'residential-house': .58, apartment: .72, residential: .62, commercial: .68, 'grocery-store': .46, 'department-store': .52, 'gas-station': .42, industrial: .32, 'power-station': .10, 'parking-garage': .72, government: .56, church: .24 }
  const facadeAllowsWindow = (floor: number, edge: number, module: number, count: number) => {
    if (preset.type === 'power-station') return false
    if (preset.type === 'parking-garage') return count <= 2 || (module + edge) % Math.max(4, count) !== 0
    if (floor === 0 && edge === doorEdge && ['gas-station', 'grocery-store'].includes(preset.type)) return true
    if (count === 1) return random(preset.seed, `single-window-${floor}-${edge}`) < windowDensity[preset.type]
    const patternModule = preset.type === 'government' ? Math.min(module, count - 1 - module) : module, phase = (seeds[6] + edge * 2 + floor) % 6
    const patternedBlank = (patternModule + phase) % (preset.type === 'power-station' ? 3 : seeds[6] % 2 ? 4 : 5) === 0
    return !patternedBlank && random(preset.seed, `facade-window-${floor}-${edge}-${patternModule}`) < windowDensity[preset.type]
  }
  const closeDetail = (item: BuildingPart) => { item.lod = 'close'; return item }
  for (let floor = 0; floor < preset.floors; floor++) {
    if (floor === 0 || preset.type === 'parking-garage') for (let gx = Math.floor(minX / BUILDING_MODULE); gx < Math.ceil(maxX / BUILDING_MODULE); gx++) for (let gy = Math.floor(minY / BUILDING_MODULE); gy < Math.ceil(maxY / BUILDING_MODULE); gy++) { const x = (gx + .5) * BUILDING_MODULE, y = (gy + .5) * BUILDING_MODULE; if (inside({ x, y }, points)) parts.push(part(`floor-${floor}-${gx}-${gy}`, 'floor', x, y, floor * FLOOR_HEIGHT + .04, BUILDING_MODULE, BUILDING_MODULE, 0, 0, style.trim, 'concrete-slab')) }
    edges.forEach((edge, edgeIndex) => { const count = Math.max(1, Math.ceil(edge.length / BUILDING_MODULE)), moduleWidth = edge.length / count, doorModule = ['government', 'church'].includes(preset.type) ? Math.floor(count / 2) : Math.min(count - 1, Math.floor(seeds[5] * count / 100)), spanRoll = random(roomSpanSeed, `span-${floor}-${edgeIndex}`), roomWidth = count >= 3 && spanRoll > .34 ? spanRoll > .78 ? 3 : 2 : 1; for (let module = 0; module < count; module++) { const ratio = (module + .5) / count, x = edge.start.x + edge.dx * ratio, y = edge.start.y + edge.dy * ratio, id = `edge-${edgeIndex}-${floor}-${module}`, isDoor = floor === 0 && edgeIndex === doorEdge && module === doorModule
      const parkingOpening = preset.type === 'parking-garage' && !isDoor && facadeAllowsWindow(floor, edgeIndex, module, count), showWindow = !isDoor && (parkingOpening || facadeAllowsWindow(floor, edgeIndex, module, count)), fx = x + edge.nx * .025, fy = y + edge.ny * .025
      if (parkingOpening) {
        const base = floor * FLOOR_HEIGHT
        parts.push(part(`${id}-spandrel`, 'wall', x, y, base + .48, moduleWidth, 0, .96, edge.rotation, '#9a9b96', 'board-formed-concrete'))
        parts.push(part(`${id}-header`, 'detail-box', x, y, base + FLOOR_HEIGHT - .23, moduleWidth, .42, .46, edge.rotation, '#aaa9a2', 'concrete-beam'))
        parts.push(part(`${id}-column`, 'detail-box', x - edge.dx / edge.length * moduleWidth / 2, y - edge.dy / edge.length * moduleWidth / 2, base + FLOOR_HEIGHT / 2, .38, .5, FLOOR_HEIGHT, edge.rotation, '#aaa9a2', 'concrete-column'))
      } else parts.push(part(`${id}-wall`, 'wall', x, y, floor * FLOOR_HEIGHT + FLOOR_HEIGHT / 2, moduleWidth, 0, FLOOR_HEIGHT, edge.rotation, wallColor, wallMaterial))
      if (isDoor) { const bay = ['industrial', 'power-station', 'parking-garage'].includes(preset.type), doubleDoor = ['church', 'government'].includes(preset.type), dw = bay ? Math.min(moduleWidth * .84, 3.2) : doubleDoor ? Math.min(moduleWidth * .74, 2.7) : Math.min(moduleWidth * .52, 1.7), dh = bay ? 2.55 : 2.3; parts.push(part(`${id}-door-frame`, 'trim', fx, fy, dh / 2, dw + .28, 0, dh + .25, edge.rotation, style.trim, 'painted-trim')); if (doubleDoor) { const tangentX = edge.dx / edge.length, tangentY = edge.dy / edge.length, leafWidth = dw / 2 - .035, leafOffset = dw / 4 + .018; for (const side of [-1, 1]) parts.push(part(`${id}-door-leaf-${side}`, 'door', x + edge.nx * .04 + tangentX * leafOffset * side, y + edge.ny * .04 + tangentY * leafOffset * side, dh / 2, leafWidth, 0, dh, edge.rotation, style.doors[seeds[5] % style.doors.length], 'painted-door')); parts.push(part(`${id}-door-center`, 'trim', fx, fy, dh / 2, .09, .08, dh + .08, edge.rotation, style.trim, 'door-center-seam', 'box')) } else parts.push(part(`${id}-door`, 'door', x + edge.nx * .04, y + edge.ny * .04, dh / 2, dw, 0, dh, edge.rotation, style.doors[seeds[5] % style.doors.length], bay ? 'rollup-steel' : 'painted-door')); if (bay) for (let slat = 1; slat < 5; slat++) parts.push(closeDetail(part(`${id}-garage-slat-${slat}`, 'detail-box', x + edge.nx * .09, y + edge.ny * .09, slat * dh / 5, dw * .92, .035, .035, edge.rotation, style.trim, 'garage-slat'))) }
      else if (showWindow) { const storefront = floor === 0 && ['commercial', 'grocery-store', 'department-store', 'gas-station'].includes(preset.type), selectedType = parkingOpening || storefront ? 'ribbon' : windowType as keyof typeof sizes, [baseW, baseH] = sizes[selectedType], ww = Math.min(moduleWidth * .82, baseW), wh = storefront ? 2.25 : parkingOpening ? 1.45 : baseH, z = floor * FLOOR_HEIGHT + (storefront ? 1.42 : parkingOpening ? 1.65 : 1.78)
        if (!parkingOpening) parts.push(part(`${id}-window-frame`, 'window-frame', x + edge.nx * .058, y + edge.ny * .058, z, ww + .22, .08, wh + .22, edge.rotation, style.trim, 'painted-trim', 'box'))
        const roomGroup = Math.floor(module / roomWidth) * roomWidth, roomSpan = Math.min(roomWidth, count - roomGroup), window = part(`${id}-window`, 'window', x + edge.nx * .065, y + edge.ny * .065, z, ww, 0, wh, edge.rotation, windowColor, windowMaterial, 'vertical-plane'); window.room = roomFor(preset, floor, edgeIndex, roomGroup, roomSpan, module - roomGroup); parts.push(window)
        if (buildingHasSills && !parkingOpening) parts.push(closeDetail(part(`${id}-sill`, 'detail-box', x + edge.nx * .16, y + edge.ny * .16, z - wh / 2 - .13, ww + .32, .34, .10, edge.rotation, style.trim, 'window-sill')))
        if (floor === 0 && !parkingOpening && random(detailSeed, `${id}-awning`) > .68) parts.push(part(`${id}-awning`, 'awning', x + edge.nx * .72, y + edge.ny * .72, z + wh / 2 + .22, ww + .42, 1.25, .12, edge.rotation, style.accent, 'fabric-awning', 'box'))
        if (floor > 0 && ['apartment', 'commercial', 'government'].includes(preset.type) && random(detailSeed, `${id}-ac`) > .83) parts.push(closeDetail(part(`${id}-window-ac`, 'detail-box', x + edge.nx * .28, y + edge.ny * .28, z - wh / 2 + .16, Math.min(.72, ww * .55), .44, .34, edge.rotation, '#a9afb0', 'window-air-conditioner')))
        if (!parkingOpening && (selectedType === 'wide' || selectedType === 'ribbon')) parts.push(part(`${id}-mullion`, 'accent', x + edge.nx * .072, y + edge.ny * .072, z, .07, .04, wh, edge.rotation, style.trim, 'window-mullion', 'box')); if (preset.type === 'apartment' && floor > 0 && (module + floor + seeds[7]) % 4 === 0) parts.push(part(`${id}-balcony`, 'awning', x + edge.nx * .62, y + edge.ny * .62, floor * FLOOR_HEIGHT + .72, Math.min(2.8, moduleWidth * .8), 1.15, .14, edge.rotation, style.accent, 'balcony', 'box')) }
    } })
  }
  const top = preset.floors * FLOOR_HEIGHT
  if (roof === 'gable') {
    const alongX = w >= d, span = alongX ? d : w, length = alongX ? w : d, run = span / 2, rise = Math.min(3.2, Math.max(1.1, run * .38)), slopeLength = Math.hypot(run, rise), pitch = Math.atan2(rise, run)
    for (const side of [-1, 1]) parts.push({ ...part(`roof-gable-${side}`, 'roof', alongX ? 0 : side * run / 2, alongX ? side * run / 2 : 0, top + rise / 2, length + .5, slopeLength + .36, .18, alongX ? 0 : Math.PI / 2, roofColor, roofMaterial), tilt: alongX ? -side * pitch : side * pitch })
    for (const side of [-1, 1]) parts.push(part(`gable-end-${side}`, 'gable', alongX ? side * length / 2 : 0, alongX ? 0 : side * length / 2, top + rise / 3, span, 0, rise, alongX ? Math.PI / 2 : 0, wallColor, wallMaterial))
    parts.push(part('roof-ridge', 'trim', 0, 0, top + rise + .07, length + .58, .16, .16, alongX ? 0 : Math.PI / 2, style.trim, 'ridge-cap', 'box'))
    if (seeds[7] % 4 !== 0) for (const side of [-1, 1]) {
      parts.push(closeDetail(part(`gutter-${side}`, 'detail-box', alongX ? 0 : side * span / 2, alongX ? side * span / 2 : 0, top + .02, length + .42, .16, .14, alongX ? 0 : Math.PI / 2, '#4b5557', 'rain-gutter')))
      for (const end of [-1, 1]) parts.push(closeDetail(part(`downspout-${side}-${end}`, 'detail-cylinder', alongX ? end * length / 2 : side * span / 2, alongX ? side * span / 2 : end * length / 2, top / 2, .13, .13, top, 0, '#4b5557', 'downspout')))
    }
  }
  else {
    for (let gx = Math.floor(minX / BUILDING_MODULE); gx < Math.ceil(maxX / BUILDING_MODULE); gx++) for (let gy = Math.floor(minY / BUILDING_MODULE); gy < Math.ceil(maxY / BUILDING_MODULE); gy++) {
      const x = (gx + .5) * BUILDING_MODULE, y = (gy + .5) * BUILDING_MODULE, inset = BUILDING_MODULE / 2 - .03
      const cornersInside = [[-inset, -inset], [inset, -inset], [inset, inset], [-inset, inset]].every(([ox, oy]) => inside({ x: x + ox, y: y + oy }, points))
      if (cornersInside) parts.push(part(`roof-${gx}-${gy}`, 'roof', x, y, top + .09, BUILDING_MODULE + .04, BUILDING_MODULE + .04, .18, 0, roofColor, roofMaterial))
      else for (let sx = 0; sx < 4; sx++) for (let sy = 0; sy < 4; sy++) { const tx = x - 1.5 + sx, ty = y - 1.5 + sy; if (inside({ x: tx, y: ty }, points)) parts.push(part(`roof-${gx}-${gy}-${sx}-${sy}`, 'roof', tx, ty, top + .09, 1.04, 1.04, .18, 0, roofColor, roofMaterial)) }
    }
    edges.forEach((edge, i) => parts.push(part(`parapet-${i}`, 'trim', (edge.start.x + edge.end.x) / 2, (edge.start.y + edge.end.y) / 2, top + .48, edge.length, 0, .72, edge.rotation, style.trim, 'parapet')))
    const count = Math.max(1, Math.min(4, Math.floor(w * d / 180) + seeds[7] % 2)); for (let i = 0; i < count; i++) parts.push(part(`roof-unit-${i}`, 'rooftop', (random(preset.seed, `rx${i}`) - .5) * Math.max(0, w - 5), (random(preset.seed, `ry${i}`) - .5) * Math.max(0, d - 5), top + .72, 1.3 + random(preset.seed, `rw${i}`), 1.15, .85, 0, style.accent, 'air-conditioner'))
  }
  const addDetail = (item: BuildingPart, close = false) => { if (close) item.lod = 'close'; parts.push(item) }
  const front = edges[doorEdge], rear = edges[(doorEdge + Math.floor(edges.length / 2)) % edges.length], utility = edges[(doorEdge + 1) % edges.length]
  const edgePoint = (edge: typeof front, ratio: number, outset: number) => ({ x: edge.start.x + edge.dx * ratio + edge.nx * outset, y: edge.start.y + edge.dy * ratio + edge.ny * outset })
  const frontCenter = edgePoint(front, .5, .14), rearCenter = edgePoint(rear, .5, .62), utilityCenter = edgePoint(utility, .58, .18)

  if (roof === 'flat') { const hvacCount = Math.max(1, Math.min(4, Math.floor(w * d / 180) + seeds[7] % 2)); for (let i = 0; i < hvacCount; i++) { const hx = (random(preset.seed, `rx${i}`) - .5) * Math.max(0, w - 5), hy = (random(preset.seed, `ry${i}`) - .5) * Math.max(0, d - 5); addDetail(part(`roof-fan-${i}`, 'detail-cylinder', hx, hy, top + 1.18, .58, .58, .12, 0, '#313a3c', 'air-conditioner-fan')) } }

  if (['commercial', 'grocery-store', 'department-store', 'gas-station', 'church'].includes(preset.type)) addDetail(part('facade-sign', 'detail-plane', frontCenter.x, frontCenter.y, Math.min(top - .35, 2.8), Math.min(7, front.length * .58), 0, .68, front.rotation, preset.type === 'church' ? '#d5c190' : style.accent, `${preset.type}-sign`, 'vertical-plane'))

  if (preset.type === 'church') {
    const flag = edgePoint(front, .24, .72)
    addDetail(part('flag-pole', 'detail-cylinder', flag.x, flag.y, 3.1, .07, .07, 6.2, 0, '#949c9d', 'flag-pole'))
    addDetail(part('flag-cloth', 'detail-plane', flag.x + Math.cos(front.rotation) * .62, flag.y + Math.sin(front.rotation) * .62, 5.25, 1.25, 0, .72, front.rotation, '#796b55', 'flag', 'vertical-plane'))
  }

  if (['residential-house', 'apartment', 'residential', 'church'].includes(preset.type)) for (let i = 0; i < 2 + seeds[7] % 2; i++) {
    const pot = edgePoint(front, .5 + (i - .7) * .11, .38)
    addDetail(part(`entry-pot-${i}`, 'detail-cylinder', pot.x, pot.y, .24, .32 + i * .05, .32 + i * .05, .48 + i * .08, 0, i % 2 ? '#8b6448' : '#6e7656', 'pottery'), true)
  }

  if (['industrial', 'power-station', 'parking-garage', 'commercial', 'grocery-store', 'department-store'].includes(preset.type)) {
    addDetail(part('rear-dumpster', 'detail-box', rearCenter.x, rearCenter.y, .58, 1.75, .92, 1.16, rear.rotation, '#435b4d', 'dumpster'), true)
    const bin = edgePoint(rear, .68, .48); addDetail(part('rear-trash-bin', 'detail-cylinder', bin.x, bin.y, .45, .55, .55, .9, 0, '#3f4745', 'trash-can'), true)
  }

  addDetail(part('electric-box', 'detail-box', utilityCenter.x, utilityCenter.y, 1.15, .72, .25, 1.05, utility.rotation, '#697374', 'electric-box'), true)
  const wireTop = Math.max(2.6, top - .55), tangentX = utility.dx / utility.length, tangentY = utility.dy / utility.length
  const wirePoint = (t: number) => ({ x: utilityCenter.x + tangentX * (t * 1.25 - .3) + utility.nx * .16, y: utilityCenter.y + tangentY * (t * 1.25 - .3) + utility.ny * .16, z: 1.55 + (wireTop - 1.55) * t - Math.sin(t * Math.PI) * .24 })
  for (let i = 0; i < 13; i++) { const start = wirePoint(i / 13), end = wirePoint((i + 1) / 13), dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z, length = Math.hypot(dx, dy, dz), segment = part(`service-wire-${i}`, 'wire', (start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2, .045, 0, length * 1.035, utility.rotation, '#202625', 'service-wire', 'vertical-plane'); segment.roll = Math.atan2(Math.hypot(dx, dy), dz); addDetail(segment, true) }

  if (['industrial', 'power-station', 'parking-garage'].includes(preset.type)) for (let i = 0; i < 2 + seeds[7] % 3; i++) { const pipe = edgePoint(utility, .18 + i * .13, .22); addDetail(part(`service-pipe-${i}`, 'detail-cylinder', pipe.x, pipe.y, top * .42, .16, .16, Math.max(1.8, top * .72), 0, i % 2 ? '#807260' : '#596667', 'service-pipe'), true) }

  if (roof === 'flat' && ['apartment', 'commercial', 'government', 'department-store'].includes(preset.type) && random(detailSeed, 'water-tower') > .56) {
    const towerX = (random(detailSeed, 'tower-x') - .5) * Math.max(0, w - 5), towerY = (random(detailSeed, 'tower-y') - .5) * Math.max(0, d - 5)
    for (const sideX of [-1, 1]) for (const sideY of [-1, 1]) addDetail(part(`water-tower-leg-${sideX}-${sideY}`, 'detail-box', towerX + sideX * .46, towerY + sideY * .46, top + .88, .10, .10, 1.55, 0, '#50595b', 'water-tower-leg'))
    addDetail(part('water-tower', 'detail-cylinder', towerX, towerY, top + 1.85, 1.65, 1.65, 1.25, 0, '#697779', 'water-tower'))
    addDetail(part('water-tower-cap', 'detail-cylinder', towerX, towerY, top + 2.5, 1.25, 1.25, .16, 0, '#535f60', 'water-tower-cap'))
  }
  if (preset.type === 'grocery-store') { const edge = edges[doorEdge], x = (edge.start.x + edge.end.x) / 2 + edge.nx * 1.1, y = (edge.start.y + edge.end.y) / 2 + edge.ny * 1.1; parts.push(part('front-canopy', 'awning', x, y, 2.75, Math.min(edge.length * .8, 12), 2.3, .18, edge.rotation, style.accent, 'store-canopy', 'box')) }

  if (preset.type === 'gas-station') {
    const tangentX = front.dx / front.length, tangentY = front.dy / front.length, canopyWidth = Math.min(14, Math.max(7, front.length * .9)), island = edgePoint(front, .5, 5.4)
    addDetail(part('fuel-canopy', 'awning', island.x, island.y, 3.45, canopyWidth, 4.8, .28, front.rotation, style.accent, 'fuel-canopy', 'box'))
    for (const side of [-1, 1]) for (const row of [-1, 1]) addDetail(part(`fuel-canopy-column-${side}-${row}`, 'detail-cylinder', island.x + tangentX * side * (canopyWidth / 2 - .65) + front.nx * row * 1.7, island.y + tangentY * side * (canopyWidth / 2 - .65) + front.ny * row * 1.7, 1.7, .24, .24, 3.4, 0, style.trim, 'canopy-column'))
    const pumpCount = Math.max(2, Math.min(4, Math.floor(canopyWidth / 3.2)))
    for (let i = 0; i < pumpCount; i++) {
      const along = (i - (pumpCount - 1) / 2) * Math.min(3.1, canopyWidth / pumpCount), px = island.x + tangentX * along, py = island.y + tangentY * along
      addDetail(part(`fuel-island-${i}`, 'detail-box', px, py, .12, 1.45, 1.05, .24, front.rotation, '#777b76', 'concrete-island'))
      addDetail(part(`fuel-pump-${i}`, 'detail-box', px, py, .92, .72, .48, 1.6, front.rotation, i % 2 ? '#d9d5c8' : '#c8d0ce', 'fuel-pump'))
      addDetail(part(`fuel-pump-top-${i}`, 'detail-box', px, py, 1.78, .82, .54, .18, front.rotation, style.accent, 'fuel-pump-sign'))
      for (const side of [-1, 1]) addDetail(part(`fuel-bollard-${i}-${side}`, 'detail-cylinder', px + tangentX * side * .58, py + tangentY * side * .58, .48, .16, .16, .96, 0, '#d6a62e', 'safety-bollard'), true)
    }
  }

  if (preset.type === 'power-station') {
    const tangentX = rear.dx / rear.length, tangentY = rear.dy / rear.length, yard = edgePoint(rear, .5, 4.2), process = edgePoint(front, .5, -Math.min(2.5, d * .12))
    const plantLength = Math.max(10, Math.min(24, w * .78)), plantDepth = Math.max(7, Math.min(15, d * .66)), plantHeight = Math.max(7, top * .78)
    addDetail(part('turbine-hall', 'detail-box', process.x, process.y, plantHeight * .32, plantLength, plantDepth, plantHeight * .64, front.rotation, '#777970', 'industrial-turbine-hall'))
    addDetail(part('boiler-house', 'detail-box', process.x - tangentX * plantLength * .18, process.y - tangentY * plantLength * .18, plantHeight * .72, plantLength * .42, plantDepth * .72, plantHeight * .72, front.rotation, '#686b65', 'industrial-boiler-house'))
    for (const side of [-1, 1]) {
      const cx = process.x + tangentX * side * plantLength * .34, cy = process.y + tangentY * side * plantLength * .34
      addDetail(part(`cooling-tower-${side}`, 'detail-cooling-tower', cx, cy, 4.7, 5.8, 5.8, 9.4, 0, '#9a9688', 'weathered-concrete'))
      addDetail(part(`cooling-tower-rim-${side}`, 'detail-cylinder', cx, cy, 9.38, 2.08, 2.08, .18, 0, '#b5b1a4', 'cooling-tower-rim'))
    }
    for (const side of [-1, 1]) {
      const sx = process.x + tangentX * side * plantLength * .12, sy = process.y + tangentY * side * plantLength * .12
      addDetail(part(`smokestack-${side}`, 'detail-cylinder', sx, sy, 8.5, 1.15, 1.15, 17, 0, side < 0 ? '#8a755f' : '#77776f', 'power-station-stack'))
      addDetail(part(`smokestack-band-${side}`, 'detail-cylinder', sx, sy, 15.4, 1.22, 1.22, .7, 0, '#c9c3b3', 'stack-band'))
    }
    for (let i = -2; i <= 2; i++) addDetail(part(`process-pipe-${i}`, 'detail-cylinder', process.x + tangentX * i * 1.15 + front.nx * plantDepth * .47, process.y + tangentY * i * 1.15 + front.ny * plantDepth * .47, 2.0 + Math.abs(i) * .25, .28, .28, 4 + Math.abs(i) * .5, 0, i % 2 ? '#8b7357' : '#596667', 'process-pipe'))
    addDetail(part('main-transformer', 'detail-box', yard.x, yard.y, 1.25, 3.4, 2.2, 2.5, rear.rotation, '#59645f', 'power-transformer'))
    for (const side of [-1, 1]) {
      const rx = yard.x + tangentX * side * 2.0, ry = yard.y + tangentY * side * 2.0
      addDetail(part(`transformer-radiator-${side}`, 'detail-box', rx, ry, 1.15, .52, 2.35, 1.75, rear.rotation, '#3f4d49', 'transformer-radiator'))
      for (let fin = -1; fin <= 1; fin++) addDetail(part(`radiator-fin-${side}-${fin}`, 'detail-box', rx + tangentX * fin * .15, ry + tangentY * fin * .15, 1.15, .06, 2.5, 1.82, rear.rotation, '#758078', 'radiator-fin'), true)
    }
    for (let i = -1; i <= 1; i++) addDetail(part(`transformer-bushing-${i}`, 'detail-cylinder', yard.x + tangentX * i * .78, yard.y + tangentY * i * .78, 3.02, .18, .18, 1.05, 0, '#8d7658', 'ceramic-insulator'))
    for (const side of [-1, 1]) { const gx = yard.x + tangentX * side * 3.5, gy = yard.y + tangentY * side * 3.5; addDetail(part(`gantry-post-${side}`, 'detail-box', gx, gy, 2.4, .18, .18, 4.8, rear.rotation, '#4c5758', 'steel-gantry')); addDetail(part(`switch-cabinet-${side}`, 'detail-box', gx + rear.nx * .8, gy + rear.ny * .8, .9, 1.15, .7, 1.8, rear.rotation, '#737d76', 'switchgear-cabinet')) }
    addDetail(part('gantry-crossbar', 'detail-box', yard.x, yard.y, 4.45, 7.2, .22, .22, rear.rotation, '#4c5758', 'steel-gantry'))
    for (let i = -1; i <= 1; i++) addDetail(part(`gantry-bus-${i}`, 'wire', yard.x + rear.nx * i * .42, yard.y + rear.ny * i * .42, 4.12, 6.8, 0, .06, rear.rotation, '#6d7774', 'bus-conductor', 'vertical-plane'), true)
  }

  if (preset.type === 'government') {
    const tangentX = front.dx / front.length, tangentY = front.dy / front.length, portico = edgePoint(front, .5, 2.05), porticoWidth = Math.min(13, Math.max(7, front.length * .58)), porticoTop = Math.max(5.7, Math.min(top - .18, FLOOR_HEIGHT * 2.05)), stone = '#d6d0bf'
    addDetail(part('civic-portico-entablature', 'detail-box', portico.x, portico.y, porticoTop, porticoWidth, 3.7, .48, front.rotation, stone, 'stone-entablature'))
    addDetail(part('civic-front-cornice', 'trim', frontCenter.x, frontCenter.y, top - .08, Math.min(front.length * .94, 22), .42, .56, front.rotation, stone, 'stone-cornice', 'box'))
    addDetail(part('civic-portico-plinth', 'detail-box', portico.x, portico.y, .28, porticoWidth + 1.2, 4.25, .56, front.rotation, '#c5bead', 'stone-plinth'))
    for (let step = 0; step < 5; step++) addDetail(part(`civic-step-${step}`, 'detail-box', portico.x + front.nx * (2.3 + step * .34), portico.y + front.ny * (2.3 + step * .34), .08 + step * .10, porticoWidth + 1.8 - step * .22, .68, .16 + step * .2, front.rotation, '#c8c2b3', 'stone-step'))
    for (let i = 0; i < 6; i++) { const offset = (i / 5 - .5) * porticoWidth * .84, cx = portico.x + tangentX * offset, cy = portico.y + tangentY * offset; addDetail(part(`civic-column-${i}`, 'detail-cylinder', cx, cy, porticoTop / 2, .54, .54, porticoTop, 0, stone, 'fluted-stone-column')); addDetail(part(`civic-column-base-${i}`, 'detail-cylinder', cx, cy, .36, .72, .72, .28, 0, stone, 'column-base')); addDetail(part(`civic-column-cap-${i}`, 'detail-box', cx, cy, porticoTop - .18, .78, .78, .28, front.rotation, stone, 'column-capital')) }
    addDetail(part('civic-pediment', 'gable', portico.x + front.nx * .03, portico.y + front.ny * .03, porticoTop + 1.05, porticoWidth + .8, 0, 2.1, front.rotation, stone, 'stone-pediment', 'triangle-plane'))
    const roofPeak = top + Math.min(3.2, Math.max(1.1, Math.min(w, d) * .19)), towerBase = roofPeak + .12
    addDetail(part('civic-tower-base', 'detail-box', 0, 0, towerBase + 1.35, 4.2, 4.2, 2.7, 0, '#c8c1b1', 'stone-tower'))
    addDetail(part('civic-tower-balcony', 'detail-box', 0, 0, towerBase + 2.82, 4.85, 4.85, .30, 0, stone, 'stone-balcony'))
    addDetail(part('civic-belfry-floor', 'detail-box', 0, 0, towerBase + 3.08, 3.75, 3.75, .22, 0, stone, 'belfry-floor'))
    for (const xSide of [-1, 1]) for (const ySide of [-1, 1]) { for (const shift of [-.42, .42]) { addDetail(part(`civic-belfry-x-${xSide}-${ySide}-${shift}`, 'detail-cylinder', xSide * 1.45, ySide * .92 + shift, towerBase + 4.25, .24, .24, 2.35, 0, stone, 'belfry-column')); addDetail(part(`civic-belfry-y-${xSide}-${ySide}-${shift}`, 'detail-cylinder', xSide * .92 + shift, ySide * 1.45, towerBase + 4.25, .24, .24, 2.35, 0, stone, 'belfry-column')) } }
    addDetail(part('civic-belfry-cornice', 'detail-box', 0, 0, towerBase + 5.52, 4.05, 4.05, .30, 0, stone, 'belfry-cornice'))
    addDetail(part('civic-gold-dome', 'detail-dome', 0, 0, towerBase + 5.67, 3.4, 3.4, 2.0, 0, '#b89a46', 'golden-dome'))
    addDetail(part('civic-flag-pole', 'detail-cylinder', 0, 0, towerBase + 7.65, .10, .10, 2.3, 0, '#8d9698', 'flag-pole'))
    addDetail(part('civic-flag', 'detail-plane', .62, 0, towerBase + 8.42, 1.25, 0, .68, 0, '#375d87', 'civic-flag', 'vertical-plane'))
  }
  if (preset.type === 'church') { parts.push(part('steeple', 'rooftop', 0, 0, top + 1.25, 1.5, 1.5, 2.5, 0, style.trim, 'stone-steeple', 'box')); parts.push(part('spire', 'rooftop', 0, 0, top + 3.05, .2, .2, 1.2, 0, style.accent, 'metal-spire', 'box')) }
  return { preset, parts, roof }
}

export function presetFromFeature(feature: GeometryFeature): { preset: BuildingPreset; x: number; y: number; rotation: number; elevation: number } | undefined { const source = feature.rings[0]; if (feature.water || !source?.length) return; const ring = source.map(local); let longest = 0, rotation = 0; for (let i = 0; i < ring.length - 1; i++) { const dx = ring[i + 1].x - ring[i].x, dy = ring[i + 1].y - ring[i].y, length = Math.hypot(dx, dy); if (length > longest) { longest = length; rotation = Math.atan2(dy, dx) } } const cos = Math.cos(rotation), sin = Math.sin(rotation), projected = ring.map(({ x, y }) => ({ a: x * cos + y * sin, b: -x * sin + y * cos })), minA = Math.min(...projected.map(p => p.a)), maxA = Math.max(...projected.map(p => p.a)), minB = Math.min(...projected.map(p => p.b)), maxB = Math.max(...projected.map(p => p.b)), x = ((minA + maxA) / 2) * cos - ((minB + maxB) / 2) * sin, y = ((minA + maxA) / 2) * sin + ((minB + maxB) / 2) * cos, types: BuildingType[] = ['industrial', 'commercial', 'residential-house', 'apartment', 'parking-garage', 'government']; return { x, y, rotation, elevation: (feature.elevation || 0) + (feature.base || 0), preset: normalizeBuildingPreset({ id: feature.key, name: feature.key, type: types[hash(feature.key) % types.length], width: Math.max(1, Math.round((maxA - minA) / BUILDING_MODULE)), depth: Math.max(1, Math.round((maxB - minB) / BUILDING_MODULE)), floors: Math.max(1, Math.round(Math.max(FLOOR_HEIGHT, (feature.roof || 6) - (feature.base || 0)) / FLOOR_HEIGHT)), seed: normalizeBuildingSeed(`${hash(feature.key)}${hash(`map:${feature.key}`)}`) }) } }
export function parseBuildingPresets(value: unknown): BuildingPreset[] { if (!Array.isArray(value)) throw new Error('Building preset file must contain a JSON list.'); return value.map(item => normalizeBuildingPreset(item as BuildingPreset)) }

