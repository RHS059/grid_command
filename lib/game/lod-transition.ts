export const LOD_TRANSITION_MS = 260

const clamp = (value: number) => Math.max(0, Math.min(1, value))

/** A target change keeps the current coverage. Each transition has a time limit. */
export class LodTransition {
  private start = 0
  private from = 1
  private initialized = false
  target = 1
  value = 1

  update(metric: number, threshold: number, hysteresis: number, now: number) {
    if (!this.initialized) {
      this.initialized = true
      this.value = this.from = this.target = metric >= threshold ? 1 : 0
      this.start = now
      return this.value
    }
    const elapsed = clamp((now - this.start) / LOD_TRANSITION_MS)
    const blend = elapsed * elapsed * (3 - 2 * elapsed)
    this.value = this.from + (this.target - this.from) * blend
    const next = this.target ? (metric < threshold - hysteresis ? 0 : 1) : (metric > threshold + hysteresis ? 1 : 0)
    if (next !== this.target) {
      this.start = now
      this.from = this.value
      this.target = next
    }
    return this.value
  }
}

/** The half-open ranges divide every pixel between two LODs. */
export type LodDitherRange = readonly [number, number]
export const lodDitherRange = (detail: number, high: boolean): LodDitherRange => high ? [0, clamp(detail)] : [clamp(detail), 1]

export const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const
export function bayerThreshold(x: number, y: number) {
  return (BAYER_4[((Math.floor(y) % 4 + 4) % 4) * 4 + (Math.floor(x) % 4 + 4) % 4] + .5) / 16
}
export const lodPixelVisible = (range: LodDitherRange, x: number, y: number) => {
  const threshold = bayerThreshold(x, y)
  return threshold >= range[0] && threshold < range[1]
}

export interface ModelLodState { transition: LodTransition; span: number; detail: number }
