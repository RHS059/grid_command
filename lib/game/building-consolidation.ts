import { lngLat, local, type GeometryFeature, type Point } from './types'
import { inside } from './visibility'

const CELL = 4
const cellKey = (x: number, y: number) => `${x},${y}`
const edgeKey = (x: number, y: number) => `${x},${y}`

function occupiedCells(feature: GeometryFeature) {
  const rings = feature.rings.map(ring => ring.map(local)), outer = rings[0]
  if (!outer?.length) return new Set<string>()
  const minX = Math.floor(Math.min(...outer.map(p => p.x)) / CELL), maxX = Math.floor(Math.max(...outer.map(p => p.x)) / CELL)
  const minY = Math.floor(Math.min(...outer.map(p => p.y)) / CELL), maxY = Math.floor(Math.max(...outer.map(p => p.y)) / CELL)
  const cells = new Set<string>()
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
    const center = { x: (x + .5) * CELL, y: (y + .5) * CELL }
    if (inside(center, outer) && !rings.slice(1).some(hole => inside(center, hole))) cells.add(cellKey(x, y))
  }
  if (!cells.size) { const center = outer.reduce((sum, p) => ({ x: sum.x + p.x / outer.length, y: sum.y + p.y / outer.length }), { x: 0, y: 0 }); cells.add(cellKey(Math.floor(center.x / CELL), Math.floor(center.y / CELL))) }
  return cells
}

function outline(cells: Set<string>): Point[][] {
  const outgoing = new Map<string, [number, number, number, number][]>()
  const add = (x1: number, y1: number, x2: number, y2: number) => { const key = edgeKey(x1, y1); const list = outgoing.get(key) || []; list.push([x1, y1, x2, y2]); outgoing.set(key, list) }
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number)
    if (!cells.has(cellKey(x, y - 1))) add(x, y, x + 1, y)
    if (!cells.has(cellKey(x + 1, y))) add(x + 1, y, x + 1, y + 1)
    if (!cells.has(cellKey(x, y + 1))) add(x + 1, y + 1, x, y + 1)
    if (!cells.has(cellKey(x - 1, y))) add(x, y + 1, x, y)
  }
  const unused = new Set([...outgoing.values()].flat().map(edge => edge.join(','))), loops: Point[][] = []
  while (unused.size) {
    const first = [...unused][0].split(',').map(Number) as [number, number, number, number], loop: Point[] = [{ x: first[0] * CELL, y: first[1] * CELL }]
    let edge = first
    const maxSteps = unused.size + 4
    for (let guard = 0; guard < maxSteps; guard++) {
      unused.delete(edge.join(',')); loop.push({ x: edge[2] * CELL, y: edge[3] * CELL })
      if (edge[2] === first[0] && edge[3] === first[1]) break
      const next = (outgoing.get(edgeKey(edge[2], edge[3])) || []).find(candidate => unused.has(candidate.join(',')))
      if (!next) break
      edge = next
    }
    if (loop.length >= 4) loops.push(loop)
  }
  const signedArea = (ring: Point[]) => ring.reduce((sum, p, i) => { const n = ring[(i + 1) % ring.length]; return sum + p.x * n.y - n.x * p.y }, 0) / 2
  return loops.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))
}

export interface BuildingAssessmentProgress { done: number; total: number; phase: 'discovering' | 'assessing' | 'ready' }

export async function consolidateBuildingFeatures(features: GeometryFeature[], progress?: (value: BuildingAssessmentProgress) => void) {
  const buildings = features.filter(feature => !feature.water), total = buildings.length
  progress?.({ done: 0, total, phase: 'assessing' })
  const parent = buildings.map((_, index) => index), cellsByBuilding: Set<string>[] = [], exact = new Map<string, number>(), owner = new Map<string, number>()
  const find = (value: number): number => parent[value] === value ? value : (parent[value] = find(parent[value]))
  const join = (a: number, b: number) => { const aa = find(a), bb = find(b); if (aa !== bb) parent[bb] = aa }
  for (let index = 0; index < buildings.length; index++) {
    const cells = occupiedCells(buildings[index]), signature = [...cells].sort().join('|'), duplicate = exact.get(signature)
    cellsByBuilding.push(cells)
    if (duplicate !== undefined) join(index, duplicate)
    else exact.set(signature, index)
    for (const key of cells) { const previous = owner.get(key); if (previous !== undefined) join(index, previous); else owner.set(key, index) }
    if (index % 40 === 0) { progress?.({ done: index, total, phase: 'assessing' }); await new Promise<void>(resolve => setTimeout(resolve, 0)) }
  }
  const groups = new Map<number, { representative: GeometryFeature; cells: Set<string> }>()
  for (let index = 0; index < buildings.length; index++) { const root = find(index), group = groups.get(root) || { representative: buildings[root], cells: new Set<string>() }; for (const key of cellsByBuilding[index]) group.cells.add(key); groups.set(root, group) }
  const consolidated = [...groups.values()].flatMap(({ representative, cells }) => {
    const loops = outline(cells)
    if (!loops.length) return []
    return [{ ...representative, rings: loops.map(loop => loop.map(point => lngLat(point))) }]
  })
  progress?.({ done: total, total, phase: 'ready' })
  return consolidated
}
