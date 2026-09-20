// Keep the authored GLB self-contained: its albedo must be the published atlas.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'assets/models/tank.glb');
const original = fs.readFileSync(file);
const jsonLength = original.readUInt32LE(12);
const document = JSON.parse(original.subarray(20, 20 + jsonLength));
const binaryOffset = 28 + jsonLength;
const binary = original.subarray(binaryOffset, binaryOffset + original.readUInt32LE(20 + jsonLength));
const atlas = fs.readFileSync(path.join(root, 'assets/models/tank_albedo.png'));
const textureIndex = document.materials[0].pbrMetallicRoughness.baseColorTexture.index;
const image = document.images[document.textures[textureIndex].source];
const view = document.bufferViews[image.bufferView];
const oldImage = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
if (oldImage.equals(atlas)) { console.log('Tank GLB already contains the current atlas.'); process.exit(0); }
// Repack buffer views rather than leave the obsolete atlas in the asset.
const pieces = []; let offset = 0;
for (let i = 0; i < document.bufferViews.length; i++) {
 const v = document.bufferViews[i];
 const bytes = i === image.bufferView ? atlas : binary.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
 v.byteOffset = offset; v.byteLength = bytes.length;
 pieces.push(bytes); offset += bytes.length;
 const padding = (4 - offset % 4) % 4;
 if (padding) { pieces.push(Buffer.alloc(padding)); offset += padding; }
}
document.buffers[0].byteLength = offset;
const text = Buffer.from(JSON.stringify(document));
const json = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
const payload = Buffer.concat(pieces);
const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + payload.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(payload.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(file, Buffer.concat([header, json, binHeader, payload]));
console.log('Embedded current tank albedo:', atlas.length, 'bytes');
