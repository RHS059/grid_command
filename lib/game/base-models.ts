import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { SIDE_COLOR, type AirfieldTier, type Side } from './types'
import { RUNWAY } from './theater'

export type BaseKind = 'MOB' | 'AIRFIELD'
export function createBase(kind: BaseKind, side: Side, tier: AirfieldTier = 1) {
  const root = new T.Group(); root.name = kind; root.userData.tier = tier
  const colors = ['#65716a', '#18222b', '#a4afb4', SIDE_COLOR[side], '#293e4c']
  const parts: T.BufferGeometry[][] = colors.map(() => [])
  const put = (g: T.BufferGeometry, x: number, y: number, z: number, material = 0) => { g.translate(x, y, z); parts[material].push(g) }
  const b = (w: number, d: number, h: number, x: number, y: number, z: number, m = 0) => put(new T.BoxGeometry(w, d, h, Math.max(1, Math.ceil(w / 12)), Math.max(1, Math.ceil(d / 12)), 1).toNonIndexed(), x, y, z, m)
  const pole = (radius: number, h: number, x: number, y: number, m = 2) => { const g = new T.CylinderGeometry(radius, radius, h, 12).toNonIndexed(); g.rotateX(Math.PI / 2); put(g, x, y, h / 2, m) }
  const shelter = (x: number, y: number, w: number, d: number, h: number) => {
    b(w, d, h, x, y, h / 2); b(w + .5, d + .5, .4, x, y, h, 2)
    b(w * .78, .15, h * .72, x, y + d / 2 + .1, h * .37, 1)
    for (let i = 0; i < 6; i++) b(.08, .18, h * .7, x - w * .33 + i * w * .13, y + d / 2 + .2, h * .37, 2)
    b(w * .7, .16, .55, x, y + d / 2 + .25, h - .8, 3)
  }
  if (kind === 'MOB') {
    b(82, 70, .35, 0, 0, -.2, 2)
    shelter(-16, -13, 27, 17, 7)
    for (let i = 0; i < 5; i++) b(2.3, .18, 1.6, -26 + i * 4.8, -21.6, 4, 4)
    b(5, 4, 1.4, -23, -14, 7.8, 1); b(5, 4, 1.4, -13, -14, 7.8, 1)
    shelter(23, -17, 15, 22, 5)
    for (let i = 0; i < 3; i++) { b(5, 10, 3, 15 + i * 7, 16, 1.5); for (let j = 0; j < 8; j++) b(.08, 10.1, 2.8, 13 + i * 7 + j * .55, 16, 1.5, 2) }
    for (let i = 0; i < 4; i++) { b(2, 2, 1.8, -25 + i * 3, 22, .9); b(2.1, 2.1, .12, -25 + i * 3, 22, 1.8, 1) }
    pole(.3, 22, -34, -23); pole(.12, 14, -31, -23)
    for (let i = 0; i < 4; i++) { b(5, .15, .15, -34, -23, 14 + i * 2); b(.15, 4, .15, -34, -23, 14 + i * 2) }
    const dish = new T.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3).toNonIndexed(); dish.rotateX(Math.PI / 3); put(dish, -31, -23, 13, 2)
    for (let i = -4; i <= 4; i++) { b(7, 1.2, 1.6, i * 8, -33, .8, 2); if (Math.abs(i) > 1) b(7, 1.2, 1.6, i * 8, 33, .8, 2) }
    for (const x of [-39, 39]) for (let y = -25; y <= 25; y += 8) b(1.2, 7, 1.6, x, y, .8, 2)
    pole(.12, 10, -9, 24); b(3, .08, 1.6, -7.5, 24, 9, 3)
    b(14, 1, .05, 0, 29, .04, 1)
  } else {
    b(170, 420, .45, 0, 0, -.3, 2)
    if (tier === 3) {
      const x = RUNWAY.x - RUNWAY.spacing
      b(32, 1200, .12, x, 0, .02, 1)
      for (let y = -570; y <= 570; y += 27) b(1, 12, .03, x, y, .11, 2)
      for (const sign of [-1, 1]) {
        b(.5, 1180, .03, x + sign * 14, 0, .11, 2)
        for (let i = 0; i < 4; i++) b(1.5, 17, .03, x - 11 + i * 7, sign * 583, .11, 2)
      }
      for (const y of [-160, 140]) b(RUNWAY.spacing, 12, .1, x + RUNWAY.spacing / 2, y, .04, 1)
      for (let y = -175; y <= 175; y += 25) for (const offset of [-17, 17]) b(.6, .6, .25, x + offset, y, .2, 3)
    }
    b(32, 1200, .12, -48, 0, .02, 1)
    b(13, 350, .12, -8, 0, .02, 1)
    b(90, 190, .12, 32, -5, .02, 1)
    for (const y of [-160, 140]) b(40, 12, .1, -30, y, .04, 1)
    for (let y = -570; y <= 570; y += 27) b(1, 12, .03, -48, y, .11, 2)
    for (const sign of [-1, 1]) { b(.5, 1180, .03, -48 + sign * 14, 0, .11, 2); for (let i = 0; i < 4; i++) b(1.5, 17, .03, -59 + i * 7, sign * 583, .11, 2) }
    for (let y = -175; y <= 175; y += 25) for (const x of [-65, -31]) b(.6, .6, .25, x, y, .2, 3)
    shelter(46, -64, 48, 38, 14); shelter(46, 4, 48, 38, 14)
    b(9, 10, 19, 57, 71, 9.5); b(17, 15, 5, 57, 71, 21, 4); b(18, 16, .6, 57, 71, 23.8, 2)
    for (const x of [49, 53, 57, 61, 65]) b(.18, 15.2, 4.8, x, 71, 21, 2)
    pole(.13, 29, 57, 71)
    for (const y of [127, 171]) { b(31, 31, .08, 42, y, .05, 1); b(2, 14, .04, 37, y, .13, 2); b(2, 14, .04, 47, y, .13, 2); b(10, 2, .04, 42, y, .13, 2); const ring = new T.RingGeometry(12, 12.4, 48).toNonIndexed(); put(ring, 42, y, .14, 2) }
    for (let i = 0; i < 3; i++) { pole(4, 7, 23 + i * 18, -165, 2); b(6, 6, .5, 23 + i * 18, -165, 7.2, 0) }
    for (let y = -115; y < 100; y += 45) b(15, .3, .04, 6, y, .12, 2)
  }
  parts.forEach((geometries, i) => { if (!geometries.length) return; const geometry = mergeGeometries(geometries); geometries.forEach(g => g.dispose()); const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: colors[i], roughness: i === 4 ? .2 : .85, metalness: i === 4 ? .7 : .12, side: T.DoubleSide })); mesh.name = `${kind}-${i}`; root.add(mesh) })
  return root
}

