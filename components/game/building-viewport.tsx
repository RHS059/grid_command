'use client'

import { useEffect, useRef, useState } from 'react'
import * as T from '@/lib/game/scene-data'
import { GraphicsRenderer, OrbitControls } from '@/lib/game/graphics-preview'
import { createBuildingModel, disposeBuildingModel } from '@/lib/game/building-model'
import type { BuildingPreset } from '@/lib/game/building-system'

export function BuildingViewport({ preset }: { preset: BuildingPreset }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!host.current) return
    setError('')
    let renderer: GraphicsRenderer
    try { renderer = new GraphicsRenderer({ antialias: true }) } catch { setError('3D preview could not start. Enable hardware acceleration and reload.'); return }
    void renderer.ready.catch(() => setError('3D preview could not start. Enable hardware acceleration and reload.'))
    const element = host.current, scene = new T.Scene(), camera = new T.PerspectiveCamera(42, 1, .1, 5000)
    scene.background = new T.Color('#101c29'); camera.up.set(0, 0, 1)
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))

    renderer.domElement.setAttribute('aria-label', `${preset.name} interactive 3D building preview`); element.append(renderer.domElement)
    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true; orbit.dampingFactor = .075; orbit.maxPolarAngle = Math.PI * .495; orbit.minPolarAngle = .08
    const building = createBuildingModel(preset); scene.add(building)
    const bounds = new T.Box3().setFromObject(building), size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3()), radius = Math.max(2, size.length() / 2)
    const planeSize = Math.max(size.x, size.y) * 4
    const ground = new T.Mesh(new T.PlaneGeometry(planeSize, planeSize), new T.MeshStandardMaterial({ color: '#1a2935', roughness: 1 }))
    ground.position.z = bounds.min.z - .03; ground.receiveShadow = true; scene.add(ground)
    const grid = new T.GridHelper(planeSize, 32, '#3d6070', '#263b47'); grid.rotation.x = Math.PI / 2; grid.position.z = bounds.min.z; scene.add(grid)
    scene.add(new T.HemisphereLight('#dcecff', '#182431', 2.4))
    const sun = new T.DirectionalLight('#fff1d5', 4); sun.position.set(-radius, radius * 1.4, radius * 2.5); sun.castShadow = true; scene.add(sun)
    const fill = new T.DirectionalLight('#7bb7d5', 1.6); fill.position.set(radius * 2, -radius, radius); scene.add(fill)
    building.traverse(object => { if (object instanceof T.Mesh) { object.castShadow = true; object.receiveShadow = true } })
    const frameModel = () => {
      const fov = T.MathUtils.degToRad(camera.fov), horizontal = Math.max(size.x, size.y) / Math.max(.65, camera.aspect)
      const distance = Math.max(size.z, horizontal) / (2 * Math.tan(fov / 2)) * 1.55
      camera.position.copy(center).addScaledVector(new T.Vector3(1.05, -1.35, .9).normalize(), distance)
      orbit.target.copy(center); orbit.minDistance = radius * .28; orbit.maxDistance = radius * 8
      camera.near = Math.max(.05, distance / 200); camera.far = distance * 30; camera.updateProjectionMatrix(); orbit.update()
    }
    const resize = () => { const rect = element.getBoundingClientRect(); if (!rect.width || !rect.height) return; renderer.setSize(rect.width, rect.height); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); frameModel() }
    const observer = new ResizeObserver(resize); observer.observe(element); resize()
    let frame = 0
    const render = () => { frame = requestAnimationFrame(render); orbit.update(); renderer.render(scene, camera) }
    frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); orbit.dispose(); disposeBuildingModel(building); ground.geometry.dispose(); (ground.material as T.Material).dispose(); renderer.dispose(); renderer.domElement.remove() }
  }, [preset])
  return <div ref={host} className="model-viewport relative h-full min-h-[420px] w-full overflow-hidden rounded-md border border-border bg-[#101c29]">{error && <p role="alert" className="p-6 text-sm text-destructive">{error}</p>}<div className="pointer-events-none absolute bottom-3 left-3 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">Drag to orbit · Scroll to zoom</div></div>
}

