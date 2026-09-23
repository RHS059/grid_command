import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

for (const kind of ['commander', 'logistics', 'soldier']) test(`${kind} clips bind to the supplied model and ship to both engines`, () => {
  const model = readFileSync(`public/models/${kind}.glb`)
  const gltf = JSON.parse(model.subarray(20, 20 + model.readUInt32LE(12)).toString())
  const names = new Set(gltf.nodes.map((node: { name: string }) => node.name))
  const browser = readFileSync(`public/animations/personnel/${kind}.json`)
  const native = readFileSync(`godot/assets/animations/personnel/${kind}.json`)
  assert.deepEqual(browser, native)
  const bundle = JSON.parse(browser.toString())
  for (const required of ['walk', 'idle_ready', 'fire', 'downed', 'dead']) assert(bundle.clips.some((clip: { name: string }) => clip.name === required))
  for (const clip of bundle.clips) for (const track of clip.tracks) {
    assert(names.has(track.target), `${kind}/${clip.name}: unknown ${track.target}`)
    assert.equal(track.rotation.length, clip.times.length)
    assert.equal(track.position.length, clip.times.length)
    for (const quaternion of track.rotation) assert(Math.abs(Math.hypot(...quaternion) - 1) < 0.00001)
  }
  const death = bundle.clips.find((clip: { name: string }) => clip.name === 'dead')
  assert.equal(death.loop, false)
  if (kind === 'soldier') {
    assert.equal(bundle.mode, 'rigid-fallback')
    assert(bundle.clips.every((clip: { tracks: { type: string }[] }) => clip.tracks.every(track => track.type === 'node')))
  } else {
    assert.equal(bundle.mode, 'skeletal')
    const walk = bundle.clips.find((clip: { name: string }) => clip.name === 'walk')
    const leg = walk.tracks.find((track: { target: string }) => track.target === (kind === 'commander' ? 'Bone_016' : 'Bone_008'))
    assert(new Set(leg.rotation.map((quaternion: number[]) => quaternion.join(','))).size > 4)
  }
})

