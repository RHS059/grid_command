import { createHash } from 'node:crypto'

export const KINDS = ['ground', 'water', 'roads', 'highways', 'buildings', 'edges'] as const
export type Batch = { positions: number[]; indices: number[]; colors?: number[] }
export type Address = { z: number; x: number; y: number }
export const MAGIC = 'GCGEO001'
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** Bound each GPU upload. Positions are native metres/100: +X east, -Z north. */
export function chunks(batch: Batch, maxIndices = 24576): Batch[] {
  if (batch.indices.length % 3 || batch.positions.length % 3) throw Error('Incomplete triangle/position array')
  const result: Batch[] = []
  for (let first = 0; first < batch.indices.length; first += maxIndices) {
    const output: Batch = { positions: [], indices: [], colors: [] }, remap = new Map<number, number>()
    for (const source of batch.indices.slice(first, first + maxIndices)) {
      if (!Number.isInteger(source) || source < 0 || source * 3 >= batch.positions.length) throw Error('Invalid vertex index')
      let index = remap.get(source)
      if (index === undefined) {
        index = remap.size; remap.set(source, index)
        const [east, north, height] = batch.positions.slice(source * 3, source * 3 + 3)
        if (![east, north, height].every(Number.isFinite)) throw Error('Nonfinite position')
        output.positions.push(east / 100, height / 100, -north / 100)
        if (batch.colors?.length) output.colors!.push(...batch.colors.slice(source * 4, source * 4 + 4))
      }
      output.indices.push(index)
    }
    result.push(output)
  }
  return result
}

export function encodeTile(address: Address, batches: Record<string, Batch>, terrainResolution = 1) {
  const pieces = KINDS.flatMap((kind, role) => chunks(batches[kind] ?? { positions: [], indices: [] }).map(batch => ({ role, ...batch })))
  const bytes = Buffer.alloc(28 + pieces.reduce((n, b) => n + 16 + b.positions.length * 4 + b.indices.length * 4 + (b.colors?.length ?? 0) * 4, 0))
  bytes.write(MAGIC); let offset = 8
  const u32 = (value: number) => { bytes.writeUInt32LE(value, offset); offset += 4 }
  const f32 = (value: number) => { if (!Number.isFinite(value)) throw Error('Nonfinite scalar'); bytes.writeFloatLE(value, offset); offset += 4 }
  u32(address.z); u32(address.x); u32(address.y); u32(pieces.length); u32(terrainResolution)
  for (const piece of pieces) {
    u32(piece.role); u32(piece.positions.length / 3); u32(piece.indices.length); u32(piece.colors?.length ? 1 : 0)
    piece.positions.forEach(f32); piece.indices.forEach(u32); piece.colors?.forEach(f32)
  }
  if (offset !== bytes.length) throw Error('Tile serialization size mismatch')
  return { bytes, pieces: pieces.length, triangles: pieces.reduce((sum, piece) => sum + piece.indices.length / 3, 0) }
}
