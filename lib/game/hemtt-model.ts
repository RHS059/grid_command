import * as T from './scene-data'
import { mergeGeometries } from './scene-data'
import { shell, rod as rodGeometry } from './model-geometry'
import { createCargoContainer } from './container-model'
import { truckContainerPose } from './mob'
import { createInteriorWindowMaterial } from './interior-window-material'
import { ATLAS_URL, TIRE_URL, paletteTexture, ramp, shade, hex, type RGB } from './ps2-textures'
import type { Side } from './types'

/** Browser port of godot/scripts/browser_support_models.gd: one base HEMTT with
 * bolt-on rear bodies, palette-swapped grey textures and interior-mapped cab glass. */
export const HEMTT_VARIANTS = ['FUEL_TRUCK', 'TROOP_HEMTT', 'MEDICAL_HEMTT', 'REPAIR_HEMTT', 'FOB_HEMTT'] as const
export type HemttVariant = typeof HEMTT_VARIANTS[number]
export const isHemttVariant = (id: string): id is HemttVariant => (HEMTT_VARIANTS as readonly string[]).includes(id)

type V3 = [number, number, number]
const ATLAS_TILES: Record<string, [number, number, number, number]> = { '#73765a': [0, 0, .5, .5], '#262c29': [.5, 0, .5, .5], '#565f51': [0, .5, .5, .5], '#66654a': [.5, .5, .5, .5] }
/** BLU leans tan / flat dark earth, RED leans deeper pine. */
const TEAM_PALETTES: Record<Side, Record<string, string>> = {
  BLU: { '#73765a': '#78725a', '#262c29': '#2a2b26', '#565f51': '#5a5c4e', '#66654a': '#6b6749' },
  RED: { '#73765a': '#5f6c50', '#262c29': '#232b26', '#565f51': '#4f5a4c', '#66654a': '#5d6345' },
}
const MARK: Record<Side, string> = { BLU: '#54b7ff', RED: '#ee777b' }
const RUBBER: [RGB, RGB, RGB] = [[.05, .055, .06], [.14, .157, .165], [.3, .3, .28]]
const TILES_PER_UNIT = .22

/** Palette colours use their atlas tile; any other colour ramps the body tile. The
 * material shows its flat base colour until the colourised tile is ready. */
function surface(color: string, side: Side, roughness: number, metalness: number) {
  const base = TEAM_PALETTES[side][color] || color, colors = ramp(hex(base))
  const material = new T.MeshStandardMaterial({ name: 'ps2-surface', color: base, roughness, metalness, uniforms: { baseColor: { value: new T.Color(base) } } })
  paletteTexture(ATLAS_URL, ATLAS_TILES[color] || ATLAS_TILES['#73765a'], base, v => shade(colors, v)).then(url => { material.map = url; material.color.set('#ffffff') }, () => {})
  return material
}
/** Shared tire sheet: neutral rubber ramp, rim (alpha mask) in the team body colour. */
function tireMaterial(side: Side) {
  const rim = ramp(hex(TEAM_PALETTES[side]['#73765a']).map(v => v * .88) as RGB)
  const material = new T.MeshStandardMaterial({ name: 'ps2-tire', color: '#2a2d2f', roughness: .9, uniforms: { baseColor: { value: new T.Color('#2a2d2f') } } })
  paletteTexture(TIRE_URL, [0, 0, 1, 1], `tire:${side}`, (v, a) => shade(a >= .5 ? rim : RUBBER, v)).then(url => { material.map = url; material.color.set('#ffffff') }, () => {})
  return material
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const toSrgb = (v: number) => v <= .0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - .055
/** Planar UVs from each vertex's dominant normal axis, plus underside and ground grime
 * as vertex colour (stored sRGB so the runtime's linear conversion yields the factor). */
function paint(g: T.BufferGeometry, lift: number) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), color = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), nz = n.getZ(i)
    const [u, v] = ax >= ay && ax >= Math.abs(nz) ? [y, z] : ay >= Math.abs(nz) ? [x, z] : [x, y]
    uv[i * 2] = u * TILES_PER_UNIT; uv[i * 2 + 1] = v * TILES_PER_UNIT
    const s = toSrgb((.62 + .38 * smooth(-.8, .2, nz)) * (.72 + .28 * smooth(.35, 1.7, z + lift)))
    color[i * 3] = color[i * 3 + 1] = color[i * 3 + 2] = s
  }
  g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setAttribute('color', new T.BufferAttribute(color, 3))
}

