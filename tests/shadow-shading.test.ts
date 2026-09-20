import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import type { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator'
import { Observable } from '@babylonjs/core/Misc/observable'
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import { configureShadowNormalBias, fitStudioShadowDepth, prepareTwoSidedShadowBias, shadowNormalBias } from '../lib/game/shadow-shading'
import { createBlenderVehicle } from '../lib/game/blender-vehicles'
import { buildingGeometry } from '../lib/game/building-model'
import { disposeModel } from '../lib/game/aircraft-models'
import * as T from '../lib/game/scene-data'

test('both shadow backends keep thin shell undersides behind the visible surface', () => {
  prepareTwoSidedShadowBias()
  for (const store of [ShaderStore.IncludesShadersStore, ShaderStore.IncludesShadersStoreWGSL]) {
    const shader = store.shadowMapVertexNormalBias
    // Exercise the actual installed shader expression, so a missing replacement
    // or a Babylon include change fails this regression instead of testing a copy.
    const expression = shader.match(/vNormalW\*=([^;]+);/)?.[1]
    assert.ok(expression, 'the shadow shader orients the normal before applying bias')
    const orientation = new Function('ndlSM', 'select', `return ${expression}`) as (dot: number, select: (a: number, b: number, chooseB: boolean) => number) => number
    const select = (a: number, b: number, chooseB: boolean) => chooseB ? b : a
    for (const cosine of [.21, .5, .95]) for (const thickness of [.03, .35, .4]) {
      const bias = shadowNormalBias(2048, 1024, 1024) * Math.sqrt(1 - cosine * cosine)
      const top = -orientation(cosine, select) * bias
      const underside = -thickness + orientation(-cosine, select) * bias
      assert.ok(underside < top, `a ${thickness} m slab never becomes its own occluder at light cosine ${cosine}`)
      for (const dot of [cosine, -cosine]) assert.ok(-dot * orientation(dot, select) * bias <= 0, 'both faces move away from the light')
    }
    assert.match(shader, /clamp\(dot\(vNormalW,worldLightDirSM\),-1\.0,1\.0\)/, 'rounding cannot give sqrt a negative argument')
    prepareTwoSidedShadowBias()
    assert.equal(store.shadowMapVertexNormalBias, shader, 'configuration is idempotent across runtimes')
  }
})

test('each shadow cascade uses its own pixel size instead of a fixed world offset', () => {
  const render = new Observable<number>(), extents = [4, 64, 4000]
  const shadow = {
    normalBias: 0,
    getShadowMap: () => ({ onBeforeRenderObservable: render, getSize: () => ({ width: 1024 }) }),
    getCascadeMinExtents: () => ({ x: 0, y: 0 }),
    getCascadeMaxExtents: (layer: number) => ({ x: extents[layer], y: extents[layer] / 2 }),
  }
  configureShadowNormalBias(shadow as unknown as CascadedShadowGenerator)
  for (let layer = 0; layer < extents.length; layer++) {
    render.notifyObservers(layer)
    const pixels = shadow.normalBias / (extents[layer] / 1024)
    assert.ok(pixels >= 1 && pixels <= 2, `cascade ${layer} covers the sample footprint`)
  }
  render.notifyObservers(0)
  assert.ok(shadow.normalBias < .01, 'the near cascade regains the small offset after the far cascade')
})

test('studio shadow depth follows vehicles and generated surfaces without including the receiver floor', () => {
  const engine = new NullEngine()
  const runtime = new (BabylonRuntime as unknown as new (canvas: HTMLCanvasElement, engine: NullEngine) => BabylonRuntime)({ dataset: {} } as HTMLCanvasElement, engine)
  const subjects: T.Object3D[] = [
    createBlenderVehicle('AIRCRAFT_CARRIER', 'BLU'), createBlenderVehicle('TANK', 'BLU'), createBlenderVehicle('JET', 'BLU'),
    new T.Mesh(buildingGeometry('wall'), new T.MeshStandardMaterial()),
    new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshStandardMaterial()),
  ]
  try {
    for (const subject of subjects) {
      const scene = new T.Scene(); scene.profile = 'studio'; scene.add(subject)
      subject.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = true } })
      const bounds = new T.Box3().setFromObject(subject), center = bounds.getCenter(new T.Vector3()), radius = Math.max(1, bounds.getSize(new T.Vector3()).length() / 2)
      const floor = new T.Mesh(new T.PlaneGeometry(radius * 40, radius * 40), new T.MeshStandardMaterial())
      floor.name = 'receiver-floor'; floor.receiveShadow = true; floor.position.z = bounds.min.z - .05; scene.add(floor)
      const position = center.clone().add(new T.Vector3(0, -radius * 3, radius * .2))
      runtime.setCamera(position, center, { x: 0, y: 0, z: 1 }, .7, .01, radius * 100)
      runtime.sync(scene)
      const casters = runtime.scene.meshes.filter(mesh => mesh.name !== floor.name)
      let interval = [0, 1]
      const shadow = { getShadowMap: () => ({ renderList: casters }), setMinMaxDistance: (min: number, max: number) => { interval = [min, max] } }
      fitStudioShadowDepth(shadow as unknown as CascadedShadowGenerator, runtime.camera)
      assert.ok(interval[0] >= 0 && interval[1] > interval[0])
      assert.ok(interval[1] < .1, `${subject.name || 'generated surface'} keeps the preview floor out of the far range`)
      assert.ok(runtime.scene.meshes.find(mesh => mesh.name === floor.name)!.receiveShadows, 'the floor still receives the model shadow')
      disposeModel(scene)
    }
  } finally { runtime.dispose() }
})
