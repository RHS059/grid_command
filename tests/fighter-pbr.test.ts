import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import manifest from '../assets/blender/vehicles/fighter_pbr_manifest.json'

const root = new URL('../', import.meta.url)

test('FQ-44 PBR maps are aligned 1024 non-color textures with locked hashes', () => {
  assert.deepEqual(manifest.resolution, [1024, 1024])
  assert.deepEqual(manifest.orm_channels, { r: 'ambient_occlusion', g: 'roughness', b: 'metalness' })
  assert.equal(manifest.normal_convention, 'OpenGL +Y')
  for (const [name, entry] of Object.entries(manifest.maps)) {
    const png = readFileSync(new URL(entry.path, root))
    assert.equal(png.subarray(1, 4).toString(), 'PNG', `${name} is a PNG`)
    assert.equal(png.readUInt32BE(16), 1024, `${name} width`)
    assert.equal(png.readUInt32BE(20), 1024, `${name} height`)
    assert.equal(createHash('sha256').update(png).digest('hex'), entry.sha256, `${name} hash`)
    assert.equal(entry.color_space, 'non-color')
  }
})
