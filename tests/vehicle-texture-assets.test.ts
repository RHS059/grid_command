import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { crc32, inflateSync } from 'node:zlib'

const root = new URL('../', import.meta.url)
const models = new URL('public/models/', root)
const tracked = new Set(execFileSync('git', ['ls-files', '-z', '--', 'public/models'], { cwd: fileURLToPath(root), encoding: 'utf8' }).split('\0'))

function pngPayload(bytes: Buffer, label: string) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${label}: PNG signature`)
  const compressed: Buffer[] = []
  let offset = 8, ended = false
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    assert.ok(end <= bytes.length, `${label}: complete ${type} chunk at ${offset}`)
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4), `${label}: ${type} checksum at ${offset}`)
    if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, end - 4))
    offset = end
    if (type === 'IEND') { ended = true; break }
  }
  assert.ok(ended, `${label}: complete PNG end marker`)
  assert.equal(offset, bytes.length, `${label}: no trailing or missing PNG bytes`)
  // A valid header alone does not prove that browsers can decode the atlas.
  // The previous upload retained the header and tail while losing the middle.
  const pixels = inflateSync(Buffer.concat(compressed))
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  assert.equal(bytes[28], 0, `${label}: the model texture is exported without interlacing`)
  const rowBytes = Math.ceil(bytes.readUInt32BE(16) * channels[bytes[25]] * bytes[24] / 8)
  assert.equal(pixels.length, (rowBytes + 1) * bytes.readUInt32BE(20), `${label}: complete decoded image`)
}

test('every generated vehicle atlas is included in the tracked public assets', () => {
  const required = new Set<string>()
  const generated = new URL('lib/game/generated/', root)
  for (const filename of readdirSync(generated).filter(name => name.endsWith('.json'))) {
    const asset = JSON.parse(readFileSync(new URL(filename, generated), 'utf8'))
    for (const part of Object.values(asset) as { texture?: string }[]) {
      if (part?.texture) required.add(`public${part.texture}`)
    }
  }
  assert.ok(required.has('public/models/stryker_albedo.png'))
  assert.ok(required.has('public/models/cas_albedo.png'))
  for (const path of required) {
    assert.ok(tracked.has(path), `${path} must be committed with the model that requests it`)
    pngPayload(readFileSync(new URL(path, root)), path)
  }
})

test('published vehicle PNGs have complete chunks, checksums and pixel payloads', () => {
  for (const filename of readdirSync(models).filter(name => name.endsWith('.png'))) {
    const path = `public/models/${filename}`
    assert.ok(tracked.has(path), `${path} must be included in the deployment`)
    pngPayload(readFileSync(new URL(filename, models)), path)
  }
})

test('published vehicle GLBs retain their complete geometry and embedded textures', () => {
  for (const filename of readdirSync(models).filter(name => name.endsWith('.glb'))) {
    const bytes = readFileSync(new URL(filename, models))
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${filename}: GLB signature`)
    assert.equal(bytes.readUInt32LE(4), 2, `${filename}: GLB version`)
    assert.equal(bytes.readUInt32LE(8), bytes.length, `${filename}: complete declared file length`)
    let offset = 12, document: { buffers?: { byteLength: number }[]; bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[]; images?: { mimeType?: string; bufferView?: number }[] } | undefined
    let binary: Buffer | undefined
    while (offset + 8 <= bytes.length) {
      const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4), end = offset + 8 + length
      assert.equal(length % 4, 0, `${filename}: aligned chunk`)
      assert.ok(end <= bytes.length, `${filename}: complete chunk at ${offset}`)
      if (type === 0x4e4f534a) document = JSON.parse(bytes.toString('utf8', offset + 8, end))
      if (type === 0x004e4942) binary = bytes.subarray(offset + 8, end)
      offset = end
    }
    assert.equal(offset, bytes.length, `${filename}: complete chunk layout`)
    assert.ok(document && binary, `${filename}: JSON and binary chunks`)
    assert.ok(document.buffers?.[0].byteLength! <= binary.length, `${filename}: complete binary buffer`)
    for (const view of document.bufferViews || []) {
      assert.equal(view.buffer, 0, `${filename}: embedded buffer`)
      assert.ok((view.byteOffset || 0) + view.byteLength <= binary.length, `${filename}: complete buffer view`)
    }
    for (const [index, image] of (document.images || []).entries()) {
      if (image.mimeType !== 'image/png' || image.bufferView === undefined) continue
      const view = document.bufferViews![image.bufferView], start = view.byteOffset || 0
      pngPayload(binary.subarray(start, start + view.byteLength), `${filename}: embedded PNG ${index}`)
    }
  }
})
