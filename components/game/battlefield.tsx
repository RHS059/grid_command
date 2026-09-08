'use client'

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import maplibregl, { type GeoJSONSource, type Map as GeoMap } from 'maplibre-gl'
import type { FeatureCollection, Feature, Geometry } from 'geojson'
import { Crosshair } from 'lucide-react'
import { DisplayPoses, followSubject, chaseView, angleBetween } from '@/lib/game/chase-camera'
import { THEATER_BOUNDS } from '@/lib/game/theater'
import { effectiveGraphics } from '@/lib/game/graphics'
import { tacticalStyle, zoneFeatures } from '@/lib/game/map-style'
import { loadBattleGeometry } from '@/lib/game/geometry-loader'
import type { GeometryPacket } from '@/lib/game/types'
import type { BuildingAssessmentProgress } from '@/lib/game/building-consolidation'
import { AIRBASES, BASES, CENTER, SIDE_COLOR, lngLat, type BattleState, type Graphics, type Perspective, type Side } from '@/lib/game/types'
import styles from './game-hud.module.css'

export interface MapAPI { overview: () => void; focus: (point: { x: number; y: number }, zoom?: number) => void; zoom: (delta: number) => void; rotate: () => void; tilt: () => void; reimport: () => void }
interface Props {
  active: boolean;
  stateRef: MutableRefObject<BattleState>; graphics: Graphics; perspective: Perspective; selected: string | null;
  onSelect: (id: string | null) => void; onReady: (api: MapAPI) => void; onFPS: (fps: number) => void;
  onStatus: (status: string) => void; onGeometry: (packet: GeometryPacket) => void;
  onWorldReady: () => void;
}
export function Battlefield(props: Props) {
  const container = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), miniContainer = useRef<HTMLDivElement>(null)
  const latest = useRef(props); latest.current = { ...props, graphics: effectiveGraphics(props.graphics) }
  const mapRef = useRef<GeoMap | null>(null)
  const renderRef = useRef<import('@/lib/game/renderer').BattlefieldRenderer | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [progress, setProgress] = useState<BuildingAssessmentProgress>({ done: 0, total: 0, phase: 'discovering' })

  useEffect(() => {
    if (!container.current || !canvas.current) return
    let disposed = false, interval: ReturnType<typeof setInterval> | undefined
    const homeZoom = () => 10
    let map: GeoMap
    try { map = new maplibregl.Map({ container: container.current, style: tacticalStyle(), center: CENTER, zoom: homeZoom(), pitch: 45, bearing: -18, minZoom: 8, maxZoom: 22, maxPitch: 75, antialias: false, pixelRatio: Math.min(window.devicePixelRatio, 1.5), attributionControl: { compact: true }, maxBounds: [[-118.5,31.5],[-115.5,34.2]], fadeDuration: 0, refreshExpiredTiles: false }) }
    catch { setError('WebGL is unavailable. Enable hardware acceleration in your browser and reload.'); setLoading(false); return }
    map.fitBounds(THEATER_BOUNDS, { padding: { top: 100, bottom: 65, left: 40, right: 40 }, duration: 0, pitch: 0, bearing: 0 })
    mapRef.current = map
    const markers = new Map<string, maplibregl.Marker>(), objectives = new Map<string, maplibregl.Marker>()
    const imported = new Set<string>(), fixed: maplibregl.Marker[] = []
    let minimap: GeoMap | null = null, lastMarkers = 0, lastData = 0, lastDataTick = -1, lastRoutes = false, lastPerspective = '', overlayStarted = false
    const poses = new DisplayPoses()
    let chaseOptions: ReturnType<NonNullable<GeoMap['transformCameraUpdate']>> | null = null, orbiting = false, orbitBearing = 0
    // Pinned MapLibre 4.7 overwrites target elevation during terrain rendering after transformCameraUpdate.
    // Freeze only while following; restore its normal elevation management for every free-camera interaction.
    const elevationControl = map as GeoMap & { _elevationFreeze: boolean }
    map.transformCameraUpdate = () => orbiting ? {} : chaseOptions || {}
    const clearChase = () => { if (chaseOptions) elevationControl._elevationFreeze = false; chaseOptions = null; orbiting = false }
    const releaseFollow = () => { clearChase(); latest.current = { ...latest.current, selected: null }; latest.current.onSelect(null) }
    let displayState = latest.current.stateRef.current, frame = 0, previousFrame = 0, followed: string | null = null, heading = 0, orbitYaw = 0, chaseScale = 1
    const followFrame = (now: number) => {
      frame = requestAnimationFrame(followFrame)
      if (disposed || !latest.current.active || document.hidden) { previousFrame = 0; return }
      const snapshot = latest.current.stateRef.current
      const selected = snapshot.units.find(u => u.id === latest.current.selected)
      displayState = poses.sample(snapshot, now, latest.current.graphics.performanceMode
        ? u => u.id === selected?.id || u.id === selected?.carrier || !!renderRef.current?.shouldAnimate(u.id)
        : undefined)
      const subject = followSubject(displayState, latest.current.selected)
      if (!subject || (latest.current.perspective !== 'OBS' && subject.unit.side !== latest.current.perspective && !subject.unit.spotted)) {
        if (latest.current.selected) latest.current.onSelect(null)
        clearChase(); followed = null; previousFrame = now; return
      }
      if (followed !== subject.unit.id) { map.stop(); followed = subject.unit.id; heading = subject.heading; orbitYaw = 0; chaseScale = 1 }
      const dt = previousFrame ? Math.min(.1, (now - previousFrame) / 1000) : 1
      previousFrame = now
      heading += angleBetween(heading, subject.heading) * (1 - Math.exp(-12 * dt))
      if (orbiting) return
      const ground = (p: { x: number; y: number }) => renderRef.current?.altitude({ ...p, id: p === subject.point ? 'camera-target' : 'camera-from' }, now) ?? (map.queryTerrainElevation(lngLat(p)) ?? 0)
      const view = chaseView(subject.unit, subject.point, heading + orbitYaw, chaseScale, ground)
      if (!map.getTerrain()) {
        const ratio = view.fromZ / Math.max(.1, view.fromZ - view.toZ)
        view.to = { x: view.from.x + (view.to.x - view.from.x) * ratio, y: view.from.y + (view.to.y - view.from.y) * ratio }; view.toZ = 0
      }
      elevationControl._elevationFreeze = true
      const options = map.calculateCameraOptionsFromTo(maplibregl.LngLat.convert(lngLat(view.from)), view.fromZ, maplibregl.LngLat.convert(lngLat(view.to)), view.toZ)
      options.zoom = Math.min(22, options.zoom!)
      chaseOptions = { ...options, center: maplibregl.LngLat.convert(options.center!), elevation: view.toZ }
      map.jumpTo(options)
    }
    frame = requestAnimationFrame(followFrame)
    const wheel = (e: WheelEvent) => { if (!latest.current.selected) return; e.preventDefault(); e.stopImmediatePropagation(); chaseScale = Math.max(.6, Math.min(6, chaseScale * Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * .003))) }
    const element = map.getContainer()
    element.addEventListener('wheel', wheel, { passive: false, capture: true })
    map.on('dragstart', e => {
      const event = e.originalEvent, rotateGesture = event instanceof MouseEvent ? event.button === 2 || event.buttons === 2 : event instanceof TouchEvent && event.touches.length > 1
      if (latest.current.selected && !rotateGesture) releaseFollow()
    })
    map.on('rotatestart', e => {
      if (!e.originalEvent || !latest.current.selected) return
      orbiting = true; orbitBearing = map.getBearing()
    })
    const updateOrbit = () => {
      const bearing = map.getBearing(), delta = (bearing - orbitBearing + 540) % 360 - 180
      orbitYaw = angleBetween(0, orbitYaw + delta * Math.PI / 180); orbitBearing = bearing
    }
    map.on('rotate', () => { if (orbiting && latest.current.selected) updateOrbit() })
    map.on('rotateend', () => { if (!orbiting) return; updateOrbit(); orbiting = false })
    let collision: GeometryPacket | null = null
    let mapLoaded = false, buildingsLoaded = false, readySent = false, consolidatedBuildings: GeometryPacket['features'] = []
    const finishLoading = () => { if (!mapLoaded || !buildingsLoaded || readySent) return; readySent = true; setLoading(false); latest.current.onWorldReady(); latest.current.onStatus('San Diego building catalog ready') }
    const cancelGeometry = loadBattleGeometry(packet => { collision = packet; latest.current.onGeometry(packet) }, text => latest.current.onStatus(text), () => latest.current.stateRef.current, value => setProgress(value), features => { consolidatedBuildings = features; buildingsLoaded = true; renderRef.current?.buildings.setFeatures(features); finishLoading() })
    const importGeometry = () => { if(collision) latest.current.onGeometry(collision) }
    const focus = (point: { x: number; y: number }, zoom = 16.3) => { releaseFollow(); map.flyTo({ center: lngLat(point), zoom, duration: 1100, essential: false }) }
    latest.current.onReady({ overview: () => { releaseFollow(); map.fitBounds(THEATER_BOUNDS, { padding: {top:map.getContainer().clientWidth<760?115:65,bottom:50,left:35,right:35}, pitch: 0, bearing: 0, duration: 1000 }) }, focus, zoom: delta => { if (latest.current.selected) chaseScale = Math.max(.6, Math.min(6, chaseScale * 2 ** (-delta / 2))); else map.zoomTo(map.getZoom() + delta, { duration: 300 }) }, rotate: () => { releaseFollow(); map.rotateTo(0, { duration: 600 }) }, tilt: () => { releaseFollow(); map.easeTo({ pitch: map.getPitch() > 10 ? 0 : 55, duration: 600 }) }, reimport: () => { imported.clear(); importGeometry() } })
    map.on('error', e => {
      const message = e.error?.message || ''
      if (/webgl|context lost/i.test(message)) { setError('The graphics context was lost. Reload to reconnect.'); latest.current.onStatus('Graphics interrupted') }
      else if (/tile|fetch|network/i.test(message)) latest.current.onStatus('Some map tiles unavailable · retry by panning')
    })
    map.on('resize', () => { if(!latest.current.selected&&map.getZoom()<12)map.fitBounds(THEATER_BOUNDS,{padding:{top:85,bottom:45,left:35,right:35},duration:0,pitch:0,bearing:0}) })
    map.on('click', () => latest.current.onSelect(null))
    const syncMinimap = () => {
      if (latest.current.graphics.performanceMode) {
        minimap?.remove(); minimap = null; return
      }
      if (!minimap && miniContainer.current) {
        const style = tacticalStyle(); style.layers = style.layers.filter(l => !['hillshade', 'buildings-3d', 'buildings-3d-detail', 'road-labels', 'unit-routes', 'tactical-grid'].includes(l.id)); delete style.sources.elevation; delete style.sources.hillshadeDem
        style.sources['mini-units'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
        style.layers.push({ id: 'mini-units', type: 'circle', source: 'mini-units', paint: { 'circle-radius': 2, 'circle-color': ['get', 'color'] } })
        minimap = new maplibregl.Map({ container: miniContainer.current, style, center: CENTER, zoom: 7.9, interactive: false, attributionControl: false, antialias: false, pixelRatio: 1 })
        minimap.fitBounds(THEATER_BOUNDS,{padding:8,duration:0})
        lastDataTick = -1
      }
    }
    map.on('load', () => {
      if (disposed) return
      mapLoaded = true; latest.current.onStatus('Geographic renderer online'); finishLoading()
      const initialGraphics = latest.current.graphics
      for (const [id, enabled] of [['buildings-3d', false], ['buildings-3d-detail', false], ['tactical-grid', initialGraphics.grid], ['unit-routes', initialGraphics.routes], ['road-labels', initialGraphics.labels], ['hillshade', initialGraphics.shadows]] as const) map.setLayoutProperty(id, 'visibility', enabled ? 'visible' : 'none')
      map.setPixelRatio(Math.min(window.devicePixelRatio, initialGraphics.quality === 'performance' ? 1 : initialGraphics.quality === 'balanced' ? 1.5 : 2))
      if (latest.current.graphics.terrain) map.setTerrain({ source: 'elevation', exaggeration: 1 })
      for (const side of ['BLU', 'RED'] as Side[]) for (const base of [{ ...BASES[side], label: `${side} MOB` }, { ...AIRBASES[side], label: `${side} AIRBASE` }]) {
        const el = document.createElement('button'); el.className = `base-marker ${side.toLowerCase()}`; el.textContent = base.label; el.setAttribute('aria-label', `Focus ${base.label}`)
        el.onclick = e => { e.stopPropagation(); latest.current.onSelect(null); focus(base, 16.5) }
        fixed.push(new maplibregl.Marker({ element: el }).setLngLat(lngLat(base)).addTo(map));el.setAttribute('aria-label',`Focus ${base.label}`)
      }
      importGeometry()
      if (!overlayStarted) {
        overlayStarted = true
        import('@/lib/game/renderer').then(({ BattlefieldRenderer }) => {
          if (disposed || !canvas.current) return
          try { renderRef.current = new BattlefieldRenderer(map, canvas.current, () => displayState, () => ({ graphics: latest.current.graphics, perspective: latest.current.perspective, selected: latest.current.selected, active: latest.current.active }), fps => latest.current.onFPS(fps));if(consolidatedBuildings.length)renderRef.current.buildings.setFeatures(consolidatedBuildings);latest.current.onStatus('3D renderer online') }
          catch { latest.current.onStatus('3D overlay unavailable · tactical map active') }
        }).catch(() => latest.current.onStatus('3D overlay unavailable · tactical map active'))
      }
      syncMinimap()
      interval = setInterval(() => {
        if (disposed || !latest.current.active || document.hidden || !map.getSource('tactical')) return
        const { stateRef, graphics, perspective, selected } = latest.current, state = stateRef.current, center = map.getCenter(), now = performance.now()
        syncMinimap()
        if (graphics.performanceMode && now - lastMarkers < 300) return
        lastMarkers = now
        fixed.forEach((marker,i)=>{marker.setOffset(map.getZoom()<12?[i%2===0?-85:85,0]:[0,0]);marker.getElement().style.zIndex='4'})
        const liveIds = new Set<string>()
        for (const o of state.objectives) {
          let marker = objectives.get(o.id)
          if (!marker) {
            const el = document.createElement('button'); const diamond = document.createElement('span'); diamond.className = 'objective-diamond'; const letter = document.createElement('span'); letter.textContent = o.id; diamond.append(letter)
            const label = document.createElement('span'); label.className = 'objective-label'; el.append(diamond, label)
            el.onclick = e => { e.stopPropagation(); latest.current.onSelect(null); focus(o, 16) }
            marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat(o)).addTo(map); objectives.set(o.id, marker)
          }
          const el = marker.getElement(); el.className = `maplibregl-marker objective-marker ${map.getZoom()<12?'strategic':''} ${o.owner?.toLowerCase() || ''}`; el.style.zIndex = '2'; el.setAttribute('aria-label', `Objective ${o.id}, ${o.contested ? 'contested' : o.owner || 'neutral'}`)
          const facilities=[o.facilities?.helipad&&!o.facilities.helipad.construction&&(o.facilities.helipad.hp>=40?'H':'H×'),o.facilities?.vehicleBay&&!o.facilities.vehicleBay.construction&&(o.facilities.vehicleBay.hp>=40?'V':'V×')].filter(Boolean).join(' / ')
          el.querySelector('.objective-label')!.textContent = o.contested ? 'CONTESTED' : o.capturing ? `CAPTURING ${Math.round(o.progress * 100)}%` : o.owner ? `${o.owner} CONTROL${facilities?` · ${facilities}`:''}` : 'UNCONTROLLED'
          ;(el.querySelector('.objective-label') as HTMLElement).style.display = map.getZoom()<12 ? 'none' : ''
          marker.setLngLat(lngLat(o))
        }
        for (const u of state.units) {
          const ll = lngLat(u), d = Math.hypot((ll[0] - center.lng) * 93650, (ll[1] - center.lat) * 111320)
          if (u.hp <= 0 || u.carrier || (map.getZoom()<12&&selected!==u.id&&(Math.hypot(u.x-BASES[u.side].x,u.y-BASES[u.side].y)<650||Math.hypot(u.x-AIRBASES[u.side].x,u.y-AIRBASES[u.side].y)<650)) || (perspective !== 'OBS' && u.side !== perspective && !u.spotted) || (map.getZoom()>14 && d > 1800 && selected !== u.id)) continue
          liveIds.add(u.id)
          let marker = markers.get(u.id)
          if (!marker) {
            const el = document.createElement('button'); const symbol = document.createElement('span'); symbol.className = 'marker-box'; symbol.textContent = ['TANK','APC','CANNON_APC','IFV'].includes(u.role) ? '▱' : u.role === 'TRUCK' ? '=' : u.role === 'COMMAND' ? '★' : ['RECON_UAV','CAS_FIGHTER','JET','ATTACK_HELI'].includes(u.role) ? '⌁' : u.role === 'MEDIC' ? '+' : '×'
            const health = document.createElement('span'); health.className = 'marker-health'; health.append(document.createElement('i')); const label = document.createElement('span'); label.className = 'marker-name'; label.textContent = u.name
            el.append(symbol, health, label); el.onclick = e => { e.stopPropagation(); latest.current.onSelect(u.id) }
            marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -10] }).setLngLat(ll).addTo(map); markers.set(u.id, marker)
          }
          const el = marker.getElement(); el.className = `maplibregl-marker tactical-marker ${u.side.toLowerCase()} ${selected === u.id ? 'selected' : ''}`; el.setAttribute('aria-label', `${u.name}, ${u.role}, ${u.mission}`)
          ;(el.querySelector('.marker-name') as HTMLElement).style.display = graphics.labels && (map.getZoom() > 15.4 || selected === u.id) ? 'block' : 'none'
          ;(el.querySelector('.marker-health i') as HTMLElement).style.width = `${u.hp}%`; marker.setLngLat(ll)
        }
        for (const [id, marker] of markers) if (!liveIds.has(id)) { marker.remove(); markers.delete(id) }
        if (now - lastData > 900 && (lastDataTick !== state.tick || lastPerspective !== perspective || lastRoutes !== graphics.routes)) {
          lastData = now; lastDataTick = state.tick; lastPerspective = perspective; lastRoutes = graphics.routes
          const routes: Feature<Geometry>[] = !graphics.routes ? [] : state.units.filter(u => u.hp > 0 && u.path.length && (perspective === 'OBS' || u.side === perspective) && (u.id === selected || ['RIFLE', 'TANK'].includes(u.role))).map(u => ({ type: 'Feature', properties: { color: SIDE_COLOR[u.side] }, geometry: { type: 'LineString', coordinates: [lngLat(u), ...u.path.map(lngLat)] } }))
          ;(map.getSource('tactical') as GeoJSONSource).setData(zoneFeatures(state, perspective)); if (graphics.routes) (map.getSource('routes') as GeoJSONSource).setData({ type: 'FeatureCollection', features: routes })
          if (minimap?.isStyleLoaded()) { (minimap.getSource('tactical') as GeoJSONSource).setData(zoneFeatures(state, perspective)); (minimap.getSource('mini-units') as GeoJSONSource).setData({ type: 'FeatureCollection', features: state.units.filter(u => u.hp > 0 && (perspective === 'OBS' || u.side === perspective || u.spotted)).map(u => ({ type: 'Feature', properties: { color: SIDE_COLOR[u.side] }, geometry: { type: 'Point', coordinates: lngLat(u) } })) } as FeatureCollection) }
        }
        if(state.paused && lastDataTick !== state.tick) map.triggerRepaint()

      }, 100)
    })
    return () => {
      disposed = true; element.removeEventListener('wheel', wheel, true); cancelAnimationFrame(frame); cancelGeometry(); if (interval) clearInterval(interval)
      renderRef.current?.dispose(); renderRef.current = null
      markers.forEach(m => m.remove()); objectives.forEach(m => m.remove()); fixed.forEach(m => m.remove()); minimap?.remove(); map.remove(); mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('buildings-3d')) return
    const graphics = effectiveGraphics(props.graphics)
    for (const [id, enabled] of [['buildings-3d', false], ['buildings-3d-detail', false], ['tactical-grid', graphics.grid], ['unit-routes', graphics.routes], ['road-labels', graphics.labels], ['hillshade', graphics.shadows]] as const) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', enabled ? 'visible' : 'none')
    map.setTerrain(graphics.terrain ? { source: 'elevation', exaggeration: 1 } : null)
    map.setPixelRatio(Math.min(window.devicePixelRatio, graphics.quality === 'performance' ? 1 : graphics.quality === 'balanced' ? 1.5 : 2))
    renderRef.current?.resize()
  }, [props.graphics])

  useEffect(() => { if (props.active) { const frame = requestAnimationFrame(() => { mapRef.current?.resize(); renderRef.current?.resize() }); return () => cancelAnimationFrame(frame) } else mapRef.current?.stop() }, [props.active])

  return <>
    <div ref={container} className="map-root" aria-label="Interactive geographic battlefield of San Diego" />
    <canvas ref={canvas} className="map-canvas" aria-hidden="true" />
    <div className="map-vignette" />
    <div className="minimap-card desktop-only" style={props.graphics.performanceMode ? { display: 'none' } : undefined}><div className="minimap-header"><span>THEATER OVERVIEW</span><span>N ↑</span></div><div ref={miniContainer} className="minimap-map" /></div>
    {loading && <div className={styles.loadingScreen} role="status"><div className={styles.loadingBrand}><span className={styles.brandOrb}><Crosshair size={17} /></span><span><strong>GRID COMMAND</strong><small>Preparing San Diego · City theater</small></span></div><div className={styles.loadingCopy}><strong>{progress.phase === 'assessing' ? 'COMBINING BUILDING FOOTPRINTS' : progress.phase === 'ready' ? 'BUILDINGS READY' : 'DISCOVERING BUILDINGS'}</strong><span>{progress.done.toLocaleString()} / {progress.total ? progress.total.toLocaleString() : '…'} {progress.phase === 'discovering' ? 'sectors' : 'buildings'}</span></div><div className={styles.loadingTrack}><i style={{ width: `${progress.total ? Math.min(100, progress.done / progress.total * 100) : 0}%` }} /></div></div>}
    {error && <div className="map-loading" role="alert"><span className="max-w-sm text-center text-sm">{error}</span><button className="map-control" onClick={() => window.location.reload()}>Reload battlefield</button></div>}
  </>
}

