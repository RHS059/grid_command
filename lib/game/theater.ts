import { MercatorCoordinate } from 'maplibre-gl'
import type { Point, Side } from './types'
export const ORIGIN: [number, number] = [-117.08, 32.82]
const origin = MercatorCoordinate.fromLngLat(ORIGIN), scale = origin.meterInMercatorCoordinateUnits()
export const toPoint = (longitude: number, latitude: number): Point => { const p=MercatorCoordinate.fromLngLat([longitude,latitude]);return {x:(p.x-origin.x)/scale,y:(origin.y-p.y)/scale} }
export const fromPoint = (p: Point): [number,number] => { const ll=new MercatorCoordinate(origin.x+p.x*scale,origin.y-p.y*scale).toLngLat();return [ll.lng,ll.lat] }
export const CITY_BASES: Record<Side, Point> = { BLU: toPoint(-117.035, 32.546), RED: toPoint(-117.005, 33.092) }
export const CITY_AIRBASES: Record<Side, Point> = { BLU: toPoint(-117.026, 32.553), RED: toPoint(-117.019, 33.084) }
export const CITY_OBJECTIVES = [
  ['A', 'San Pasqual Valley', -117.0199, 33.078], ['B', 'Rancho Bernardo', -117.074, 33.017],
  ['C', 'Carmel Mountain', -117.083, 32.978], ['D', 'Sabre Springs', -117.094, 32.948],
  ['E', 'Scripps Ranch', -117.11, 32.899], ['F', 'Tierrasanta', -117.098, 32.832],
  ['G', 'Mission Valley', -117.11, 32.777], ['H', 'City Heights', -117.103, 32.739],
  ['I', 'South Bay corridor', -117.058, 32.638], ['J', 'Otay Mesa', -117.028, 32.574],
].map(([id, name, lon, lat]) => ({ id: String(id), name: String(name), ...toPoint(Number(lon), Number(lat)) }))
export const BUILDING_RENDER_CENTER = CITY_OBJECTIVES[Math.floor(CITY_OBJECTIVES.length / 2)]
export const BUILDING_RENDER_RADIUS = Math.max(...[...Object.values(CITY_BASES), ...Object.values(CITY_AIRBASES)].map(point => Math.hypot(point.x - BUILDING_RENDER_CENTER.x, point.y - BUILDING_RENDER_CENTER.y))) + 200
// Strategic staging corridor; MapLibre building/water sectors validate every ground movement.
export const CORRIDOR = [CITY_BASES.RED, CITY_OBJECTIVES[0], toPoint(-117.069,33.072), toPoint(-117.079,33.045), ...CITY_OBJECTIVES.slice(1,5), toPoint(-117.113,32.862), ...CITY_OBJECTIVES.slice(5,8), toPoint(-117.094,32.702), toPoint(-117.066,32.674), ...CITY_OBJECTIVES.slice(8), CITY_BASES.BLU]
export const THEATER_BOUNDS: [[number,number],[number,number]] = [[-117.23,32.525],[-116.91,33.12]]
export const SECTOR_SIZE = 2000
export const sectorKey = (p: Point) => `${Math.floor(p.x / SECTOR_SIZE)},${Math.floor(p.y / SECTOR_SIZE)}`
export const sectorOrigin = (key: string): Point => { const [x,y] = key.split(',').map(Number); return { x: x * SECTOR_SIZE, y: y * SECTOR_SIZE } }
export const RUNWAY = { spacing: 70, x: -48, halfLength: 600, apronX: 8, apronY: -100 }
export const AIRFIELD_TRUCK_LOADING = [
  { x: 30, y: -145 }, { x: 46, y: -145 }, { x: 62, y: -145 }, { x: 78, y: -145 },
] as const
export const JAMMER = { radius: 600, cost: 200, buildSeconds: 15, cap: 3 }

