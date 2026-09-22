// Synchronize only embedded base-color image bytes. Geometry, UVs, hierarchy,
// animation, materials and all non-albedo buffer views remain byte-identical.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../assets/models');
for (const [name, atlasName] of [
  ['tank', 'tank_albedo_ps2.png'], ['apc', 'stryker_albedo.png'],
  ['apc_lod1', 'stryker_albedo.png'], ['cannon_apc', 'stryker_albedo.png'],
  ['cannon_apc_lod1', 'stryker_albedo.png'],
]) {
  const file = path.join(root, name + '.glb');
  const original = fs.readFileSync(file);
  const jsonLength = original.readUInt32LE(12);
  const doc = JSON.parse(original.subarray(20, 20 + jsonLength));
  const binOffset = 28 + jsonLength;
  const binary = original.subarray(binOffset, binOffset + original.readUInt32LE(20 + jsonLength));
  const atlas = fs.readFileSync(path.join(root, atlasName));
  const albedoViews = new Set();
  for (const material of doc.materials || []) {
    const slot = material.pbrMetallicRoughness?.baseColorTexture;
    if (!slot) continue;
    const image = doc.images[doc.textures[slot.index].source];
    if (image.bufferView !== undefined) albedoViews.add(image.bufferView);
  }
  if (!albedoViews.size) throw new Error(`No embedded albedo: ${name}`);
  const pieces = []; let offset = 0;
  for (let i = 0; i < doc.bufferViews.length; i++) {
    const v = doc.bufferViews[i];
    const old = binary.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const bytes = albedoViews.has(i) ? atlas : old;
    v.byteOffset = offset; v.byteLength = bytes.length;
    pieces.push(bytes); offset += bytes.length;
    const padding = (4 - offset % 4) % 4;
    if (padding) { pieces.push(Buffer.alloc(padding)); offset += padding; }
  }
  doc.buffers[0].byteLength = offset;
  const raw = Buffer.from(JSON.stringify(doc));
  const json = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 32)]);
  const payload = Buffer.concat(pieces);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + payload.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(payload.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([header, json, binHeader, payload]));
  console.log(`${name}: synchronized ${albedoViews.size} base-color image; ${doc.meshes.length} meshes unchanged`);
}

