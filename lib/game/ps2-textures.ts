/**
 * Palette-swapped PS2-era textures (the browser side of godot/shaders/ps2_*.gdshader).
 * One grey atlas and one grey tire sheet are colourised per team and material through
 * three-colour ramps, Street Fighter style, then handed to materials as texture URLs.
 */
export type RGB = [number, number, number]
export const ATLAS_URL = '/textures/vehicles/hemtt_atlas.png', TIRE_URL = '/textures/vehicles/hemtt_tire.png'

interface Gray { width: number; height: number; channels: number; data: Uint8Array }
const decoded = new Map<string, Promise<Gray>>(), painted = new Map<string, Promise<string>>()

/** 8-bit grey (L or LA) PNG decoder. Canvas readback would premultiply the tire sheet's
 * rim mask and erase the rubber detail stored under alpha 0. */
async function decode(url: string): Promise<Gray> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer()), view = new DataView(bytes.buffer), idat: Uint8Array[] = []
  let offset = 8, width = 0, height = 0, channels = 1
  while (offset < bytes.length) {
    const length = view.getUint32(offset), type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12)
      const depth = bytes[offset + 16], color = bytes[offset + 17]
      if (depth !== 8 || (color !== 0 && color !== 4) || bytes[offset + 20]) throw new Error(`${url}: expected 8-bit grey PNG`)
      channels = color === 4 ? 2 : 1
    } else if (type === 'IDAT') idat.push(bytes.slice(offset + 8, offset + 8 + length))
    else if (type === 'IEND') break
    offset += 12 + length
  }
  const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())
  const stride = width * channels, data = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = y * (stride + 1) + 1, row = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[row + x - channels] : 0, b = y ? data[row - stride + x] : 0, c = x >= channels && y ? data[row - stride + x - channels] : 0
      let predictor = 0
      if (filter === 1) predictor = a
      else if (filter === 2) predictor = b
      else if (filter === 3) predictor = (a + b) >> 1
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      data[row + x] = (raw[line + x] + predictor) & 255
    }
  }
  return { width, height, channels, data }
}

/** Colourise a region (0..1 rect) of a grey PNG: pick(grey, alpha) returns sRGB 0..1. */
export function paletteTexture(url: string, region: [number, number, number, number], key: string, pick: (v: number, a: number) => RGB) {
  const id = `${url}|${region}|${key}`
  let result = painted.get(id)
  if (!result) {
    let source = decoded.get(url)
    if (!source) { source = decode(url); decoded.set(url, source) }
    result = source.then(({ width, height, channels, data }) => {
      const x0 = Math.round(region[0] * width), y0 = Math.round(region[1] * height), w = Math.round(region[2] * width), h = Math.round(region[3] * height)
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
      const context = canvas.getContext('2d')!, image = context.createImageData(w, h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = ((y0 + y) * width + x0 + x) * channels, rgb = pick(data[i] / 255, channels === 2 ? data[i + 1] / 255 : 1), o = (y * w + x) * 4
        image.data.set([rgb[0] * 255, rgb[1] * 255, rgb[2] * 255, 255], o)
      }
      context.putImageData(image, 0, 0)
      return canvas.toDataURL('image/png')
    })
    painted.set(id, result)
  }
  return result
}

export const hex = (value: string): RGB => { const n = parseInt(value.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] }
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
/** Shadow, base and highlight for a base colour: shadows cool, highlights warm. */
export function ramp(mid: RGB): [RGB, RGB, RGB] {
  return [mix(mid.map(v => v * .42) as RGB, hex('#1b2226'), .2), mid, mix(mid.map(v => v + (1 - v) * .3) as RGB, hex('#d8d0a8'), .12)]
}
export const shade = ([dark, mid, light]: [RGB, RGB, RGB], v: number) => v < .5 ? mix(dark, mid, v * 2) : mix(mid, light, v * 2 - 1)
