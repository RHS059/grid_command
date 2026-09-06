import { initialState, createUnit, CATALOG, isAir, type Role } from '../lib/game/types'
export function battleFixture() {
  const state = initialState()
  state.nextSupply = { BLU: Infinity, RED: Infinity }
  const roles = ['RIFLE', ...Object.keys(CATALOG).filter(r => r !== 'RIFLE')] as Role[]
  state.units = (['BLU', 'RED'] as const).flatMap(side => roles.map(role => {
    const u = createUnit(side, role, `${side}-${role}`)
    u.fuel = 100; u.ammo = 100; u.servicing = false; u.altitude = isAir(role) ? 95 : 0
    return u
  }))
  return state
}
