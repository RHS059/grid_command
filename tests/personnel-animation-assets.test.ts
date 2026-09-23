import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

for (const kind of ['commander', 'logistics', 'soldier']) test(`${kind} clips bind to the supplied model and ship to both engines`, () => {
  const model = readFileSync(`public/models/${kind}.glb`)
  const gltf = JSON.parse(model.subarray(20, 20 + model.readUInt32LE(12)).toString())
  const names = new Set(gltf.nodes.map((node: { name: string }) => node.name))
  const browser = readFileSync(`public/animations/personnel/${kind}.json`)
  const native = readFileSync(`godot/assets/animations/personnel/${kind}.json`)
  assert.deepEqual(browser, native)
  const bundle = JSON.parse(browser.toString())
  assert.equal(bundle.model_sha256, createHash('sha256').update(model).digest('hex'))
  assert(names.has(bundle.equipment.hand), `${kind} must attach equipment to a real hand`)
  for (const required of ['walk', 'idle_ready', 'fire', 'downed', 'dead']) assert(bundle.clips.some((clip: { name: string }) => clip.name === required))
  for (const clip of bundle.clips) for (const track of clip.tracks) {
    assert(names.has(track.target), `${kind}/${clip.name}: unknown ${track.target}`)
    assert.equal(track.rotation.length, clip.times.length)
    assert.equal(track.position.length, clip.times.length)
    for (const quaternion of track.rotation) assert(Math.abs(Math.hypot(...quaternion) - 1) < 0.00001)
  }
  const death = bundle.clips.find((clip: { name: string }) => clip.name === 'dead')
  assert.equal(death.loop, false)
  {
    assert.equal(bundle.mode, 'skeletal')
    const walk = bundle.clips.find((clip: { name: string }) => clip.name === 'walk')
    const leg = walk.tracks.find((track: { target: string }) => track.target === (kind === 'commander' ? 'Bone_016' : 'Bone_008'))
    assert(new Set(leg.rotation.map((quaternion: number[]) => quaternion.join(','))).size > 4)
  }
})

test('infantry and logistics share the humanoid body and rifle stays a separate prop', () => {
  const body = readFileSync('public/models/soldier.glb')
  assert.deepEqual(body, readFileSync('public/models/logistics.glb'))
  assert.deepEqual(body, readFileSync('godot/assets/models/soldier.glb'))
  const rifle = readFileSync('public/models/rifle.glb')
  assert.notDeepEqual(body, rifle)
  assert.deepEqual(rifle, readFileSync('godot/assets/models/rifle.glb'))
  const document = JSON.parse(body.subarray(20, 20 + body.readUInt32LE(12)).toString())
  assert(document.skins[0].joints.length > 50, 'infantry must use the anatomical body rig')
  const weaponDocument = JSON.parse(rifle.subarray(20, 20 + rifle.readUInt32LE(12)).toString())
  const primitive = weaponDocument.meshes[0].primitives[0]
  const position = weaponDocument.accessors[primitive.attributes.POSITION]
  const equipment = JSON.parse(readFileSync('public/animations/personnel/soldier.json','utf8')).equipment
  assert(Math.abs((position.max[0]-position.min[0])*equipment.scale-.82) < .0001, 'rifle must be 0.82 m long')
})

