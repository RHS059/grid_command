import type { Graphics } from './types'

// Apply temporary overrides without losing the user's normal graphics choices.
export function effectiveGraphics(graphics: Graphics): Graphics {
  if (!graphics.performanceMode) return { ...graphics, buildings: false }
  return { ...graphics, quality: 'performance', buildings: false, shadows: false, labels: false, routes: false, grid: false }
}
