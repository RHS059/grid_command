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
import { vehicleClips, poseVehicleClip, advanceVehiclePlayback } from '@/lib/game/vehicle-animation'
import { MODEL_NAMES, type ModelId } from '@/lib/game/model-catalog'
import { addStudioLighting } from '@/lib/game/scene-lighting'

interface Props { model: ModelId; side: Side; active: boolean; animate: boolean; rotate: boolean; action: SoldierAction; stance: Stance; condition: Soldier['status']; reset: number; clip?:string; loop?:boolean; seek?:{serial:number;time:number}; onTime?:(time:number)=>void }
export function ModelViewport(props: Props) {
  const host = useRef<HTMLDivElement>(null), rendererRef=useRef<GraphicsRenderer|null>(null), current = useRef(props); current.current = props
  const [error, setError] = useState('')
  useEffect(()=>()=>{rendererRef.current?.dispose();rendererRef.current?.domElement.remove();rendererRef.current=null},[])
  useEffect(() => {
    if (!props.active || !host.current) return
    setError('')
    let renderer=rendererRef.current
    if(!renderer){try { renderer = new GraphicsRenderer({ antialias: true, alpha: true });rendererRef.current=renderer;void renderer.ready.catch(() => setError('3D preview could not start. Enable hardware acceleration and reload.')) } catch { setError('3D preview could not start. Enable hardware acceleration and reload.'); return }}
    const element = host.current, scene = new T.Scene(), camera = new T.PerspectiveCamera(38, 1, .05, 5000)
    camera.up.set(0, 0, 1); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    renderer.domElement.setAttribute('aria-label', `${MODEL_NAMES[props.model]} interactive 3D model`); element.append(renderer.domElement)
    const orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.autoRotateSpeed = .65; orbit.maxPolarAngle = Math.PI * .49
    const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: .08, flatShading: false })
    let object: T.Object3D | null = null, batch: SoldierBatch | null = null
    const id = props.model
    if (id === 'MOB' || id === 'AIRFIELD') object = createBase(id, props.side)
    else if (isAir(id)) object = createAircraft(id, props.side)
    else if (isSupportModel(id)) object = createSupportModel(id, props.side)
    else if (isVehicle(id)) { object = new T.Mesh(vehicleGeometry(id, props.side), material); if (id !== 'TRUCK') { const attachment = new T.Mesh(vehicleGeometry(id, props.side, true), material); attachment.name = 'turret'; object.add(attachment) } }
    else batch = new SoldierBatch(scene, props.side, material)
    if (object) { if(id==='TROOP_TRUCK')addCarrierOccupants(object,props.side,true);scene.add(object) }
    // A studio scene honors each mesh's own cast/receive flags (unlike the battlefield
    // scene, which keeps its existing "everything casts and receives" behavior), so the
    // subject has to opt in explicitly. The grid deliberately does not.
    object?.traverse(node => { if (node instanceof T.Mesh) { node.castShadow = true; node.receiveShadow = true } })
    if (batch) for (const mesh of batch.parts.values()) { mesh.castShadow = true; mesh.receiveShadow = true }
    const bounds = object ? new T.Box3().setFromObject(object) : new T.Box3(new T.Vector3(-1, -1, 0), new T.Vector3(1.5, 1, 2.1))
    const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3()), radius = Math.max(size.length() / 2, .01)
    const grid = new T.GridHelper(radius * 5, 30, '#34473f', '#18222b'); grid.rotation.x = Math.PI / 2; grid.position.z = bounds.min.z - .04; scene.add(grid)
    const studio = addStudioLighting(scene)
    const frameModel = () => { const direction = new T.Vector3(1, 1.55, 1.05).normalize(), right = new T.Vector3().crossVectors(camera.up, direction).normalize(), up = new T.Vector3().crossVectors(direction, right), tan = Math.tan(T.MathUtils.degToRad(camera.fov / 2)); let distance = 0; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) { const p = new T.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2); distance = Math.max(distance, Math.abs(p.dot(right)) / (tan * camera.aspect) + p.dot(direction), Math.abs(p.dot(up)) / tan + p.dot(direction)) } distance *= 1.1; camera.position.copy(center).add(direction.multiplyScalar(distance)); orbit.target.copy(center); orbit.minDistance = radius * .3; orbit.maxDistance = distance * 4; camera.near = Math.max(.015, radius / 1000); camera.far = distance * 20; camera.updateProjectionMatrix(); orbit.update() }
    const resize = () => { const r = element.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height); camera.aspect = r.width / r.height; frameModel() }
    const observer = new ResizeObserver(resize); observer.observe(element); resize()
    let frame = 0, time = 0, previous = performance.now(), lastReset = current.current.reset, clipTime=0, lastClip="", lastSeek=-1, lastReport=0
    const render = (now: number) => {
      frame = requestAnimationFrame(render); const c = current.current, dt = Math.min(.05, (now - previous) / 1000); previous = now; if (c.animate) time += dt
      if (lastReset !== c.reset) { lastReset = c.reset; frameModel() }
      if(object?.userData.blenderVehicle){const clip=vehicleClips(id).find(v=>v.id===c.clip)||vehicleClips(id)[0];if(lastClip!==clip.id){lastClip=clip.id;clipTime=0}if(c.seek&&lastSeek!==c.seek.serial){lastSeek=c.seek.serial;clipTime=c.seek.time}else clipTime=advanceVehiclePlayback(clipTime,dt,c.animate,clip.duration,c.loop??clip.loop);poseVehicleClip(object,clip.id,clipTime);if(now-lastReport>80){c.onTime?.(clipTime);lastReport=now}}else if(object){animateAircraft(object,time);animateSupport(object,time)}
      if (batch && id !== 'MOB' && id !== 'AIRFIELD') {
        const soldier: Soldier = { id: 'preview:0', x: 0, y: 0, status: c.condition, stance: c.stance, action: c.action, heading: 0, aim: Math.sin(time * .6) * .5, since: Math.floor(time / 2) * 2, shotAt: c.action === 'fire' || c.action === 'peek' ? Math.floor(time * 3) / 3 : -10 }
        batch.begin(); batch.pose(soldier, id, time, 0, true); if (c.action === 'drag') batch.pose({ ...soldier, id: 'preview:1', x: -.5, y: -1.2, status: 'downed' }, id, time, 0, true); batch.end(true)
      }
      orbit.autoRotate = c.rotate; orbit.update(); studio.update(camera, orbit.target, center, radius); renderer.render(scene, camera)
    }
    frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); orbit.dispose(); batch?.dispose(); disposeModel(scene); material.dispose() }
  }, [props.model, props.side, props.active])
  return <div className="model-viewport" ref={host}>{error && <p role="alert" className="p-6 text-sm text-destructive">{error}</p>}</div>
}
