'use client'

import { EngineBoil, applyEngineBoil } from '@/lib/game/engine-boil'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Grid2X2, Pause, Play, X } from 'lucide-react'
import * as T from '@/lib/game/scene-data'
import { GraphicsRenderer } from '@/lib/game/graphics-preview'
import { SoldierBatch, vehicleGeometry } from '@/lib/game/unit-models'
import { createAircraft, disposeModel } from '@/lib/game/aircraft-models'
import { createSupportModel, isSupportModel } from '@/lib/game/support-models'
import { createBase } from '@/lib/game/base-models'
import { addCarrierOccupants } from '@/lib/game/carrier-occupants'
import { addStudioLighting } from '@/lib/game/scene-lighting'
import { isAir, isVehicle, type Side } from '@/lib/game/types'
import { MODEL_CATALOG, MODEL_NAMES, modelCategory, type ModelId } from '@/lib/game/model-catalog'
import { ModelViewport } from './model-viewport'
import styles from './model-preview-gallery.module.css'

/** All cards share one scene and GPU context. DOM cards provide hit targets and labels. */
function GalleryStage({ side, paused, onSelect }: { side: Side; paused: boolean; onSelect: (model: ModelId) => void }) {
  const host = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null)
  const cards = useRef(new Map<ModelId, HTMLButtonElement>())
  const pause = useRef(paused); pause.current = paused
  const [error, setError] = useState('')
  useEffect(() => {
    if (!host.current || !scroller.current) return
    const element = host.current, scroll = scroller.current
    let renderer: GraphicsRenderer
    try { renderer = new GraphicsRenderer({ antialias: true }) } catch { setError('3D gallery could not start. Enable hardware acceleration and reload.'); return }
    let disposed = false
    renderer.ready.catch(() => { if (!disposed) setError('3D gallery could not start. Enable hardware acceleration and reload.') })
    element.append(renderer.domElement)
    renderer.domElement.setAttribute('aria-hidden', 'true')
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(10, 1, 1, 500)
    const direction = new T.Vector3(1, 1.55, 1.05).normalize()
    const right = new T.Vector3().crossVectors(new T.Vector3(0, 0, 1), direction).normalize()
    const up = new T.Vector3().crossVectors(direction, right)
    camera.up.set(0, 0, 1); camera.position.copy(direction).multiplyScalar(100); camera.lookAt(new T.Vector3())
    const studio = addStudioLighting(scene)
    // No shadow map per card: the full viewer retains its normal studio shadows.
    studio.key.castShadow = false
    const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .08, flatShading: false })
    const items = MODEL_CATALOG.map(id => {
      const pivot = new T.Group(), content = new T.Scene()
      let object: T.Object3D | undefined, batch: SoldierBatch | undefined
      if (id === 'MOB' || id === 'AIRFIELD') object = createBase(id, side)
      else if (isAir(id)) object = createAircraft(id, side)
      else if (isSupportModel(id)) object = createSupportModel(id, side)
      else if (isVehicle(id)) {
        object = new T.Mesh(vehicleGeometry(id, side), material); object.userData.unitSurface = true
        if (['TANK', 'APC', 'IFV', 'CANNON_APC', 'ATTACK_HELI'].includes(id)) {
          const turret = new T.Mesh(vehicleGeometry(id, side, true), material); turret.name = 'turret'; object.add(turret)
        }
      } else batch = new SoldierBatch(content, side, material)
      if (object) { if (id === 'TROOP_TRUCK') addCarrierOccupants(object, side, true); content.add(object) }
      const bounds = object ? new T.Box3().setFromObject(object) : new T.Box3(new T.Vector3(-.7, -.7, 0), new T.Vector3(.7, .7, 2.1))
      const center = bounds.getCenter(new T.Vector3()), radius = Math.max(.01, bounds.getSize(new T.Vector3()).length() / 2)
      content.position.copy(center).multiplyScalar(-1)
      const motorRoot = new T.Group(), motor = new EngineBoil(id,`gallery:${id}`)
      motorRoot.add(content);pivot.add(motorRoot); scene.add(pivot)
      return { id, pivot, content, radius, batch, motorRoot, motor }
    })
    let width = 1, height = 1, dirty = true, frame = 0, previous = performance.now(), angle = 0, motorTime = 0
    const resize = () => { width = Math.max(2, element.clientWidth); height = Math.max(2, element.clientHeight); renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); dirty = true }
    const observer = new ResizeObserver(resize); observer.observe(element); resize()
    const onScroll = () => { dirty = true }; scroll.addEventListener('scroll', onScroll, { passive: true })
    const layout = () => {
      const viewport = element.getBoundingClientRect(), worldPerPixel = 2 * 100 * Math.tan(Math.PI / 36) / height
      for (const item of items) {
        const rect = cards.current.get(item.id)?.getBoundingClientRect()
        item.pivot.visible = !!rect && rect.bottom > viewport.top && rect.top < viewport.bottom
        if (!rect || !item.pivot.visible) continue
        const x = rect.left + rect.width / 2 - viewport.left - width / 2
        const y = height / 2 - (rect.top + (rect.height - 52) / 2 - viewport.top)
        item.pivot.position.copy(right).multiplyScalar(x * worldPerPixel).addScaledVector(up, y * worldPerPixel)
        const scale = Math.min(rect.width * .39, (rect.height - 52) * .4) * worldPerPixel / item.radius
        item.pivot.scale.set(scale, scale, scale)
      }
      dirty = false
    }
    const render = (now: number) => {
      frame = requestAnimationFrame(render)
      // A slow turntable needs only 24 fps. Pause all GPU work in background tabs.
      if (document.hidden || now - previous < 1000 / 24) return
      const dt = Math.min(.1, (now - previous) / 1000); previous = now
      if (!pause.current) { angle += dt * .12; motorTime += dt }
      if (dirty) layout()
      for (const item of items) {
        if (!item.pivot.visible) continue
        item.pivot.rotation.z = angle
        item.motorRoot.position.set(0,0,0);item.motorRoot.rotation.set(0,0,0)
        applyEngineBoil(item.motorRoot,item.motor.sample(motorTime,true,false,true,item.radius*2))
        if (item.batch && item.id !== 'MOB' && item.id !== 'AIRFIELD') {
          item.batch.begin(); item.batch.pose({ id: `gallery:${item.id}`, x: 0, y: 0, status: 'active', stance: 'stand', action: 'idle', heading: 0, aim: 0, since: 0, shotAt: -10 }, item.id, 0, 0, true); item.batch.end(true)
        }
      }
      studio.update(camera, new T.Vector3(), new T.Vector3(), 15)
      renderer.render(scene, camera)
    }
    frame = requestAnimationFrame(render)
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); scroll.removeEventListener('scroll', onScroll); for (const item of items) item.batch?.dispose(); disposeModel(scene); material.dispose(); renderer.dispose(); renderer.domElement.remove() }
  }, [side])
  return <div className={styles.stage}>
    <div ref={host} className={styles.canvas} />
    <div ref={scroller} className={styles.scroll}><div className={styles.grid}>{MODEL_CATALOG.map(id => <button ref={node => { if (node) cards.current.set(id, node); else cards.current.delete(id) }} key={id} type="button" className={styles.tile} onClick={() => onSelect(id)} aria-label={`Inspect ${MODEL_NAMES[id]}`}><span className={styles.caption}><strong>{MODEL_NAMES[id]}</strong><small>{modelCategory(id)} · {id.replaceAll('_', ' ')}</small></span></button>)}</div></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>
}

