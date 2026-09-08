import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector'
import { Viewport } from '@babylonjs/core/Maths/math.viewport'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import type { FeatureCollection, Position } from 'geojson'
import { BabylonRuntime } from './babylon-runtime'
import { GeographicTiles } from './geo-tiles'
import { EARTH_CIRCUMFERENCE, LngLat, type LngLatLike } from './geography'
import { ORIGIN, toPoint, fromPoint } from './theater'
import { DEFAULT_GRAPHICS, type Graphics } from './types'
import type { Scene } from './scene-data'
import type { StyleSpecification, LayerSpecification } from './geo-map-types'
export { LngLat } from './geography'
export type { StyleSpecification } from './geo-map-types'
interface CameraOptions { center?: LngLatLike; zoom?: number; pitch?: number; bearing?: number; elevation?: number; duration?: number; essential?: boolean }
interface MapOptions extends CameraOptions { container: HTMLElement; style: StyleSpecification; minZoom?: number; maxZoom?: number; maxPitch?: number; pixelRatio?: number; interactive?: boolean; attributionControl?: false | { compact?: boolean }; [key: string]: unknown }
interface MapEvent { originalEvent?: MouseEvent | TouchEvent; sourceId?: string; isSourceLoaded?: boolean; error?: Error }
export class GeoJSONSource {
  constructor(public data: FeatureCollection, private changed: () => void) {}
  setData(data: FeatureCollection) { this.data = data; this.changed(); return this }
}
export class GeoMap {
  readonly ready: Promise<void>
  runtime?: BabylonRuntime
  transformCameraUpdate?: () => CameraOptions
  _elevationFreeze = false
  private canvas: HTMLCanvasElement
  private overlay: HTMLDivElement
  private svg: SVGSVGElement
  private events = new Map<string, Set<(event: MapEvent) => void>>()
  private sources = new Map<string, GeoJSONSource>()
  private layers: LayerSpecification[]
  private center: LngLat
  private zoom: number
  private pitch: number
  private bearing: number
  private elevation = 0
  private ratio: number
  private terrain: { source: string; exaggeration?: number } | null = null
  private tiles?: GeographicTiles
  private loaded = false
  private disposed = false
  private dirty = true
  private frame = 0
  private resizeObserver: ResizeObserver
  private graph?: Scene
  private draw?: (matrix: number[]) => void
  private markers = new Set<Marker>()
  private animation?: { start: number; duration: number; from: Required<Pick<CameraOptions, 'zoom' | 'pitch' | 'bearing'>> & { center: LngLat }; to: CameraOptions }
  private width = 1
  private height = 1
  private pointer?: { id: number; x: number; y: number; rotate: boolean; moved: boolean }
  constructor(private options: MapOptions) {
    this.center = LngLat.convert(options.center || ORIGIN); this.zoom = options.zoom ?? 12; this.pitch = options.pitch ?? 0; this.bearing = options.bearing ?? 0; this.ratio = options.pixelRatio ?? 1; this.layers = options.style.layers.map(layer => ({ ...layer, layout: { ...layer.layout } }))
    if (getComputedStyle(options.container).position === 'static') options.container.style.position = 'relative'
    this.canvas = document.createElement('canvas'); this.canvas.className = 'geographic-canvas'; this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;outline:none'; this.canvas.tabIndex = 0; this.canvas.setAttribute('aria-label', 'Interactive geographic battlefield'); options.container.append(this.canvas)
    this.overlay = document.createElement('div'); this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; options.container.append(this.overlay)
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; this.overlay.append(this.svg)
    for (const [name, source] of Object.entries(options.style.sources)) if (source.type === 'geojson' && source.data && typeof source.data !== 'string') this.sources.set(name, new GeoJSONSource(source.data, () => this.triggerRepaint()))
    if (options.attributionControl !== false) { const credit = document.createElement('div'); credit.style.cssText = 'position:absolute;right:8px;bottom:3px;color:#96a8b7;font:10px system-ui;pointer-events:auto;background:#101c29bb;padding:2px 5px'; credit.innerHTML = '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>'; this.overlay.append(credit) }
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(options.container); this.resize()
    this.ready = BabylonRuntime.create(this.canvas).then(runtime => {
      if (this.disposed) { runtime.dispose(); return }
      this.runtime = runtime; this.canvas = runtime.canvas; runtime.resize(this.width, this.height, this.ratio)
      const ambient = new HemisphericLight('map-ambient', new Vector3(0, 0, 1), runtime.scene); ambient.intensity = .8
      runtime.configure({ ...DEFAULT_GRAPHICS, performanceMode: options.interactive === false })
      this.tiles = new GeographicTiles(runtime.scene, elevation => { this.triggerRepaint(); if (elevation) this.emit('sourcedata', { sourceId: 'elevation', isSourceLoaded: true }) })
      if (options.interactive !== false) this.connectInput()
      this.loaded = true; this.resize(); this.emit('load', {}); this.loop()
    }).catch(error => { this.emit('error', { error: new Error(`Graphics initialization failed: ${String(error)}`) }); throw error })
    // Event consumers receive the error above; prevent a second unhandled rejection.
    void this.ready.catch(() => undefined)
  }
  private emit(name: string, event: MapEvent) { for (const listener of this.events.get(name) || []) listener(event) }
  on(name: string, listener: (event: MapEvent) => void) { const listeners = this.events.get(name) || new Set(); listeners.add(listener); this.events.set(name, listeners); return this }
  off(name: string, listener: (event: MapEvent) => void) { this.events.get(name)?.delete(listener); return this }
  private connectInput() {
    this.canvas.oncontextmenu = event => event.preventDefault()
    this.canvas.onpointerdown = event => { this.stop(); this.canvas.focus(); this.canvas.setPointerCapture(event.pointerId); const rotate = event.button === 2 || event.ctrlKey; this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, rotate, moved: false }; this.emit(rotate ? 'rotatestart' : 'dragstart', { originalEvent: event }) }
    this.canvas.onpointermove = event => {
      const pointer = this.pointer; if (!pointer || pointer.id !== event.pointerId) return
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y; if (Math.abs(dx) + Math.abs(dy) > 1) pointer.moved = true
      if (pointer.rotate) { this.bearing += dx * .35; this.pitch = this.clampPitch(this.pitch + dy * .25); this.emit('rotate', { originalEvent: event }) }
      else { const before = this.unproject([pointer.x - this.canvas.getBoundingClientRect().left, pointer.y - this.canvas.getBoundingClientRect().top]), after = this.unproject([event.clientX - this.canvas.getBoundingClientRect().left, event.clientY - this.canvas.getBoundingClientRect().top]); this.center = new LngLat(this.center.lng + before.lng - after.lng, this.center.lat + before.lat - after.lat) }
      pointer.x = event.clientX; pointer.y = event.clientY; this.triggerRepaint()
    }
    this.canvas.onpointerup = event => { const pointer = this.pointer; this.pointer = undefined; if (pointer?.rotate) this.emit('rotateend', { originalEvent: event }); if (pointer && !pointer.moved) this.emit('click', { originalEvent: event }) }
    this.canvas.onpointercancel = () => { this.pointer = undefined }
    this.canvas.addEventListener('wheel', event => { event.preventDefault(); this.stop(); this.zoom = this.clampZoom(this.zoom - Math.max(-150, Math.min(150, event.deltaY)) * .004); this.triggerRepaint() }, { passive: false })
    this.canvas.onkeydown = event => { if (event.key === '+' || event.key === '=') this.zoomTo(this.zoom + .5); else if (event.key === '-') this.zoomTo(this.zoom - .5); else if (event.key.startsWith('Arrow')) { event.preventDefault(); const mpp = this.metersPerPixel(), point = toPoint(this.center.lng, this.center.lat), step = mpp * 80; if (event.key === 'ArrowLeft') point.x -= step; if (event.key === 'ArrowRight') point.x += step; if (event.key === 'ArrowUp') point.y += step; if (event.key === 'ArrowDown') point.y -= step; this.center = LngLat.convert(fromPoint(point)); this.triggerRepaint() } }
  }
  private clampZoom(zoom: number) { return Math.max(this.options.minZoom ?? 5, Math.min(this.options.maxZoom ?? 22, zoom)) }
  private clampPitch(pitch: number) { return Math.max(0, Math.min(this.options.maxPitch ?? 75, pitch)) }
  private metersPerPixel(zoom = this.zoom) { return EARTH_CIRCUMFERENCE * Math.cos(ORIGIN[1] * Math.PI / 180) / (512 * 2 ** zoom) }
  private camera() {
    if (!this.runtime) return
    const override = this.transformCameraUpdate?.(); if (override) this.apply(override)
    const point = toPoint(this.center.lng, this.center.lat), target = { ...point, z: this._elevationFreeze ? this.elevation : (this.terrain ? this.tiles?.elevation(this.center) || 0 : 0) }, pitch = this.pitch * Math.PI / 180, bearing = this.bearing * Math.PI / 180, fov = 2 * Math.atan(1 / 3), distance = this.height * this.metersPerPixel() * 1.5
    this.runtime.setCamera({ x: target.x + Math.sin(bearing) * Math.sin(pitch) * distance, y: target.y - Math.cos(bearing) * Math.sin(pitch) * distance, z: target.z + Math.cos(pitch) * distance }, target, { x: -Math.sin(bearing) * Math.cos(pitch), y: Math.cos(bearing) * Math.cos(pitch), z: Math.sin(pitch) }, fov, Math.max(.1, distance / 10000), Math.max(20000, distance * 8))
  }
  private loop = () => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.loop)
    if (document.hidden || !this.runtime || this.options.container.clientWidth < 2 || this.options.container.clientHeight < 2) return
    if (this.animation) { const a = this.animation, progress = Math.min(1, (performance.now() - a.start) / a.duration), t = progress * progress * (3 - 2 * progress), target = a.to.center ? LngLat.convert(a.to.center) : a.from.center; this.apply({ center: [a.from.center.lng + (target.lng - a.from.center.lng) * t, a.from.center.lat + (target.lat - a.from.center.lat) * t], zoom: a.from.zoom + ((a.to.zoom ?? a.from.zoom) - a.from.zoom) * t, pitch: a.from.pitch + ((a.to.pitch ?? a.from.pitch) - a.from.pitch) * t, bearing: a.from.bearing + ((a.to.bearing ?? a.from.bearing) - a.from.bearing) * t }); if (progress === 1) this.animation = undefined; this.dirty = true }
    if (!this.dirty) return
    this.dirty = false; this.camera(); this.tiles?.update(this.center, this.zoom, !!this.terrain, this.getLayer('road-labels')?.layout?.visibility !== 'none')
    this.draw?.(Array.from(this.runtime.getViewProjection().asArray()))
    if (this.graph) this.runtime.sync(this.graph)
    this.runtime.render(); this.renderOverlay(); for (const marker of this.markers) marker.update()
  }
  attachBattlefield(graph: Scene, draw: (matrix: number[]) => void) { this.graph = graph; this.draw = draw; this.triggerRepaint() }
  detachBattlefield() { this.graph = undefined; this.draw = undefined; this.triggerRepaint() }
  configure(graphics: Graphics) { this.runtime?.configure(graphics) }
  private renderOverlay() {
    this.svg.replaceChildren()
    const property = (value: unknown, properties: Record<string, unknown> | null, fallback: string | number): string | number => Array.isArray(value) && value[0] === 'get' ? properties?.[String(value[1])] as string | number || fallback : typeof value === 'string' || typeof value === 'number' ? value : fallback
    for (const layer of this.layers) {
      if (!layer.source || layer.layout?.visibility === 'none' || (layer.minzoom ?? 0) > this.zoom || (layer.maxzoom ?? 99) <= this.zoom) continue
      const source = this.sources.get(layer.source); if (!source) continue
      for (const feature of source.data.features) {
        const geometry = feature.geometry, paint = layer.paint || {}, props = feature.properties
        if (geometry.type === 'Point' && layer.type === 'circle') { const p = this.project(geometry.coordinates as [number, number]); if (!Number.isFinite(p.x)) continue; const circle = document.createElementNS(this.svg.namespaceURI, 'circle'); circle.setAttribute('cx', String(p.x)); circle.setAttribute('cy', String(p.y)); circle.setAttribute('r', String(property(paint['circle-radius'], props, 2))); circle.setAttribute('fill', String(property(paint['circle-color'], props, '#54b7ff'))); this.svg.append(circle); continue }
        const lines: Position[][] = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' || geometry.type === 'Polygon' ? geometry.coordinates : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : []
        if (!lines.length || !['fill', 'line'].includes(layer.type)) continue
        const path = document.createElementNS(this.svg.namespaceURI, 'path'), fill = layer.type === 'fill'
        path.setAttribute('d', lines.map(line => line.map((ll, i) => { const p = this.project(ll as [number, number]); return `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}` }).join(' ') + (fill ? 'Z' : '')).join(' ')); path.setAttribute('fill', fill ? String(property(paint['fill-color'], props, '#54b7ff')) : 'none'); path.setAttribute('stroke', fill ? 'none' : String(property(paint['line-color'], props, '#54b7ff'))); path.setAttribute('opacity', String(property(paint[fill ? 'fill-opacity' : 'line-opacity'], props, 1))); path.setAttribute('stroke-width', String(property(paint['line-width'], props, 1))); if (Array.isArray(paint['line-dasharray'])) path.setAttribute('stroke-dasharray', paint['line-dasharray'].join(' ')); this.svg.append(path)
      }
    }
  }
  project(value: LngLatLike) { const ll = LngLat.convert(value), point = toPoint(ll.lng, ll.lat); if (!this.runtime) return { x: 0, y: 0 }; const v = Vector3.Project(new Vector3(point.x, point.y, this.terrain ? this.tiles?.elevation(ll) || 0 : 0), Matrix.Identity(), this.runtime.getViewProjection(), new Viewport(0, 0, this.width, this.height)); return { x: v.x, y: v.y } }
  unproject(point: [number, number]) { if (!this.runtime) return this.center; const camera = this.runtime.camera, a = Vector3.Unproject(new Vector3(point[0], point[1], 0), this.width, this.height, Matrix.Identity(), camera.getViewMatrix(), camera.getProjectionMatrix()), b = Vector3.Unproject(new Vector3(point[0], point[1], 1), this.width, this.height, Matrix.Identity(), camera.getViewMatrix(), camera.getProjectionMatrix()), direction = b.subtract(a), t = Math.max(0, (this.elevation - a.z) / (direction.z || -.0001)); return LngLat.convert(fromPoint({ x: a.x + direction.x * t, y: a.y + direction.y * t })) }
  private apply(options: CameraOptions) { if (options.center) this.center = LngLat.convert(options.center); if (options.zoom !== undefined) this.zoom = this.clampZoom(options.zoom); if (options.pitch !== undefined) this.pitch = this.clampPitch(options.pitch); if (options.bearing !== undefined) this.bearing = options.bearing; if (options.elevation !== undefined) this.elevation = options.elevation }
  jumpTo(options: CameraOptions) { this.apply(options); this.triggerRepaint(); return this }
  easeTo(options: CameraOptions) { if (!options.duration) return this.jumpTo(options); this.animation = { start: performance.now(), duration: options.duration, from: { center: this.center, zoom: this.zoom, pitch: this.pitch, bearing: this.bearing }, to: options }; this.triggerRepaint(); return this }
  flyTo(options: CameraOptions) { return this.easeTo(options) }
  zoomTo(zoom: number, options: CameraOptions = {}) { return this.easeTo({ ...options, zoom }) }
  rotateTo(bearing: number, options: CameraOptions = {}) { return this.easeTo({ ...options, bearing }) }
  fitBounds(bounds: readonly [readonly [number, number], readonly [number, number]], options: CameraOptions & { padding?: number | { top: number; bottom: number; left: number; right: number } } = {}) { const a = toPoint(bounds[0][0], bounds[0][1]), b = toPoint(bounds[1][0], bounds[1][1]), padding = options.padding ?? 0, x = typeof padding === 'number' ? padding * 2 : padding.left + padding.right, y = typeof padding === 'number' ? padding * 2 : padding.top + padding.bottom, scale = Math.max(Math.abs(b.x - a.x) / Math.max(1, this.width - x), Math.abs(b.y - a.y) / Math.max(1, this.height - y)), zoom = Math.log2(this.metersPerPixel(0) / Math.max(.01, scale)); return this.easeTo({ ...options, center: [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2], zoom }) }
  calculateCameraOptionsFromTo(from: LngLat, fromZ: number, to: LngLat, toZ: number): CameraOptions { const a = toPoint(from.lng, from.lat), b = toPoint(to.lng, to.lat), dx = a.x - b.x, dy = a.y - b.y, dz = fromZ - toZ, distance = Math.hypot(dx, dy, dz); return { center: to, elevation: toZ, pitch: Math.atan2(Math.hypot(dx, dy), dz) * 180 / Math.PI, bearing: Math.atan2(dx, -dy) * 180 / Math.PI, zoom: Math.log2(this.height * this.metersPerPixel(0) * 1.5 / Math.max(.1, distance)) } }
  getCenter() { return this.center } getZoom() { return this.zoom } getPitch() { return this.pitch } getBearing() { return this.bearing } getCanvas() { return this.canvas } getContainer() { return this.options.container } getTerrain() { return this.terrain }
  setTerrain(terrain: { source: string; exaggeration?: number } | null) { this.terrain = terrain; this.elevation = 0; this.triggerRepaint(); return this }
  queryTerrainElevation(point: LngLatLike) { return this.tiles?.elevation(point) ?? (this.terrain ? null : 0) }
  getLayer(id: string) { return this.layers.find(layer => layer.id === id) }
  setLayoutProperty(id: string, name: string, value: unknown) { const layer = this.getLayer(id); if (layer) (layer.layout ??= {})[name] = value; this.triggerRepaint(); return this }
  getSource(id: string) { return this.sources.get(id) }
  isStyleLoaded() { return this.loaded } isSourceLoaded(id: string) { return id === 'elevation' ? !!this.tiles?.elevationReady : this.loaded }
  setPixelRatio(ratio: number) { if (this.ratio !== ratio) { this.ratio = ratio; this.resize() } }
  resize() { this.width = Math.max(1, this.options.container.clientWidth); this.height = Math.max(1, this.options.container.clientHeight); this.runtime?.resize(this.width, this.height, this.ratio); this.triggerRepaint(); this.emit('resize', {}); return this }
  triggerRepaint() { this.dirty = true; return this } stop() { this.animation = undefined; return this }
  addMarker(marker: Marker) { this.markers.add(marker); this.overlay.append(marker.getElement()); marker.update() }
  removeMarker(marker: Marker) { this.markers.delete(marker) }
  remove() { this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); this.tiles?.dispose(); this.runtime?.dispose(); this.canvas.remove(); this.overlay.remove(); this.events.clear() }
}
export class Marker {
  private map?: GeoMap
  private location = new LngLat(0, 0)
  private offset: [number, number]
  constructor(private options: { element: HTMLElement; anchor?: string; offset?: [number, number] }) { this.offset = options.offset || [0, 0]; Object.assign(options.element.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'auto' }) }
  setLngLat(point: LngLatLike) { this.location = LngLat.convert(point); this.update(); return this }
  setOffset(offset: [number, number]) { this.offset = offset; this.update(); return this }
  addTo(map: GeoMap) { this.map = map; map.addMarker(this); return this }
  getElement() { return this.options.element }
  update() { if (!this.map) return; const point = this.map.project(this.location); this.options.element.style.transform = `translate(${point.x + this.offset[0]}px,${point.y + this.offset[1]}px) translate(-50%,${this.options.anchor === 'bottom' ? '-100%' : '-50%'})` }
  remove() { this.map?.removeMarker(this); this.options.element.remove(); this.map = undefined }
}
export default { Map: GeoMap, Marker, LngLat }
