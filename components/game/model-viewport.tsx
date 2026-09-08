'use client'
import { useEffect, useRef, useState } from 'react'
import * as T from '@/lib/game/scene-data'
import { GraphicsRenderer, OrbitControls } from '@/lib/game/graphics-preview'
import { addCarrierOccupants } from '@/lib/game/carrier-occupants'
import { SoldierBatch, vehicleGeometry } from '@/lib/game/unit-models'
import { createAircraft, animateAircraft, disposeModel } from '@/lib/game/aircraft-models'
import { createSupportModel, isSupportModel, animateSupport } from '@/lib/game/support-models'
import { createBase } from '@/lib/game/base-models'
import { isAir, isVehicle, type Side, type SoldierAction, type Stance, type Soldier } from '@/lib/game/types'
import { MODEL_NAMES, type ModelId } from '@/lib/game/model-catalog'

interface Props { model: ModelId; side: Side; active: boolean; animate: boolean; rotate: boolean; action: SoldierAction; stance: Stance; condition: Soldier['status']; reset: number }
export function ModelViewport(props: Props) {
  const host = useRef<HTMLDivElement>(null), current = useRef(props); current.current = props
  const [error, setError] = useState('')
  useEffect(() => {
    if (!props.active || !host.current) return
    setError('')
    let renderer: GraphicsRenderer
    try { renderer = new GraphicsRenderer({ antialias: true, alpha: true }) } catch { setError('3D preview could not start. Enable hardware acceleration and reload.'); return }
    void renderer.ready.catch(() => setError('3D preview could not start. Enable hardware acceleration and reload.'))
    const element = host.current, scene = new T.Scene(), camera = new T.PerspectiveCamera(38, 1, .05, 5000)
    camera.up.set(0, 0, 1); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    renderer.domElement.setAttribute('aria-label', `${MODEL_NAMES[props.model]} interactive 3D model`); element.append(renderer.domElement)
    const orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.autoRotateSpeed = .65; orbit.maxPolarAngle = Math.PI * .49
    const sky = new T.HemisphereLight('#dbe7ef', '#172432', 2.8); sky.position.set(0, 0, 1); scene.add(sky)
    const sun = new T.DirectionalLight('#dbe7ef', 3.2); sun.position.set(-30, 30, 60); scene.add(sun)
    const fill = new T.DirectionalLight('#a4afb4', 1.4); fill.position.set(30, -20, 20); scene.add(fill)
    const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: .08, flatShading: true })
    let object: T.Object3D | null = null, batch: SoldierBatch | null = null
    const id = props.model
    if (id === 'MOB' || id === 'AIRFIELD') object = createBase(id, props.side)
    else if (isAir(id)) object = createAircraft(id, props.side)
    else if (isSupportModel(id)) object = createSupportModel(id, props.side)
    else if (isVehicle(id)) { object = new T.Mesh(vehicleGeometry(id, props.side), material); if (id !== 'TRUCK') { const attachment = new T.Mesh(vehicleGeometry(id, props.side, true), material); attachment.name = 'turret'; object.add(attachment) } }
    else batch = new SoldierBatch(scene, props.side, material)
    if (object) { if(id==='TROOP_TRUCK')addCarrierOccupants(object,props.side);scene.add(object) }
    const bounds = object ? new T.Box3().setFromObject(object) : new T.Box3(new T.Vector3(-1, -1, 0), new T.Vector3(1.5, 1, 2.1))
    const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3()), radius = size.length() / 2
    const grid = new T.GridHelper(radius * 5, 30, '#34473f', '#18222b'); grid.rotation.x = Math.PI / 2; grid.position.z = bounds.min.z - .04; scene.add(grid)
    const frameModel = () => { const direction = new T.Vector3(1, 1.55, 1.05).normalize(), right = new T.Vector3().crossVectors(camera.up, direction).normalize(), up = new T.Vector3().crossVectors(direction, right), tan = Math.tan(T.MathUtils.degToRad(camera.fov / 2)); let distance = 0; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) { const p = new T.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2); distance = Math.max(distance, Math.abs(p.dot(right)) / (tan * camera.aspect) + p.dot(direction), Math.abs(p.dot(up)) / tan + p.dot(direction)) } distance *= 1.1; camera.position.copy(center).add(direction.multiplyScalar(distance)); orbit.target.copy(center); orbit.minDistance = radius * .3; orbit.maxDistance = distance * 4; camera.near = Math.max(.015, radius / 1000); camera.far = distance * 20; camera.updateProjectionMatrix(); orbit.update() }
    const resize = () => { const r = element.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height); camera.aspect = r.width / r.height; frameModel() }
    const observer = new ResizeObserver(resize); observer.observe(element); resize()
    let frame = 0, time = 0, previous = performance.now(), lastReset = current.current.reset
    const render = (now: number) => {
      frame = requestAnimationFrame(render); const c = current.current, dt = Math.min(.05, (now - previous) / 1000); previous = now; if (c.animate) time += dt
      if (lastReset !== c.reset) { lastReset = c.reset; frameModel() }
      if (object) { animateAircraft(object, time); animateSupport(object,time); const turret = object.getObjectByName('turret'); if (turret) turret.rotation.z = Math.sin(time * .5) * .4 }
      if (batch && id !== 'MOB' && id !== 'AIRFIELD') {
        const soldier: Soldier = { id: 'preview:0', x: 0, y: 0, status: c.condition, stance: c.stance, action: c.action, heading: 0, aim: Math.sin(time * .6) * .5, since: Math.floor(time / 2) * 2, shotAt: c.action === 'fire' || c.action === 'peek' ? Math.floor(time * 3) / 3 : -10 }
        batch.begin(); batch.pose(soldier, id, time, 0, true); if (c.action === 'drag') batch.pose({ ...soldier, id: 'preview:1', x: -.5, y: -1.2, status: 'downed' }, id, time, 0, true); batch.end(true)
      }
      orbit.autoRotate = c.rotate; orbit.update(); renderer.render(scene, camera)
    }
    frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); orbit.dispose(); batch?.dispose(); disposeModel(scene); material.dispose(); renderer.dispose(); renderer.domElement.remove() }
  }, [props.model, props.side, props.active])
  return <div className="model-viewport" ref={host}>{error && <p role="alert" className="p-6 text-sm text-destructive">{error}</p>}</div>
}
