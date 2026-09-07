import type { BattleState, Point, Soldier, Unit } from './types'
import type { Navigation } from './navigation'

type Mover = Unit | Soldier

// Kept as a stable simulation hook for callers. Unit traffic no longer builds
// collision bodies or performs separation; terrain remains owned by Navigation.
export function beginTraffic(state: BattleState, nav: Navigation) {
  void state; void nav
}

export function moveWithTraffic(mover: Mover, next: Point, nav: Navigation, altitude = 0, reverse = false) {
  void nav; void altitude
  const dx = next.x - mover.x, dy = next.y - mover.y
  if (Math.hypot(dx, dy) > .0001) mover.heading = Math.atan2(dx, dy) + (reverse ? Math.PI : 0)
  mover.x = next.x; mover.y = next.y
  return true
}

