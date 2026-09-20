import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { FeatureCollection, LineString, Point } from 'geojson'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import { GeoMap, Marker } from '../lib/game/geo-map'
import { GeographicTiles, type GeographicTileEvent } from '../lib/game/geo-tiles'
import type { StyleSpecification } from '../lib/game/geo-map-types'
import { ORIGIN, fromPoint } from '../lib/game/theater'

class ElementStub {
  style: Record<string, string> = {}
  attributes = new Map<string, string>()
  children: ElementStub[] = []
  parent?: ElementStub
  clientWidth = 800
  clientHeight = 600
  replacements = 0
  constructor(readonly tagName: string, readonly namespaceURI = 'http://www.w3.org/1999/xhtml') {}
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  getAttribute(name: string) { return this.attributes.get(name) }
  append(...nodes: ElementStub[]) { for (const node of nodes) { node.remove(); node.parent = this; this.children.push(node) } }
  replaceChildren(...nodes: ElementStub[]) { this.replacements++; for (const child of this.children) child.parent = undefined; this.children = []; this.append(...nodes) }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = undefined } }
}

function globalStub(name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  return () => { if (original) Object.defineProperty(globalThis, name, original); else Reflect.deleteProperty(globalThis, name) }
}

const line = (color = '#54b7ff', end = 100): FeatureCollection<LineString> => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: [fromPoint({ x: 0, y: 0 }), fromPoint({ x: end, y: 40 })] } }] })
const dot = (): FeatureCollection<Point> => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { color: '#ee777b' }, geometry: { type: 'Point', coordinates: fromPoint({ x: 60, y: 80 }) } }] })
const style = (): StyleSpecification => ({
  version: 8,
  sources: { grid: { type: 'geojson', data: line() }, routes: { type: 'geojson', data: line('#ee777b') }, units: { type: 'geojson', data: dot() } },
  layers: [
    { id: 'grid', type: 'line', source: 'grid', paint: { 'line-width': .5 } },
    { id: 'routes', type: 'line', source: 'routes', paint: { 'line-color': ['get', 'color'], 'line-dasharray': [3, 3] } },
    { id: 'units', type: 'circle', source: 'units', paint: { 'circle-color': ['get', 'color'], 'circle-radius': 4 } },
    { id: 'road-labels', type: 'symbol', source: 'openmaptiles' },
  ],
})

async function fixture(t: TestContext, mapStyle = style()) {
  let nextFrame: FrameRequestCallback | undefined, matrix = Matrix.Identity(), width = 800, height = 600, elevation = 0
  const counts = { elements: 0, matrices: 0, renders: 0 }, container = new ElementStub('div')
  const restoreGlobals = [
    globalStub('document', { hidden: false, createElement: (tag: string) => new ElementStub(tag), createElementNS: (namespace: string, tag: string) => { counts.elements++; return new ElementStub(tag, namespace) } }),
    globalStub('getComputedStyle', () => ({ position: 'relative' })),
    globalStub('ResizeObserver', class { observe() {} disconnect() {} }),
    globalStub('requestAnimationFrame', (callback: FrameRequestCallback) => { nextFrame = callback; return 1 }),
    globalStub('cancelAnimationFrame', () => {}),
  ]
  let cleanupMap: GeoMap | undefined
  t.after(() => { try { cleanupMap?.remove() } finally { for (const restore of restoreGlobals.reverse()) restore() } })
  t.mock.method(GeographicTiles.prototype, 'update', () => {})
  t.mock.method(GeographicTiles.prototype, 'elevation', () => elevation)
  t.mock.method(BabylonRuntime, 'create', async (canvas: HTMLCanvasElement) => ({
    canvas, scene: {}, configure() {}, dispose() {},
    resize(w: number, h: number) { width = w; height = h },
    setCamera(position: Vector3, target: Vector3, up: Vector3, fov: number, near: number, far: number) {
      const vector = (p: Vector3) => new Vector3(p.x, p.y, p.z)
      matrix = Matrix.LookAtRH(vector(position), vector(target), vector(up)).multiply(Matrix.PerspectiveFovRH(fov, width / height, near, far))
    },
    getViewProjection() { counts.matrices++; return matrix },
    render() { counts.renders++ },
  } as unknown as BabylonRuntime))
  const map = new GeoMap({ container: container as unknown as HTMLElement, style: mapStyle, center: [...ORIGIN], zoom: 15, pitch: 40, interactive: false, attributionControl: false })
  cleanupMap = map
  await map.ready
  const svg = container.children[1].children[0]
  return {
    map, container, svg, counts,
    frame: () => nextFrame!(performance.now()),
    setElevation(value: number, event?: Partial<GeographicTileEvent>) {
      elevation = value
      if (event) (map as unknown as { tiles: { changed(event: GeographicTileEvent): void } }).tiles.changed({ address: { x: 1, y: 1, z: 14 }, elevation: true, ...event })
    },
  }
}

