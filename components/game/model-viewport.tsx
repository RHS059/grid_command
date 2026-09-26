'use client'
import { EngineBoil, applyEngineBoil } from '@/lib/game/engine-boil'
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
import { createHemtt, isHemttVariant } from '@/lib/game/hemtt-model'
import { addStudioLighting } from '@/lib/game/scene-lighting'
import { MODEL_DIMENSIONS, modelScale, modelDimensionLabel, modelGridSpacing, visibleModelBounds } from '@/lib/game/model-dimensions'
import { createNativeVehicle, isNativeVehicleId, nativeVehicleBounds } from '@/lib/game/native-vehicle-assets'

interface Props { model: ModelId; side: Side; active: boolean; animate: boolean; rotate: boolean; action: SoldierAction; stance: Stance; condition: Soldier['status']; damagePreview?: boolean; destruction?: number; reset: number; clip?:string; loop?:boolean; seek?:{serial:number;time:number}; onTime?:(time:number)=>void }
export function ModelViewport(props: Props) {
  const host = useRef<HTMLDivElement>(null), rendererRef=useRef<GraphicsRenderer|null>(null), current = useRef(props); current.current = props
  const [error, setError] = useState(''), [gridMetres, setGridMetres] = useState(1)
  useEffect(()=>()=>{rendererRef.current?.dispose();rendererRef.current?.domElement.remove();rendererRef.current=null},[])
  useEffect(() => {
    if (!props.active || !host.current) return
    setError('')
    let renderer=rendererRef.current
    if(!renderer){try { renderer = new GraphicsRenderer({ antialias: true, alpha: true });rendererRef.current=renderer;void renderer.ready.catch(() => setError('3D preview could not start. Enable hardware acceleration and reload.')) } catch { setError('3D preview could not start. Enable hardware acceleration and reload.'); return }}
    const element = host.current, scene = new T.Scene(), camera = new T.PerspectiveCamera(38, 1, .05, 5000)
    camera.up.set(0, 0, 1); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    renderer.domElement.setAttribute('aria-label', `${MODEL_NAMES[props.model]} interactive 3D model`); element.append(renderer.domElement)
    const orbit = new OrbitControls(camera, renderer.domElement); orbit.enableKeyboard = true; orbit.enableDamping = true; orbit.autoRotateSpeed = .65; orbit.maxPolarAngle = Math.PI * .49
    const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .08, flatShading: false })
    let object: T.Object3D | null = null, batch: SoldierBatch | null = null
    const modelScene = new T.Scene()
    const id = props.model
    if (isNativeVehicleId(id)) object = createNativeVehicle(id, props.side)
    else if (id === 'MOB' || id === 'AIRFIELD') object = createBase(id, props.side)
    else if (isHemttVariant(id)) object = createHemtt(id, props.side)
    else if (isAir(id)) object = createAircraft(id, props.side)
    else if (isSupportModel(id)) object = createSupportModel(id, props.side)
    else if (isVehicle(id)) {
      object = new T.Mesh(vehicleGeometry(id, props.side), material)
      object.userData.unitSurface = true
      if (['TANK', 'APC', 'IFV', 'CANNON_APC', 'ATTACK_HELI'].includes(id)) {
        const attachment = new T.Mesh(vehicleGeometry(id, props.side, true), material)
        attachment.name = 'turret'
        object.add(attachment)
      }
    }
    else batch = new SoldierBatch(modelScene, props.side, material)
    const motorRoot = new T.Group(), motor = new EngineBoil(id,`preview:${id}`);scene.add(motorRoot)
    motorRoot.add(modelScene)
    if (object) { if(id==='TROOP_TRUCK')addCarrierOccupants(object,props.side,true);modelScene.add(object) }
    // A studio scene honors each mesh's own cast/receive flags (unlike the battlefield
    // scene, which keeps its existing "everything casts and receives" behavior), so the
    // subject has to opt in explicitly. The grid deliberately does not.
    object?.traverse(node => { if (node instanceof T.Mesh) { node.castShadow = true; node.receiveShadow = true } })
    if (batch) for (const mesh of batch.parts.values()) { mesh.castShadow = true; mesh.receiveShadow = true }
    const sourceBounds = isNativeVehicleId(id) ? nativeVehicleBounds(id) : object ? visibleModelBounds(object) : new T.Box3(new T.Vector3(-1, -1, 0), new T.Vector3(1.5, 1, 1.7))
    const factor = modelScale(id, sourceBounds.getSize(new T.Vector3()))
    modelScene.scale.setScalar(factor)
    const bounds = new T.Box3(sourceBounds.min.clone().multiplyScalar(factor), sourceBounds.max.clone().multiplyScalar(factor))
    const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3()), radius = Math.max(size.length() / 2, .01)
    // Matte floor under the grid: catches the key light's shadow and gives the subject
    // somewhere to stand. Receive-only, and created after bounds so it never affects framing.
    const floor = new T.Mesh(new T.PlaneGeometry(radius * 40, radius * 40), new T.MeshStandardMaterial({ color: '#16243c', roughness: .96, metalness: 0 }))
    floor.position.z = bounds.min.z - .05; floor.receiveShadow = true; scene.add(floor)
    const spacing = modelGridSpacing(radius * 2), gridSpan = Math.ceil(radius * 8 / spacing) * spacing
    setGridMetres(spacing)
    const grid = new T.GridHelper(gridSpan, Math.round(gridSpan / spacing), '#5f9fc4', '#2d4a63'); grid.rotation.x = Math.PI / 2; grid.position.z = bounds.min.z - .04; scene.add(grid)
    const studio = addStudioLighting(scene)
    // A near plane at radius/1000 loses centimetre-separated runway paint to depth
    // rounding on a 1,200 m airfield. Radius/20 preserves those layers and remains
    // well inside the minimum orbit distance (radius * .3), including small units.
    const frameModel = () => { const direction = new T.Vector3(1, 1.55, 1.05).normalize(), right = new T.Vector3().crossVectors(camera.up, direction).normalize(), up = new T.Vector3().crossVectors(direction, right), tan = Math.tan(T.MathUtils.degToRad(camera.fov / 2)); let distance = 0; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) { const p = new T.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2); distance = Math.max(distance, Math.abs(p.dot(right)) / (tan * camera.aspect) + p.dot(direction), Math.abs(p.dot(up)) / tan + p.dot(direction)) } distance *= 1.1; camera.position.copy(center).add(direction.multiplyScalar(distance)); orbit.target.copy(center); orbit.minDistance = radius * .3; orbit.maxDistance = distance * 4; camera.near = Math.max(.015, radius / 20); camera.far = distance * 20; camera.updateProjectionMatrix(); orbit.update() }
    const resize = () => { const r = element.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height); camera.aspect = r.width / r.height; frameModel() }
    const observer = new ResizeObserver(resize); observer.observe(element); resize()
    let frame = 0, time = 0, previous = performance.now(), lastReset = current.current.reset, clipTime=0, lastClip="", lastSeek=-1, lastReport=0
    const render = (now: number) => {
      frame = requestAnimationFrame(render); const c = current.current, dt = Math.min(.05, (now - previous) / 1000); previous = now; if (c.animate) time += dt
      if (object) {
        object.userData.destroyed = !!c.damagePreview
        object.userData.vehicleDamage = c.damagePreview ? { damage: 1, destruction: Math.max(0, Math.min(1, c.destruction ?? 0)), heat: 0.72 } : undefined
      }
      if (lastReset !== c.reset) { lastReset = c.reset; frameModel() }
      if(object&&(object.userData.blenderVehicle||object.userData.nativeVehicle)){const clip=vehicleClips(id).find(v=>v.id===c.clip)||vehicleClips(id)[0];if(lastClip!==clip.id){lastClip=clip.id;clipTime=0}if(c.seek&&lastSeek!==c.seek.serial){lastSeek=c.seek.serial;clipTime=c.seek.time}else clipTime=advanceVehiclePlayback(clipTime,dt,c.animate,clip.duration,c.loop??clip.loop);poseVehicleClip(object,clip.id,clipTime);if(now-lastReport>80){c.onTime?.(clipTime);lastReport=now}}else if(object){animateAircraft(object,time);animateSupport(object,time)}
      if (batch && id !== 'MOB' && id !== 'AIRFIELD' && !isHemttVariant(id) && !isNativeVehicleId(id)) {
        // Imported bodies are 1.7 m tall; the temporary procedural body is 2.1 m.
        modelScene.scale.setScalar(MODEL_DIMENSIONS[id].metres / (batch.asset === 'ready' ? 1.7 : 2.1))
        const soldier: Soldier = { id: 'preview:0', x: 0, y: 0, status: c.condition, stance: c.stance, action: c.action, heading: 0, aim: Math.sin(time * .6) * .5, since: Math.floor(time / 2) * 2, shotAt: c.action === 'fire' || c.action === 'peek' ? Math.floor(time * 3) / 3 : -10 }
        batch.begin(); batch.pose(soldier, id, time, 0, true); if (c.action === 'drag') batch.pose({ ...soldier, id: 'preview:1', x: -.5, y: -1.2, status: 'downed' }, id, time, 0, true); batch.end(true)
      }
      motorRoot.position.set(0,0,0);motorRoot.rotation.set(0,0,0)
      applyEngineBoil(motorRoot,motor.sample(time,true,c.clip==='drive',!c.damagePreview,Math.max(size.x,size.y,size.z)))
      orbit.autoRotate = c.rotate; orbit.update(); studio.update(camera, orbit.target, center, radius); renderer.render(scene, camera)
    }
    frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); orbit.dispose(); batch?.dispose(); disposeModel(scene); material.dispose() }
  }, [props.model, props.side, props.active])
  return <div className="model-viewport relative" ref={host}>{error && <p role="alert" className="p-6 text-sm text-destructive">{error}</p>}<p className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">{modelDimensionLabel(props.model)} · Grid: {gridMetres} m · WASD move · Shift faster · Drag orbit · Right-drag pan · Wheel zoom</p></div>
}

