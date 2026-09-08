/** Web Mercator coordinates independent of any renderer or mapping package. */
export const EARTH_CIRCUMFERENCE = 40075016.68557849
export type LngLatLike = [number, number] | { lng: number; lat: number }
export class LngLat {
  constructor(public lng: number, public lat: number) {}
  static convert(value: LngLatLike) { return Array.isArray(value) ? new LngLat(value[0], value[1]) : new LngLat(value.lng, value.lat) }
  toArray(): [number, number] { return [this.lng, this.lat] }
}
export class MercatorCoordinate {
  constructor(public x: number, public y: number, public z = 0) {}
  static fromLngLat(value: LngLatLike, altitude = 0) {
    const point = LngLat.convert(value), latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat)) * Math.PI / 180
    const coordinate = new MercatorCoordinate((point.lng + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2)
    coordinate.z = altitude * coordinate.meterInMercatorCoordinateUnits()
    return coordinate
  }
  toLngLat() { return new LngLat(this.x * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * this.y))) * 180 / Math.PI) }
  meterInMercatorCoordinateUnits() { return 1 / (EARTH_CIRCUMFERENCE * Math.cos(this.toLngLat().lat * Math.PI / 180)) }
}
export const VECTOR_TILEJSON = 'https://tiles.openfreemap.org/planet'
export const ELEVATION_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
export interface TileAddress { z: number; x: number; y: number }
export const tileKey = ({ z, x, y }: TileAddress) => `${z}/${x}/${y}`
export const tileURL = (template: string, tile: TileAddress) => template.replace('{z}', `${tile.z}`).replace('{x}', `${tile.x}`).replace('{y}', `${tile.y}`)
export function tileAt(point: LngLatLike, zoom: number): TileAddress {
  const coordinate = MercatorCoordinate.fromLngLat(point), count = 2 ** zoom
  return { z: zoom, x: Math.floor(coordinate.x * count), y: Math.floor(coordinate.y * count) }
}
let tileMetadata: Promise<{ tiles: string[]; maxzoom?: number }> | undefined
export function getVectorTileMetadata() {
  return tileMetadata ??= fetch(VECTOR_TILEJSON).then(async response => {
    if (!response.ok) throw new Error(`Map metadata unavailable (${response.status})`)
    return response.json() as Promise<{ tiles: string[]; maxzoom?: number }>
  }).catch(error => { tileMetadata = undefined; throw error })
}
export async function fetchVectorTile(tile: TileAddress, signal?: AbortSignal) {
  const metadata = await getVectorTileMetadata()
  const response = await fetch(tileURL(metadata.tiles[0], tile), { signal })
  if (!response.ok) throw new Error(`Map tile ${tileKey(tile)} unavailable (${response.status})`)
  return response.arrayBuffer()
}