test('scene-only frames preserve overlay nodes and avoid per-vertex camera snapshots', async t => {
  const mapStyle = style(), data = line()
  data.features[0].geometry.coordinates = Array.from({ length: 1000 }, (_, i) => fromPoint({ x: i, y: 20 }))
  mapStyle.sources.grid.data = data
  const { map, svg, counts, frame } = await fixture(t, mapStyle)
  assert.equal(counts.matrices, 1, 'all overlay vertices share one projection snapshot')
  const paths = svg.children.map(group => group.children[0]), created = counts.elements, rootChanges = svg.replacements
  for (let i = 0; i < 120; i++) { map.triggerRepaint(); frame() }
  assert.equal(counts.renders, 121, 'the battlefield continues rendering')
  assert.equal(counts.elements, created, 'scene animation creates no new overlay DOM')
  assert.equal(svg.replacements, rootChanges)
  assert.deepEqual(svg.children.map(group => group.children[0]), paths)
})

test('route and minimap updates refresh only their layers, including reused data objects and removals', async t => {
  const { map, svg, frame } = await fixture(t)
  const grid = svg.children[0].children[0], route = svg.children[1].children[0], unit = svg.children[2].children[0]
  map.getSource('routes')!.setData(line('#00ff00', 250)); frame()
  const changed = svg.children[1].children[0]
  assert.equal(svg.children[0].children[0], grid)
  assert.equal(svg.children[2].children[0], unit)
  assert.notEqual(changed, route)
  assert.notEqual(changed.getAttribute('d'), route.getAttribute('d'))
  assert.equal(changed.getAttribute('stroke'), '#00ff00')
  assert.equal(changed.getAttribute('stroke-dasharray'), '3 3')
  const units = map.getSource('units')!, reused = units.data as FeatureCollection<Point>
  reused.features[0].properties!.color = '#ffffff'; reused.features[0].geometry.coordinates = fromPoint({ x: 180, y: 80 })
  units.setData(reused); frame()
  assert.equal(svg.children[2].children[0].getAttribute('fill'), '#ffffff')
  assert.notEqual(svg.children[2].children[0].getAttribute('cx'), unit.getAttribute('cx'))
  map.getSource('routes')!.setData({ type: 'FeatureCollection', features: [] }); frame()
  assert.equal(svg.children[1].children.length, 0, 'cancelled orders disappear next frame')
  assert.equal(svg.children[0].children[0], grid)
})

