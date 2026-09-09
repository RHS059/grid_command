import * as T from './scene-data'

/** Blender's Smooth by Angle default: faces meeting at this angle or less are smoothed. */
export const SMOOTH_ANGLE_DEGREES = 30

/**
 * Angle-weighted vertex normals, equivalent to Blender's "Shade Auto Smooth" at 30 degrees:
 * two adjacent faces share a smooth normal when the angle between their face normals is
 * within the threshold, and keep separate normals when it is sharper. This is not global
 * flat shading, and it is not "average every face touching this position" either — normals
 * are averaged only across fans that are actually connected by smooth edges, so a hull and
 * a coincident marking, or two disconnected shells, never bleed into each other.
 *
 * Operates on local-space triangle data and returns the same geometry with a fresh normal
 * attribute. Indexed input is converted to non-indexed first, which is how these procedural
 * builders already store geometry and gives the vertex split a sharp edge requires.
 */
export function computeAngleNormals(geometry: T.BufferGeometry, angleDegrees = SMOOTH_ANGLE_DEGREES) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry
  const positions = source.getAttribute('position')
  if (!positions || positions.count < 3) return source
  const corners = positions.count - positions.count % 3, faceCount = corners / 3
  const normals = new Float32Array(positions.count * 3)

  // Welding tolerance scales with the geometry so quantised vehicle parts and metre-scale
  // procedural parts both match real shared vertices without merging distinct ones.
  let extent = 0
  for (let i = 0; i < corners; i++) extent = Math.max(extent, Math.abs(positions.getX(i)), Math.abs(positions.getY(i)), Math.abs(positions.getZ(i)))
  const tolerance = Math.max(extent * 1e-5, 1e-9)
  const welded = new Int32Array(corners), byKey = new Map<string, number>()
  for (let i = 0; i < corners; i++) {
    const key = `${Math.round(positions.getX(i) / tolerance)}:${Math.round(positions.getY(i) / tolerance)}:${Math.round(positions.getZ(i) / tolerance)}`
    let id = byKey.get(key)
    if (id === undefined) { id = byKey.size; byKey.set(key, id) }
    welded[i] = id
  }

  // Face normals, scaled by area so large faces dominate a fan the way they should.
  const faceNormals = new Float32Array(faceCount * 3), faceAreas = new Float32Array(faceCount)
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3()
  for (let face = 0; face < faceCount; face++) {
    a.fromBufferAttribute(positions, face * 3)
    b.fromBufferAttribute(positions, face * 3 + 1).sub(a)
    c.fromBufferAttribute(positions, face * 3 + 2).sub(a)
    const cross = new T.Vector3().crossVectors(b, c), length = cross.length()
    faceAreas[face] = length / 2
    if (length > 1e-12) { cross.divideScalar(length); faceNormals.set([cross.x, cross.y, cross.z], face * 3) }
  }

  // Undirected edges keyed by their two welded endpoints: matching positions alone is not
  // enough, the same edge has to be shared for two faces to count as adjacent.
  const edges = new Map<string, number[]>()
  for (let face = 0; face < faceCount; face++) for (let edge = 0; edge < 3; edge++) {
    const first = welded[face * 3 + edge], second = welded[face * 3 + (edge + 1) % 3]
    if (first === second) continue
    const key = first < second ? `${first}:${second}` : `${second}:${first}`
    const shared = edges.get(key)
    if (shared) shared.push(face); else edges.set(key, [face])
  }

  // Union-find over corners; only smooth edges join two corners into one fan.
  const parent = new Int32Array(corners)
  for (let i = 0; i < corners; i++) parent[i] = i
  const find = (index: number): number => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index] } return index }
  const union = (left: number, right: number) => { const l = find(left), r = find(right); if (l !== r) parent[r] = l }
  const cornerOf = (face: number, vertex: number) => {
    for (let edge = 0; edge < 3; edge++) if (welded[face * 3 + edge] === vertex) return face * 3 + edge
    return -1
  }
  const limit = Math.cos(angleDegrees * Math.PI / 180) - 1e-6
  for (const [key, shared] of edges) {
    // Boundary (one face) and non-manifold (three or more) edges stay hard.
    if (shared.length !== 2) continue
    const [first, second] = shared
    if (faceAreas[first] <= 0 || faceAreas[second] <= 0) continue
    const dot = faceNormals[first * 3] * faceNormals[second * 3] + faceNormals[first * 3 + 1] * faceNormals[second * 3 + 1] + faceNormals[first * 3 + 2] * faceNormals[second * 3 + 2]
    if (dot < limit) continue
    for (const vertex of key.split(':').map(Number)) {
      const left = cornerOf(first, vertex), right = cornerOf(second, vertex)
      if (left >= 0 && right >= 0) union(left, right)
    }
  }

  const fans = new Map<number, [number, number, number]>()
  for (let corner = 0; corner < corners; corner++) {
    const face = Math.floor(corner / 3), root = find(corner), area = faceAreas[face]
    const total = fans.get(root) || [0, 0, 0]
    total[0] += faceNormals[face * 3] * area; total[1] += faceNormals[face * 3 + 1] * area; total[2] += faceNormals[face * 3 + 2] * area
    fans.set(root, total)
  }
  for (let corner = 0; corner < corners; corner++) {
    const total = fans.get(find(corner))!, length = Math.hypot(total[0], total[1], total[2])
    const face = Math.floor(corner / 3)
    // A fan that cancels itself out (degenerate or opposed input) falls back to its own face.
    if (length > 1e-12) normals.set([total[0] / length, total[1] / length, total[2] / length], corner * 3)
    else normals.set([faceNormals[face * 3], faceNormals[face * 3 + 1], faceNormals[face * 3 + 2]], corner * 3)
  }
  source.setAttribute('normal', new T.BufferAttribute(normals, 3))
  return source
}
