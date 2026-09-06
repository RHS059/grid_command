import { isVehicle, type BattleState, type Point, type Side } from './types'
import { distance } from './movement'
export function captureBodies(state: BattleState, objective: Point): Record<Side, number> {
  const counts = { BLU: 0, RED: 0 }, counted = new Set<string>()
  for (const u of state.units) {
    if (u.hp <= 0 || u.external || u.carrier || isVehicle(u.role) || ['COMMAND', 'PILOT'].includes(u.role)) continue
    for (const s of u.soldiers || []) {
      if (s.status !== 'active' || counted.has(s.id) || distance(s, objective) > 100) continue
      counted.add(s.id); counts[u.side]++
    }
  }
  return counts
}