/** Tire carcass along X with Godot CylinderMesh UVs: tread band v 0..0.5, faces
 * centred at (0.25, 0.75) and (0.75, 0.75). Counterclockwise outward faces. */
function tireGeometry(x0: number, x1: number, y: number, z: number, r: number, segments = 24) {
  const position: number[] = [], normal: number[] = [], uv: number[] = []
  const push = (p: V3, nrm: V3, t: [number, number]) => { position.push(...p); normal.push(...nrm); uv.push(...t) }
  for (let i = 0; i < segments; i++) {
    const a0 = i / segments * Math.PI * 2, a1 = (i + 1) / segments * Math.PI * 2
    const at = (x: number, a: number): V3 => [x, y + Math.cos(a) * r, z + Math.sin(a) * r], out = (a: number): V3 => [0, Math.cos(a), Math.sin(a)]
    const u0 = i / segments, u1 = (i + 1) / segments
    push(at(x0, a0), out(a0), [u0, .5]); push(at(x0, a1), out(a1), [u1, .5]); push(at(x1, a1), out(a1), [u1, 0])
    push(at(x0, a0), out(a0), [u0, .5]); push(at(x1, a1), out(a1), [u1, 0]); push(at(x1, a0), out(a0), [u0, 0])
    const face = (cx: number): [number, number][] => [[cx, .75], [cx + Math.cos(a0) * .25, .75 + Math.sin(a0) * .25], [cx + Math.cos(a1) * .25, .75 + Math.sin(a1) * .25]]
    const outer = face(.25), inner = face(.75)
    push([x1, y, z], [1, 0, 0], outer[0]); push(at(x1, a0), [1, 0, 0], outer[1]); push(at(x1, a1), [1, 0, 0], outer[2])
    push([x0, y, z], [-1, 0, 0], inner[0]); push(at(x0, a1), [-1, 0, 0], inner[2]); push(at(x0, a0), [-1, 0, 0], inner[1])
  }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(position, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(normal, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  return g
}

/** Collects stationary parts per material and merges them into one mesh each. */
class Parts {
  private groups = new Map<T.Material, T.BufferGeometry[]>()
  constructor(readonly node: T.Object3D, private lift = 0) {}
  add(g: T.BufferGeometry, m: T.Material) { g.deleteAttribute('color'); const list = this.groups.get(m); if (list) list.push(g); else this.groups.set(m, [g]) }
  box(w: number, d: number, h: number, x: number, y: number, z: number, m: T.Material, turn?: (g: T.BufferGeometry) => void) { const g = new T.BoxGeometry(w, d, h).toNonIndexed(); turn?.(g); g.translate(x, y, z); this.add(g, m) }
  rod(a: V3, b: V3, r: number, m: T.Material, sides = 6) { this.add(rodGeometry(a, b, r, '#ffffff', sides), m) }
  ellipse(x: number, y: number, z: number, length: number, rx: number, rz: number, m: T.Material) { const g = new T.CylinderGeometry(1, 1, 1, 20).toNonIndexed(); g.scale(rx, length, rz); g.translate(x, y, z); this.add(g, m) }
  finish() {
    for (const [m, list] of this.groups) {
      const g = mergeGeometries(list); list.forEach(p => p.dispose())
      if (m.name === 'ps2-surface') paint(g, this.lift)
      this.node.add(new T.Mesh(g, m))
    }
  }
}

export function createHemtt(role: 'TRUCK' | HemttVariant, side: Side) {
  const root = new T.Group(); root.name = role; root.userData.unitSurface = true
  const cache = new Map<string, T.Material>(), materials: T.Material[] = []
  const m = (color: string, roughness: number, metalness = .05) => { const key = `${color}:${roughness}:${metalness}`; let result = cache.get(key); if (!result) { result = surface(color, side, roughness, metalness); cache.set(key, result); materials.push(result) } return result }
  const body = m('#73765a', .9), dark = m('#262c29', .9), metal = m('#565f51', .8, .15), glass = m('#293e4c', .15, .6), mark = m(MARK[side], .85), tire = tireMaterial(side)
  materials.push(tire); root.userData.materials = materials
  const P = new Parts(root)
  const pane = (x: number, y: number, z: number, w: number, h: number, rotation: V3, type: number) => {
    const g = new T.PlaneGeometry(w, h); g.rotateX(Math.PI / 2)
    const glassMaterial = createInteriorWindowMaterial('#35596b', false, { type, span: 1, offset: 0, seed: .5 }); materials.push(glassMaterial)
    const o = new T.Mesh(g, glassMaterial); o.position.set(x, y, z); o.rotation.set(...rotation); root.add(o)
  }
  const wheel = (x: number, y: number, z: number, r: number) => {
    // Textured carcass, raised chevron tread blocks, protruding hub and CTIS cap.
    const out = Math.sign(x) || 1, width = .34
    P.add(tireGeometry(x - width * .5, x + width * .5, y, z, r * .93), tire)
    P.add(tireGeometry(x - width * .38, x + width * .38, y, z, r * .97), tire)
    for (let i = 0; i < 22; i++) for (const lane of [-1, 1]) {
      const a = Math.PI * 2 * (i + (lane > 0 ? .5 : 0)) / 22
      P.box(width * .44, .15, .07, x + lane * width * .24, y + Math.sin(a) * r * .97, z + Math.cos(a) * r * .97, dark, g => { g.rotateZ(lane * .35); g.rotateX(-a) })
    }
    const face = x + out * width * .5
    P.rod([face, y, z], [face + out * .06, y, z], r * .22, metal, 12)
    P.rod([face + out * .06, y, z], [face + out * .1, y, z], r * .09, dark, 8)
  }

  // Base HEMTT: cab, chassis, wheels and bare deck. Rear bodies attach below.
  P.box(2.45, 9.2, .28, 0, -.25, .95, dark); P.box(2.6, 5.4, .18, 0, -1.9, 1.38, metal)
  P.add(shell([{ z: 1.1, w: 2.15, d: 2.2, y: 3.05 }, { z: 1.7, w: 2.65, d: 2.65, y: 3.1 }, { z: 3.05, w: 2.5, d: 1.85, y: 2.9 }, { z: 3.2, w: 2.25, d: 1.65, y: 2.86 }], '#ffffff'), body)
  for (const x of [-.52, .52]) pane(x, 4.057, 2.554, .9, .86, [.418, 0, Math.PI], 11)
  P.box(2.7, .2, .23, 0, 4.43, 1.48, metal); P.box(1.35, .06, .35, 0, 4.33, 1.79, dark)
  for (let i = 0; i < 4; i++) P.box(1.3, .025, .025, 0, 4.37, 1.67 + i * .07, metal)
  for (const s of [-1, 1]) {
    for (const y of [3.1, 1.55, -2.5, -4.1]) { wheel(s * 1.35, y, .7, .69); P.box(.5, 1.5, .1, s * 1.15, y, 1.43, body) }
    pane(s * 1.29, 2.95, 2.48, 1, .7, [0, 0, s * Math.PI / 2], 10)
    P.box(.04, .9, .035, s * 1.29, 2.9, 1.84, metal); P.box(.075, .23, .045, s * 1.32, 2.57, 2, dark); P.box(.38, .62, .1, s * 1.39, 2.58, 1.14, metal)
    P.rod([s * 1.2, 3.35, 2.7], [s * 1.65, 3.5, 2.75], .025, metal); P.box(.09, .27, .4, s * 1.65, 3.5, 2.68, glass)
    for (const x of [s * .95, s * 1.17]) P.box(.17, .045, .18, x, 4.43, 1.83, metal)
    P.box(.05, .6, .18, s * 1.31, 2.65, 1.72, mark)
    P.rod([s * 1.05, -.85, 1.04], [s * 1.05, .55, 1.04], .43, metal, 10)
    for (const y of [-.7, .4]) P.box(.88, .045, .65, s * 1.05, y, 1.03, dark)
    P.box(.08, .65, .55, s * 1.35, -4.55, .75, dark)
  }
  const state = (name: string, visible: boolean) => { const node = new T.Group(); node.name = name; node.visible = visible; root.add(node); return new Parts(node) }
  const bodies = [P]
  if (role === 'TRUCK') {
    const container = createCargoContainer(), pose = truckContainerPose(0)
    container.name = 'truck-container-0'; container.position.set(pose.x, pose.y, pose.z); retexture(container, m('#73765a', .9, .12), pose.z); root.add(container)
    P.box(2.65, .17, .2, 0, -4.83, 1.18, metal)
    P.rod([-.15, 1.15, 2.05], [.15, 1.15, 2.05], .64, dark, 12)
    for (let i = 0; i < 2; i++) {
      const trailer = new T.Group(); trailer.name = `cargo-trailer-${i + 1}`; trailer.position.y = -7 - i * 6.2; trailer.visible = false; root.add(trailer)
      const TP = new Parts(trailer); bodies.push(TP)
      TP.box(.2, 2, .2, 0, 3, .6, metal); TP.box(2.5, 4.8, .3, 0, 0, .8, dark)
      const cargo = createCargoContainer(), z = truckContainerPose(i + 1).z; cargo.name = `truck-container-${i + 1}`; cargo.position.z = z; retexture(cargo, m('#73765a', .9, .12), z); trailer.add(cargo)
      for (const x of [-1.3, 1.3]) for (const y of [-1.3, 1.3]) TP.rod([x - .15, y, .5], [x + .15, y, .5], .5, dark, 16)
    }
  } else if (role === 'FUEL_TRUCK') {
    // M978 fuel servicing body: elliptical tank, rear pump and hose-reel module, catwalk.
    const hazard = m('#a8453a', .8), white = m('#c9c6b4', .85), red = m('#9b2f2a', .6, .1)
    P.ellipse(0, -1.35, 2.4, 3.9, 1.2, .92, body)
    for (const y of [.25, -1.35, -2.95]) { P.ellipse(0, y, 2.4, .09, 1.23, .95, metal); P.box(2.3, .35, .2, 0, y, 1.55, dark) }
    P.box(.75, 3.5, .05, 0, -1.35, 3.34, dark)
    for (const y of [-.45, -2.25]) { P.rod([0, y, 3.3], [0, y, 3.47], .3, metal, 12); P.rod([0, y, 3.47], [0, y, 3.53], .33, dark, 12) }
    for (const x of [-.52, .52]) { P.rod([x, .45, 3.78], [x, -3.15, 3.78], .025, metal); for (const y of [.45, -.75, -1.95, -3.15]) P.rod([x, y, 3.34], [x, y, 3.78], .025, metal) }
    P.box(2.5, 1.2, 1.88, 0, -4, 2.41, body); P.box(2.52, .06, .06, 0, -4, 3.36, metal)
    for (const x of [-.6, .6]) { P.box(1.1, .04, 1.6, x, -4.61, 2.4, metal); P.box(.12, .05, .05, x * .25, -4.64, 2.4, dark) }
    P.box(.03, .05, 1.7, 0, -4.63, 2.4, dark)
    for (const s of [-1, 1]) {
      P.box(.04, .95, 1.5, s * 1.26, -4, 2.4, metal)
      for (let i = 0; i < 4; i++) P.box(.05, .7, .04, s * 1.28, -4, 2.85 - i * .1, dark)
      P.box(.03, .9, .5, s * 1.21, -1.35, 2.45, hazard); P.box(.035, .55, .08, s * 1.215, -1.35, 2.45, white)
      P.rod([s * 1.3, .5, 1.55], [s * 1.3, .5, 2.1], .09, red, 10); P.box(.22, .08, .04, s * 1.26, .5, 1.85, dark)
    }
    P.box(.7, .03, .4, .6, -4.64, 3, hazard)
    for (const x of [-1.05, -.7]) P.rod([x, -4.68, .95], [x, -4.68, 3.36], .03, metal)
    for (let i = 0; i < 8; i++) P.rod([-1.05, -4.68, 1.1 + i * .3], [-.7, -4.68, 1.1 + i * .3], .02, metal)
    P.rod([.9, -4.66, 1.3], [.9, -4.66, 1.75], .06, dark, 8)
  } else if (role === 'TROOP_HEMTT') {
    // Drop-side bed under a canvas cover on bows, rear flap rolled up, tailgate and ladder.
    const canvas = m('#66654a', .95)
    for (const s of [-1, 1]) {
      P.box(.08, 5.1, .55, s * 1.26, -1.95, 1.74, body)
      for (let i = 0; i < 6; i++) P.box(.1, .07, .56, s * 1.28, .5 - i * .98, 1.74, metal)
      P.box(.03, 5, .05, s * 1.295, -1.95, 2.12, dark)
      for (let i = 0; i < 5; i++) P.box(.03, .07, 1.25, s * 1.29, .3 - i * 1.12, 2.66, dark)
    }
    P.box(2.52, .08, 1.9, 0, .58, 2.42, body); P.box(2.56, 5, 1.25, 0, -1.95, 2.66, canvas)
    P.ellipse(0, -1.95, 3.28, 5, 1.28, .38, canvas)
    for (let i = 0; i < 5; i++) P.ellipse(0, .3 - i * 1.12, 3.28, .07, 1.3, .4, dark)
    P.box(2.2, .04, 1.1, 0, -4.46, 2.62, dark); P.rod([-1.15, -4.5, 3.22], [1.15, -4.5, 3.22], .11, canvas, 8)
    for (const s of [-1, 1]) { P.box(.42, .05, .07, s * .78, -4.47, 2.1, metal); P.rod([s * .3, -4.62, .7], [s * .3, -4.62, 1.5], .025, metal) }
    P.box(2.52, .08, .55, 0, -4.52, 1.74, body)
    for (let i = 0; i < 3; i++) P.rod([-.3, -4.62, .8 + i * .25], [.3, -4.62, .8 + i * .25], .02, metal)
  } else if (role === 'MEDICAL_HEMTT') {
    // Shelter with red crosses and roof AC. Deployed: side awning, tent walls, litters, stair.
    const white = m('#c9c6b4', .85), red = m('#a8302a', .8), canvas = m('#66654a', .95)
    const cross = (parts: Parts, center: V3, size: number, facing: V3) => {
      const across = [0, 1, 2].filter(k => !facing[k]), dims = (a: number, b: number) => { const d: V3 = [.035, .035, .035]; d[across[0]] = a; d[across[1]] = b; return d }
      const plate = facing.map(f => f ? .03 : size) as V3, at = center.map((c, k) => c + facing[k] * .006) as V3
      parts.box(...plate, ...center, white); parts.box(...dims(size * .72, size * .22), ...at, red); parts.box(...dims(size * .22, size * .72), ...at, red)
    }
    P.box(2.5, 4.7, 2.25, 0, -2.1, 2.6, body); P.box(2.56, 4.76, .08, 0, -2.1, 3.73, metal)
    for (const x of [-1.26, 1.26]) for (const y of [.25, -4.45]) P.box(.08, .08, 2.25, x, y, 2.6, metal)
    for (const s of [-1, 1]) cross(P, [s * 1.26, -2.1, 2.75], 1.1, [s, 0, 0])
    cross(P, [0, -2.1, 3.78], 1.4, [0, 0, 1]); cross(P, [.6, -4.47, 3], .75, [0, 1, 0])
    P.box(1, .04, 1.9, -.55, -4.47, 2.45, metal); P.box(.05, .05, .2, -.15, -4.5, 2.4, dark)
    P.box(1.2, .35, .7, 0, .42, 3.2, metal)
    for (let i = 0; i < 4; i++) P.box(1, .03, .04, 0, .61, 2.98 + i * .13, dark)
    const D = state('deployed', false); bodies.push(D)
    D.box(2.6, 4.3, .05, 2.55, -2.1, 3.45, canvas, g => { g.rotateY(.18) })
    for (const y of [-.05, -4.15]) { D.box(2.5, .03, 3.05, 2.5, y, 1.72, canvas); D.rod([3.8, y, 0], [3.8, y, 3.2], .03, metal) }
    cross(D, [2.55, -2.1, 3.49], .9, [0, 0, 1])
    for (const y of [-1.2, -3]) { D.box(.6, 1.9, .06, 2.5, y, .55, canvas); for (const dy of [-.85, .85]) D.rod([2.5, y + dy, 0], [2.5, y + dy, .55], .02, metal) }
    for (let i = 0; i < 3; i++) D.box(.9, .3, .05, -.55, -4.75 - i * .28, 1.2 - i * .35, metal)
  } else if (role === 'REPAIR_HEMTT') {
    // M984 wrecker: crane on a pedestal, tool lockers, underlift. Deployed: boom up, outriggers down.
    const yellow = m('#c9a227', .8), amber = m('#e0902a', .4)
    for (const s of [-1, 1]) {
      P.box(.55, 3.3, .85, s * .98, -2.6, 1.9, body)
      for (let i = 0; i < 3; i++) { P.box(.03, .95, .7, s * 1.26, -1.5 - i * 1.1, 1.9, metal); P.box(.04, .2, .05, s * 1.28, -1.5 - i * 1.1, 2.1, dark) }
    }
    P.rod([0, -.1, 1.47], [0, -.1, 2.15], .45, metal, 16); P.box(1, 1, .5, 0, -.1, 2.35, body); P.rod([0, -.1, 2.6], [0, -.1, 2.8], .07, amber, 8)
    P.box(.5, 1, .3, 0, -5, .95, metal); P.box(1.6, .22, .22, 0, -5.45, .95, yellow)
    for (let i = 0; i < 6; i++) P.box(.2, .03, .2, -1.1 + i * .44, -4.94, 1.18, i % 2 ? yellow : dark)
    const S = state('stowed', true); bodies.push(S)
    S.box(.45, 4.3, .45, 0, -2.35, 2.83, body); S.rod([0, -.5, 2.45], [0, -1.6, 2.7], .09, metal, 8); S.box(.3, .25, .4, 0, -4.45, 2.45, dark)
    const D = state('deployed', false); bodies.push(D)
    const pivot = new T.Group(); pivot.name = 'boom-pivot'; pivot.position.set(0, -.1, 2.6); pivot.rotation.x = -.62; D.node.add(pivot)
    const B = new Parts(pivot, 2.6); bodies.push(B)
    B.box(.45, 4.6, .45, 0, -2.3, .2, body); B.box(.36, 1.6, .36, 0, -4.9, .2, metal)
    D.rod([0, -.5, 2.45], [0, -1.35, 3.35], .09, metal, 8); D.rod([0, -3.7, 5.2], [0, -3.7, 2.4], .015, dark, 4); D.box(.3, .25, .4, 0, -3.7, 2.3, dark)
    for (const s of [-1, 1]) { D.box(.9, .22, .22, s * 1.6, -3.9, 1.05, yellow); D.box(.2, .2, .9, s * 2, -3.9, .55, metal); D.box(.6, .6, .08, s * 2, -3.9, .04, dark) }
  } else if (role === 'FOB_HEMTT') {
    // Expandable command shelter, generator, mast and dish. Deployed: expansions, raised mast, camo net.
    const net = m('#4b5638', .95)
    P.box(2.45, 4.3, 2.25, 0, -2.35, 2.6, body); P.box(2.5, 4.35, .08, 0, -2.35, 3.73, metal)
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) P.box(.03, .03, 2.2, s * 1.23, -.4 - i * .9, 2.6, dark)
    P.box(1, .04, 1.9, .5, -4.51, 2.45, metal); P.box(1.9, .5, .8, 0, .5, 1.87, metal)
    for (let i = 0; i < 5; i++) P.box(.04, .52, .6, -.8 + i * .4, .5, 1.87, dark)
    P.rod([.7, .5, 2.27], [.7, .5, 2.7], .05, dark, 6); P.rod([-.9, -4.2, 3.73], [-.9, -4.2, 4.7], .08, metal, 8)
    const S = state('stowed', true); bodies.push(S)
    S.ellipse(.5, -3.3, 3.82, .12, .45, .45, metal)
    const D = state('deployed', false); bodies.push(D)
    for (const s of [-1, 1]) {
      D.box(1.5, 3.9, 2.05, s * 1.97, -2.35, 2.55, body); D.box(1.55, 3.95, .06, s * 1.97, -2.35, 3.6, metal)
      for (const y of [-.5, -4.2]) D.rod([s * 2.62, y, 0], [s * 2.62, y, 1.52], .04, metal)
      D.box(.03, .8, .5, s * 2.73, -1.6, 2.8, dark)
    }
    D.rod([-.9, -4.2, 4.7], [-.9, -4.2, 10.5], .05, metal, 8)
    for (const a of [[-3.5, -1, 0], [2.5, -1, 0], [-.9, -7.5, 0]] as V3[]) D.rod([-.9, -4.2, 9.5], a, .012, dark, 4)
    D.box(.8, .05, .05, -.9, -4.2, 10.3, metal)
    const dish = new T.CylinderGeometry(.55, .2, .18, 16).toNonIndexed(); dish.rotateX(Math.PI / 2); dish.rotateX(.7); dish.translate(.5, -3.3, 4.25); D.add(dish, metal)
    D.rod([.5, -3.3, 3.77], [.5, -3.3, 4.15], .05, metal, 6)
    D.box(7.5, 6, .04, 0, -2.35, 4.35, net)
    for (const x of [-3.6, 3.6]) for (const y of [.5, -5.2]) D.rod([x, y, 0], [x, y, 4.33], .03, metal)
  }
  for (const parts of bodies) parts.finish()
  return root
}

function retexture(container: T.Mesh, material: T.Material, lift: number) {
  (container.material as T.Material).dispose(); container.material = material
  const g = container.geometry; g.deleteAttribute('color'); paint(g, lift)
}
