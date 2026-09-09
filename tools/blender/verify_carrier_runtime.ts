/** Exercise the shipped GLB, including reverse playback, scrubbing and planted contacts. */
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import '@babylonjs/core/Animations/animatable'
import '@babylonjs/loaders/glTF'

type Point = [number, number, number]
interface Route {
  frames: number[]
  root: Point[]
  yaw: number[]
  left_sole: Point[]
  right_sole: Point[]
  handhold: Point
  grip_hand: 'L'|'R'
  seat: { id: string }
}
const output = path.resolve(process.env.GC_OUTPUT_DIR || '../../outputs/astra_3/troop_transport_fit')
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]))
function expectedFoot(route: Route, key: 'left_sole'|'right_sole', frame: number) {
  const segment = Math.max(0, route.frames.findIndex((end, i) => i > 0 && frame <= end) - 1)
  const t = Math.max(0, Math.min(1, (frame - route.frames[segment]) / (route.frames[segment + 1] - route.frames[segment])))
  const eased = t * t * (3 - 2 * t), a = route[key][segment], b = route[key][segment + 1]
  const result = a.map((v, i) => v + (b[i] - v) * eased)
  if (distance(a, b) > .015 && segment < 4) result[2] += Math.sin(Math.PI * t) * .10
  result[2] += .174 // Sole-to-ankle offset of the unscaled canonical rig.
  return result
}
async function main() {
  const engine = new NullEngine(), scene = new Scene(engine)
  scene.useRightHandedSystem = true
  const bytes = new Uint8Array(fs.readFileSync('public/models/carrier-soldier.glb'))
  const asset = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' })
  try {
    for (const prefix of ['mount_', 'dismount_', 'seat_']) assert.equal(asset.animationGroups.filter(a => a.name.startsWith(prefix)).length, 8)
    const root = asset.transformNodes.find(n => n.name === 'Astra_Rigify_Rig')!
    assert.ok(root)
    const routes: Route[] = JSON.parse(fs.readFileSync(path.join(output, 'carrier_boarding_routes.json'), 'utf8')).routes
    const joints = asset.transformNodes.filter(n => n.name.startsWith('DEF-'))
    const feet = ['L', 'R'].map(side => asset.transformNodes.find(n => n.name === `DEF-foot.${side}`)!)
    assert.ok(feet.every(Boolean)); assert.ok(joints.length > 50)
    let active: AnimationGroup | undefined
    const sample = (group: AnimationGroup, frame: number) => {
      if (active !== group) { active?.stop(); group.start(false); group.pause(); active = group }
      group.goToFrame(frame / 24 * group.targetedAnimations[0].animation.framePerSecond)
      scene.incrementRenderId()
      for (const node of asset.transformNodes) node.computeWorldMatrix(true)
      return joints.map(joint => Array.from(joint.getWorldMatrix().asArray()))
    }
    let maxContactError = 0, maxPlantedError = 0, maxHandholdError = 0, maxReverseError = 0, maxSeatError = 0, maxScrubError = 0
    let worstContact: unknown
    const endpoints: {name:string;start:number[];end:number[]}[] = []
    let poseSamples = 0
    const compare = (a: number[][], b: number[][]) => Math.max(...a.flatMap((matrix, i) => matrix.map((v, j) => Math.abs(v - b[i][j]))))
    for (const route of routes) {
      const mount = asset.animationGroups.find(a => a.name === `mount_${route.seat.id}`)!
      const dismount = asset.animationGroups.find(a => a.name === `dismount_${route.seat.id}`)!
      const seated = asset.animationGroups.find(a => a.name === `seat_${route.seat.id}`)!
      for (const group of [mount, dismount, seated]) assert.ok(group)
      sample(mount, 0); const start = root.position.asArray()
      const poses: number[][][] = []
      for (let frame = 0; frame <= 80; frame++) {
        poses.push(sample(mount, frame)); poseSamples++
        assert.ok(poses[frame].flat().every(Number.isFinite))
        for (const [index, key] of (['left_sole', 'right_sole'] as const).entries()) {
          const actual = feet[index].getAbsolutePosition().asArray(), expected = expectedFoot(route, key, frame)
          const error = distance(actual, expected)
          if (error > maxContactError) { maxContactError = error; worstContact = { seat: route.seat.id, frame, side: index ? 'R' : 'L', actual, expected } }
          if (route.frames.includes(frame)) maxPlantedError = Math.max(maxPlantedError, error)
        }
        const gripStart = /^(07|08)/.test(route.seat.id) ? 30 : 18
        if (frame >= gripStart && frame <= 48) {
          const hand = asset.transformNodes.find(n => n.name === `DEF-hand.${route.grip_hand}`)!
          assert.ok(hand)
          maxHandholdError = Math.max(maxHandholdError, distance(hand.getAbsolutePosition().asArray(), route.handhold))
        }
      }
      const end = root.position.asArray()
      assert.ok(distance(start, end) > .5)
      for (let frame = 0; frame <= 80; frame++) { maxReverseError = Math.max(maxReverseError, compare(sample(dismount, frame), poses[80 - frame])); poseSamples++ }
      maxSeatError = Math.max(maxSeatError, compare(sample(seated, 0), poses[80])); poseSamples++
      for (const frame of [70, 2, 55, 19, 80, 0, 43]) { maxScrubError = Math.max(maxScrubError, compare(sample(mount, frame), poses[frame])); poseSamples++ }
      endpoints.push({ name: mount.name, start, end })
    }
    // Use the same independent skinned clones as the model viewer and gameplay.
    const crew = routes.map(route => {
      const entries = asset.instantiateModelsToScene(name => name, true, { doNotInstantiate: true })
      const nodes = entries.rootNodes.flatMap(node => [node, ...node.getDescendants(false)])
      const actor = nodes.find(node => node.name === 'Astra_Rigify_Rig')
      assert.ok(actor instanceof TransformNode)
      const seated = entries.animationGroups.find(group => group.name === `seat_${route.seat.id}`)!
      seated.start(true); seated.pause(); seated.goToFrame(0)
      return { entries, actor, seated, route }
    })
    const crewPositions = crew.map(member => member.actor.position.asArray())
    const maxCrewPositionError = Math.max(...crewPositions.map((position, i) => distance(position, endpoints[i].end)))
    const selected = crew[0], selectedMount = selected.entries.animationGroups.find(group => group.name === `mount_${selected.route.seat.id}`)!
    selected.seated.stop(); selectedMount.start(false); selectedMount.pause(); selectedMount.goToFrame(0)
    const maxCrewIsolationError = Math.max(...crew.slice(1).map((member, i) => distance(member.actor.position.asArray(), crewPositions[i + 1])))
    assert.ok(distance(selected.actor.position.asArray(), crewPositions[0]) > .5)
    selectedMount.stop(); selected.seated.start(true); selected.seated.pause(); selected.seated.goToFrame(0)
    assert.ok(distance(selected.actor.position.asArray(), crewPositions[0]) < .0001)
    crew.forEach(member => member.entries.dispose())
    const report = { animationGroups: asset.animationGroups.length, skeletons: asset.skeletons.length, meshes: asset.meshes.length, joints: joints.length, poseSamples, maxContactError, maxPlantedError, maxHandholdError, maxReverseError, maxSeatError, maxScrubError, crewCount: crew.length, maxCrewPositionError, maxCrewIsolationError, worstContact, endpoints }
    fs.writeFileSync(path.join(output, 'carrier_runtime_verification.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    assert.ok(maxContactError < .001, `In-between foot target error ${maxContactError}`)
    assert.ok(maxPlantedError < .001, `Planted foot target error ${maxPlantedError}`)
    assert.ok(maxHandholdError < .02, `Handhold target error ${maxHandholdError}`)
    assert.ok(maxReverseError < .0001, `Reverse pose mismatch ${maxReverseError}`)
    assert.ok(maxSeatError < .0001, `Seated pose mismatch ${maxSeatError}`)
    assert.ok(maxScrubError < .0001, `Scrub pose mismatch ${maxScrubError}`)
    assert.ok(maxCrewPositionError < .0001, `Simultaneous crew placement error ${maxCrewPositionError}`)
    assert.ok(maxCrewIsolationError < .0001, `Another occupant moved during selected boarding ${maxCrewIsolationError}`)
    console.log('CARRIER_NATIVE_PLAYBACK_PASS')
  } finally { asset.dispose(); scene.dispose(); engine.dispose() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
