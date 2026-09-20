import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import type { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator'
import { Observable } from '@babylonjs/core/Misc/observable'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import { configureShadowNormalBias, fitStudioShadowDepth } from '../lib/game/shadow-shading'
import { createBlenderVehicle } from '../lib/game/blender-vehicles'
import { buildingGeometry } from '../lib/game/building-model'
import { disposeModel } from '../lib/game/aircraft-models'
import * as T from '../lib/game/scene-data'

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
