import { createMobYard } from './mob-models'
import { MOB_YARD } from './mob'
import * as T from './scene-data'
import { mergeGeometries } from './scene-data'
import { computeAngleNormals } from './geometry-normals'
import { SIDE_COLOR, type AirfieldTier, type Point, type Side } from './types'
import { RUNWAY } from './theater'
import { airfieldPlatform, installationFootprint, type InstallationBounds } from './installation-footprints'
export { airfieldPlatform } from './installation-footprints'

export type BaseKind = 'MOB' | 'AIRFIELD'
export type BaseElevation = { high: number; low: number }
export type BaseGrounding = { model: T.Group; point: Point; elevation?: BaseElevation; terrainRevision?: number }
export const BASE_GRADE_CLEARANCE=.1
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
    b(MOB_YARD.halfWidth*2,MOB_YARD.maxY-MOB_YARD.minY,.35,0,(MOB_YARD.maxY+MOB_YARD.minY)/2,-.175,2)
    root.add(createMobYard(tier,side))
    shelter(-16, -13, 27, 17, 7)
    for (let i = 0; i < 5; i++) b(2.3, .18, 1.6, -26 + i * 4.8, -21.6, 4, 4)
    b(5, 4, 1.4, -23, -14, 7.8, 1); b(5, 4, 1.4, -13, -14, 7.8, 1)
    shelter(23, -17, 15, 22, 5)
    for (let i = 0; i < 4; i++) { b(2, 2, 1.8, -25 + i * 3, 22, .9); b(2.1, 2.1, .12, -25 + i * 3, 22, 1.8, 1) }
    pole(.3, 22, -34, -23); pole(.12, 14, -31, -23)
    for (let i = 0; i < 4; i++) { b(5, .15, .15, -34, -23, 14 + i * 2); b(.15, 4, .15, -34, -23, 14 + i * 2) }
    const dish = new T.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3).toNonIndexed(); dish.rotateX(Math.PI / 3); put(dish, -31, -23, 13, 2)
    for (let x = -72; x <= 72; x += 8) { b(7, 1.2, 1.6, x, MOB_YARD.minY + 2, .8, 2); if (x < 48) b(7, 1.2, 1.6, x, MOB_YARD.maxY - 2, .8, 2) }
    for (const x of [-MOB_YARD.halfWidth + 2, MOB_YARD.halfWidth - 2]) for (let y = MOB_YARD.minY + 10; y <= MOB_YARD.maxY - 10; y += 8) b(1.2, 7, 1.6, x, y, .8, 2)
    pole(.12, 10, -9, 24); b(3, .08, 1.6, -7.5, 24, 9, 3)
    b(14, 1, .05, 0, 29, .04, 1)
  } else {
    const platform = airfieldPlatform(tier)
    b(platform.width, platform.depth, .45, platform.x, 0, -.225, 2)
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

export function conformBase(root: T.Group, elevation?: (x: number, y: number) => number | undefined, locked?: BaseElevation) {
  const footprint = installationFootprint(root.name as BaseKind, root.userData.tier as AirfieldTier)
  let high = locked?.high ?? -Infinity, low = locked?.low ?? Infinity
  if (!locked) {
    if (!elevation) return undefined
    for (let column = 0; column <= 10; column++) for (let row = 0; row <= 24; row++) {
      const x = footprint.minX + (footprint.maxX - footprint.minX) * column / 10, y = footprint.minY + (footprint.maxY - footprint.minY) * row / 24
      const height = elevation(x, y)
      if (height === undefined || !Number.isFinite(height)) return undefined
      high = Math.max(high, height); low = Math.min(low, height)
    }
  }
  const deck=high+BASE_GRADE_CLEARANCE
  root.userData.platformHeight=deck
  // A level graded platform keeps runway paint and roofs coplanar; its skirt extends down to the sampled terrain.
  root.traverse(o => {
    if (!(o instanceof T.Mesh)||o.userData.skipTerrainConform) return
    const p = o.geometry.getAttribute('position')
    const original: Float32Array = o.userData.originalPositions ||= new Float32Array(p.array)
    for (let i = 0; i < p.count; i++) p.setZ(i, original[i * 3 + 2] + (original[i * 3 + 2] < -.3 ? low - 2 : deck))
    // A rigid height shift does not change a normal. Rebuild only the skirt faces.
    const skirtCorners: number[] = [], skirtPositions: number[] = []
    for (let i = 0; i < p.count; i += 3) {
      const below = [0, 1, 2].map(corner => original[(i + corner) * 3 + 2] < -.3)
      if (below.every(value => value === below[0])) continue
      for (let corner = i; corner < i + 3; corner++) {
        skirtCorners.push(corner); skirtPositions.push(p.getX(corner), p.getY(corner), p.getZ(corner))
      }
    }
    if (skirtCorners.length) {
      const skirt = computeAngleNormals(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(skirtPositions, 3)))
      const rebuilt = skirt.getAttribute('normal'), normals = o.geometry.getAttribute('normal')
      for (let i = 0; i < skirtCorners.length; i++) normals.setXYZ(skirtCorners[i], rebuilt.getX(i), rebuilt.getY(i), rebuilt.getZ(i))
      normals.needsUpdate = true; skirt.dispose()
    }
    p.needsUpdate = true; o.geometry.computeBoundingSphere()
  })
  return { high, low }
}

export const baseSurfaceElevation=(kind:BaseKind,elevation:BaseElevation)=>elevation.high+BASE_GRADE_CLEARANCE+(kind==='AIRFIELD'?.08:0)

export function groundBase(base: BaseGrounding, terrain: boolean, revision: number, rangeAt: (bounds: InstallationBounds) => BaseElevation | undefined) {
  const { model, point } = base, kind = model.name as BaseKind
  // A replacement terrain tile can change the highest point below the base.
  if (terrain && base.terrainRevision !== revision) {
    const range = rangeAt(installationFootprint(kind, 3, point))
    if (range) {
      if (!base.elevation || base.elevation.high !== range.high || base.elevation.low !== range.low) {
        base.elevation = conformBase(model, undefined, range)
        model.userData.elevationMode = 'locked'
      }
      base.terrainRevision = revision
    }
  }
  if (terrain && base.elevation && model.userData.elevationMode !== 'locked') {
    conformBase(model, undefined, base.elevation); model.userData.elevationMode = 'locked'
  } else if (!terrain && model.userData.elevationMode !== 'flat') {
    conformBase(model, undefined, { high: 0, low: 0 }); model.userData.elevationMode = 'flat'
  }
}