test('visibility, zoom limits, and paint changes preserve stacking order and current hidden data', async t => {
  const { map, svg, frame } = await fixture(t), gridGroup = svg.children[0], routeGroup = svg.children[1]
  map.setLayoutProperty('grid', 'visibility', 'none'); frame()
  assert.equal(svg.children[0], routeGroup)
  map.getSource('grid')!.setData(line('#ffffff', 350))
  map.setLayoutProperty('grid', 'visibility', 'visible'); frame()
  assert.equal(svg.children[0], gridGroup); assert.equal(svg.children[1], routeGroup)
  const path = gridGroup.children[0]
  map.setLayoutProperty('grid', 'visibility', 'visible'); frame()
  assert.equal(gridGroup.children[0], path, 'setting the same layout value does not rebuild')
  map.getLayer('grid')!.paint!['line-width'] = 3; map.triggerRepaint(); frame()
  assert.equal(gridGroup.children[0].getAttribute('stroke-width'), '3')
  map.getLayer('grid')!.minzoom = 16; map.triggerRepaint(); frame()
  assert.equal(svg.children.includes(gridGroup), false)
  map.jumpTo({ zoom: 16 }); frame()
  assert.equal(svg.children[0], gridGroup)
  map.getLayer('grid')!.maxzoom = 16; map.triggerRepaint(); frame()
  assert.equal(svg.children.includes(gridGroup), false, 'maxzoom remains exclusive')
})

test('camera overrides and resizes update SVG projection while marker changes stay immediate', async t => {
  const { map, svg, container, frame } = await fixture(t), oldPath = svg.children[0].children[0].getAttribute('d')
  map.transformCameraUpdate = () => ({ bearing: 75, pitch: 60 })
  map.triggerRepaint(); frame()
  assert.notEqual(svg.children[0].children[0].getAttribute('d'), oldPath)
  const point = (map.getSource('units')!.data as FeatureCollection<Point>).features[0].geometry.coordinates as [number, number]
  let expected = map.project(point)
  assert.equal(svg.children[2].children[0].getAttribute('cx'), String(expected.x))
  assert.equal(svg.children[2].children[0].getAttribute('cy'), String(expected.y))
  container.clientWidth = 1200; container.clientHeight = 800; map.resize(); frame()
  expected = map.project(point)
  assert.equal(svg.children[2].children[0].getAttribute('cx'), String(expected.x))
  assert.equal(svg.children[2].children[0].getAttribute('cy'), String(expected.y))
  const element = new ElementStub('button'), marker = new Marker({ element: element as unknown as HTMLElement }).setLngLat(point).addTo(map), previous = element.style.transform
  marker.setLngLat(fromPoint({ x: 300, y: 100 })); marker.setOffset([0, -10]); element.setAttribute('class', 'selected')
  assert.notEqual(element.style.transform, previous, 'marker movement is independent of SVG caching')
  map.triggerRepaint(); frame(); assert.equal(element.getAttribute('class'), 'selected')
})

test('terrain arrivals, DEM loss, and label toggles reproject against the current heights', async t => {
  const { map, svg, frame, setElevation } = await fixture(t)
  map._elevationFreeze = true; map.setTerrain({ source: 'elevation' }); frame()
  const flat = svg.children[0].children[0].getAttribute('d')
  setElevation(80, {}); frame()
  assert.notEqual(svg.children[0].children[0].getAttribute('d'), flat, 'terrain refreshes even when the camera stays fixed')
  const point = (map.getSource('units')!.data as FeatureCollection<Point>).features[0].geometry.coordinates as [number, number]
  assert.equal(svg.children[2].children[0].getAttribute('cy'), String(map.project(point).y))
  setElevation(0, { elevation: false }); frame()
  assert.equal(svg.children[0].children[0].getAttribute('d'), flat, 'replacement without DEM retires old heights')
  map.jumpTo({ pitch: 0 }); frame()
  const topDownFlat = svg.children[0].children[0].getAttribute('d')
  setElevation(60); map.setLayoutProperty('road-labels', 'visibility', 'none'); frame()
  const topDownElevated = svg.children[0].children[0].getAttribute('d')
  assert.notEqual(topDownElevated, topDownFlat, 'top-down label cache changes also invalidate terrain projection')
  map.setTerrain(null); frame()
  assert.notEqual(svg.children[0].children[0].getAttribute('d'), topDownElevated, 'disabling terrain removes the elevated projection')
})
