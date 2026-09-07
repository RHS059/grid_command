import { BASES, CATALOG, isVehicle, type BattleState, type MissionState, type Point, type Role, type Side } from './types'

export type MobTier = 1 | 2 | 3
export interface MobState { tier: MobTier; upgrade?: { tier: MobTier; due: number } }
export const MOB_TIERS = {
  1: { cranes: 1, troopSpeed: 1, unloadSeconds: 18, vehicleCost: 1, vehicleTime: 1, cost: 0, buildSeconds: 0 },
  2: { cranes: 2, troopSpeed: 1.5, unloadSeconds: 12, vehicleCost: 1, vehicleTime: 1, cost: 4000, buildSeconds: 90 },
  3: { cranes: 3, troopSpeed: 1.5, unloadSeconds: 12, vehicleCost: .75, vehicleTime: .75, cost: 8000, buildSeconds: 150 },
} as const
export const CRANE_CYCLE_SECONDS = MOB_TIERS[1].unloadSeconds
export const CRANE_LATCH = .28
export const CRANE_RELEASE = .9
export const MOB_YARD = { halfWidth: 80, minY: -40, maxY: 140 }
export const mobTier = (state: BattleState, side: Side): MobTier => state.mobs?.[side]?.tier ?? 1
export const mobDock = (slot: number): Point => ({ x: 15 + slot * 7, y: 57 })
export const mobStorage = (slot: number): Point => ({ x: 15 + slot * 7, y: 16 })
export const mobWorld = (side: Side, point: Point): Point => ({ x: BASES[side].x + point.x, y: BASES[side].y + point.y })
export const discountedMobAsset = (role: Role) => ['TANK', 'TRUCK', 'TROOP_TRUCK', 'ATTACK_HELI', 'TRANSPORT_HELI', 'HEAVY_LIFT_HELI'].includes(role)
export function requisitionCost(state: BattleState, side: Side, role: Role) {
  return Math.ceil(CATALOG[role].cost * (discountedMobAsset(role) ? MOB_TIERS[mobTier(state, side)].vehicleCost : 1))
}
export function requisitionDelay(state: BattleState, side: Side, role: Role, baseSeconds: number) {
  const spec = MOB_TIERS[mobTier(state, side)]
  return baseSeconds * (discountedMobAsset(role) ? spec.vehicleTime : !isVehicle(role) ? 1 / spec.troopSpeed : 1)
}
export function startMobUpgrade(state: BattleState, side: Side) {
  state.mobs ??= { BLU: { tier: 1 }, RED: { tier: 1 } }
  const mob = state.mobs[side], force = state.forces[side]
  if (mob.tier === 3 || mob.upgrade) return false
  const tier = (mob.tier + 1) as MobTier, spec = MOB_TIERS[tier]
  if (force.sp < spec.cost + 200) return false
  force.sp -= spec.cost
  mob.upgrade = { tier, due: state.time + spec.buildSeconds }
  force.purchase = `MOB LEVEL ${tier} · ${spec.cost} SP · upgrading`
  return true
}
export function completeMobUpgrades(state: BattleState) {
  for (const side of ['BLU', 'RED'] as const) {
    const mob = state.mobs?.[side]
    if (mob?.upgrade && state.time >= mob.upgrade.due) {
      mob.tier = mob.upgrade.tier; mob.upgrade = undefined
      state.forces[side].purchase = `MOB LEVEL ${mob.tier} ONLINE · ${MOB_TIERS[mob.tier].cranes} cranes`
    }
  }
}
// Shared by simulation and models: camera visibility never advances cargo handling.
export function craneCycle(mission: MissionState, time: number) {
  const count = mission.containerCount ?? 1
  const elapsed = Math.max(0, time - (mission.unloadStarted ?? time))
  const cycles = elapsed / Math.max(.05, mission.unloadSeconds ?? CRANE_CYCLE_SECONDS)
  return { index: Math.min(count - 1, Math.floor(cycles)), progress: cycles >= count ? 1 : cycles % 1, complete: cycles >= count }
}
export function containerOnTruck(mission: MissionState | undefined, index: number, time: number) {
  if (!mission) return true // Model preview.
  const loaded = mission.containerState === 'loaded' || mission.containerState === undefined && (mission.cargo ?? 0) > 0
  if (!loaded || index >= (mission.containerCount ?? 1)) return false
  if (mission.phase !== 'mob-unloading') return index >= (mission.unloadedContainers ?? 0)
  const cycle = craneCycle(mission, time)
  return !cycle.complete && (index > cycle.index || index === cycle.index && cycle.progress < CRANE_LATCH)
}
export const truckContainerPose = (index: number) => ({ x: 0, y: index === 0 ? -1.9 : -7 - (index - 1) * 6.2, z: index === 0 ? 2.7 : 2.2 })