export function conformBase(root: T.Group, elevation: (x: number, y: number) => number) {
  const width = root.name === 'MOB' ? 82 : root.userData.tier === 3 ? 240 : 170, depth = root.name === 'MOB' ? 70 : 1200
  const offset = root.name === 'AIRFIELD' && root.userData.tier === 3 ? -35 : 0
  let high = -Infinity, low = Infinity
  for (let x = -width / 2 + offset; x <= width / 2 + offset; x += width / 10) for (let y = -depth / 2; y <= depth / 2; y += depth / 24) {
    const height = elevation(x, y); high = Math.max(high, height); low = Math.min(low, height)
  }
  root.userData.platformHeight=high
  // A level graded platform keeps runway paint and roofs coplanar; its skirt extends down to the sampled terrain.
  root.traverse(o => {
    if (!(o instanceof T.Mesh)) return
    const p = o.geometry.getAttribute('position')
    const original: Float32Array = o.userData.originalPositions ||= new Float32Array(p.array)
    for (let i = 0; i < p.count; i++) p.setZ(i, original[i * 3 + 2] + (original[i * 3 + 2] < -.3 ? low - 2 : high))
    p.needsUpdate = true; o.geometry.computeVertexNormals(); o.geometry.computeBoundingSphere()
  })
}
