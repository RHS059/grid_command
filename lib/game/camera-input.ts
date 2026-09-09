export interface OrbitView { bearing: number; pitch: number }

/**
 * Treat a secondary-button drag as grabbing the geographic view: moving the
 * pointer right turns the camera west, and moving it down reduces the tilt.
 */
export function orbitViewFromDrag(view: OrbitView, dx: number, dy: number, maxPitch = 75): OrbitView {
  return {
    bearing: view.bearing - dx * .35,
    pitch: Math.max(0, Math.min(maxPitch, view.pitch - dy * .25)),
  }
}