export function ModelPreviewGallery() {
  const [selected, setSelected] = useState<ModelId | null>(null), [side, setSide] = useState<Side>('BLU'), [paused, setPaused] = useState(false)
  const lastSelected = useRef<ModelId | null>(null)
  const select = (id: ModelId) => { lastSelected.current = id; setSelected(id) }
  const close = () => setSelected(null)
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null) }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [])
  useEffect(() => { if (!selected && lastSelected.current) { const button = document.querySelector<HTMLButtonElement>(`[aria-label="Inspect ${MODEL_NAMES[lastSelected.current]}"]`); button?.focus({ preventScroll: true }); button?.scrollIntoView({ block: 'nearest' }) } }, [selected])
  return <main className={styles.root}>
    <header className={styles.header}><Link href="/" className={styles.back}><ArrowLeft size={16} /> Battlefield</Link><div><h1><Grid2X2 size={18} /> Model Preview Gallery</h1><p>{selected ? MODEL_NAMES[selected] : `${MODEL_CATALOG.length} production models · Select a model to inspect`}</p></div><div className={styles.actions}><div role="group" aria-label="Gallery livery">{(['BLU', 'RED'] as const).map(value => <button key={value} aria-pressed={side === value} onClick={() => setSide(value)}>{value} FORCE</button>)}</div>{!selected && <button onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume turntables' : 'Pause turntables'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>}<Link href="/model_preview">Model Preview</Link></div></header>
    {selected ? <section className={styles.focus} aria-label={`${MODEL_NAMES[selected]} inspection`}><ModelViewport model={selected} side={side} active animate rotate={false} action="idle" stance="stand" condition="active" reset={0} /><button autoFocus className={styles.close} onClick={close} aria-label="Return to model grid"><X size={22} /></button><p className={styles.hint}>Drag to rotate · Scroll to zoom · Esc to return</p></section> : <GalleryStage side={side} paused={paused} onSelect={select} />}
  </main>
}
