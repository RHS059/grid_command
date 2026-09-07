import type { FilterSpecification, StyleSpecification } from 'maplibre-gl'
import { JAMMER } from './theater'
import { MOB_YARD } from './mob'
import { AIRBASES, BASES, lngLat, type BattleState, type Perspective } from './types'
import type { FeatureCollection, Feature, Geometry } from 'geojson'

const rectangle = (x:number,y:number,w:number,h:number) => [[lngLat({x:x-w,y:y-h}),lngLat({x:x+w,y:y-h}),lngLat({x:x+w,y:y+h}),lngLat({x:x-w,y:y+h}),lngLat({x:x-w,y:y-h})]]
const baseBuildingMask: Feature<Geometry> = { type:'Feature', properties:{}, geometry:{ type:'MultiPolygon', coordinates:[
  ...Object.values(BASES).map(p=>rectangle(p.x,p.y+(MOB_YARD.maxY+MOB_YARD.minY)/2,MOB_YARD.halfWidth+4,(MOB_YARD.maxY-MOB_YARD.minY)/2+4)),
  ...Object.values(AIRBASES).map(p=>rectangle(p.x,p.y,88,610)),
] } }
const outsideBases = ['!', ['within', baseBuildingMask]] as FilterSpecification
const prominentBuildings = ['all', outsideBases, ['>=', ['coalesce', ['get', 'render_height'], 6], 12]] as FilterSpecification
const lowRiseBuildings = ['all', outsideBases, ['<', ['coalesce', ['get', 'render_height'], 6], 12]] as FilterSpecification

export function tacticalStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>' },
      elevation: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14 },
      hillshadeDem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14 },
      tactical: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      routes: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      grid: { type: 'geojson', data: gridFeatures() },
    },
    light: { anchor: 'viewport', color: '#dbe7ef', intensity: .42, position: [1.4, 200, 36] },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#101c2a' } },
      { id: 'landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', paint: { 'fill-color': '#172b34', 'fill-opacity': .7 } },
      { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': '#152c32', 'fill-opacity': .8 } },
      { id: 'landuse', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', paint: { 'fill-color': '#203244', 'fill-opacity': .22 } },
      { id: 'hillshade', type: 'hillshade', source: 'hillshadeDem', paint: { 'hillshade-shadow-color': '#0b1119', 'hillshade-highlight-color': '#54677d', 'hillshade-accent-color': '#172432', 'hillshade-exaggeration': .3 } },
      { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#193d5c', 'fill-opacity': 1 } },
      { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': '#193d5c', 'line-width': 2 } },
      { id: 'road-casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'path'], paint: { 'line-color': '#0b1119', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 11, 20, 70], 'line-opacity': .8 } },
      { id: 'road', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'path'], paint: { 'line-color': '#405065', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, .5, 16, 7, 20, 58], 'line-opacity': .8 } },
      { id: 'highway', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['match', ['get', 'class'], ['motorway', 'trunk'], true, false], paint: { 'line-color': '#536275', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 10, 20, 70], 'line-opacity': .85 } },
      { id: 'path', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'path'], paint: { 'line-color': '#47504f', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, .5, 17, 2], 'line-opacity': .65 } },
      { id: 'building-footprints', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', filter:outsideBases, paint: { 'fill-color': '#31465e', 'fill-opacity': .55 } },
      // MapLibre batches and simplifies vector-tile geometry. The normal 3D
      // layer retains the skyline while flat footprints preserve every low-rise
      // building at the same low cost as the buildings-off baseline.
      { id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14.2, filter:prominentBuildings, paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#344f6c', 25, '#476685', 100, '#6686a1'],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': false,
      } },
      // High quality can add the omitted low-rise extrusions at inspection
      // distance without drawing prominent buildings twice.
      { id: 'buildings-3d-detail', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom:18.8, filter:lowRiseBuildings, paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#344f6c', 25, '#476685', 100, '#6686a1'],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true,
      } },
      { id: 'tactical-grid', type: 'line', source: 'grid', paint: { 'line-color': '#54b7ff', 'line-opacity': .065, 'line-width': .5 } },
      { id: 'objective-zones', type: 'fill', source: 'tactical', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': .06 } },
      { id: 'objective-rings', type: 'line', source: 'tactical', paint: { 'line-color': ['get', 'color'], 'line-opacity': .55, 'line-width': 1.2, 'line-dasharray': [4, 3] } },
      { id: 'unit-routes', type: 'line', source: 'routes', paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': .45, 'line-dasharray': [3, 3] } },
      { id: 'road-labels', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 14, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-letter-spacing': .09, 'text-transform': 'uppercase', 'text-max-angle': 25, 'symbol-spacing': 300 }, paint: { 'text-color': '#94a6b8', 'text-opacity': .5, 'text-halo-color': '#101c2a', 'text-halo-width': 2 } },
    ],
  }
}
function gridFeatures(): FeatureCollection {
  const features: Feature<Geometry>[] = []
  for (let x = -15000; x <= 15000; x += 2000) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [lngLat({ x, y: -34000 }), lngLat({ x, y: 34000 })] } })
  for (let y = -34000; y <= 34000; y += 2000) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [lngLat({ x: -15000, y }), lngLat({ x: 15000, y })] } })
  return { type: 'FeatureCollection', features }
}
export function zoneFeatures(state: BattleState, perspective: Perspective = 'OBS'): FeatureCollection {
  const zones=[...state.objectives.map(o=>({...o,radius:100})),...state.units.filter(u=>u.role==='UAV_JAMMER'&&u.hp>0&&!u.construction&&(perspective==='OBS'||u.side===perspective||u.spotted)).map(u=>({...u,owner:u.side,radius:JAMMER.radius}))]
  return { type: 'FeatureCollection', features: zones.map(o => ({ type: 'Feature', properties: { color: o.owner === 'BLU' ? '#54b7ff' : o.owner === 'RED' ? '#ee777b' : '#dbe7ef' }, geometry: { type: 'Polygon', coordinates: [Array.from({ length: 49 }, (_, i) => lngLat({ x: o.x + Math.cos(i * Math.PI / 24) * o.radius, y: o.y + Math.sin(i * Math.PI / 24) * o.radius }))] } })) }
}

