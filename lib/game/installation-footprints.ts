import { MOB_YARD } from './mob'
import { CITY_AIRBASES, CITY_BASES, RUNWAY } from './theater'
import type { AirfieldTier, Point } from './types'

export type InstallationKind = 'MOB' | 'AIRFIELD'
export type InstallationBounds = { minX: number; maxX: number; minY: number; maxY: number }
export const INSTALLATION_MARGIN = 3
export const airfieldPlatform = (tier: AirfieldTier) => ({ width: tier === 3 ? 240 : 170, depth: RUNWAY.halfLength * 2, x: tier === 3 ? -35 : 0 })

export function installationFootprint(kind: InstallationKind, tier: AirfieldTier, point: Point = { x: 0, y: 0 }, margin = 0): InstallationBounds {
  const platform = airfieldPlatform(tier)
  return kind === 'MOB'
    ? { minX: point.x - MOB_YARD.halfWidth - margin, maxX: point.x + MOB_YARD.halfWidth + margin, minY: point.y + MOB_YARD.minY - margin, maxY: point.y + MOB_YARD.maxY + margin }
    : { minX: point.x + platform.x - platform.width / 2 - margin, maxX: point.x + platform.x + platform.width / 2 + margin, minY: point.y - platform.depth / 2 - margin, maxY: point.y + platform.depth / 2 + margin }
}

// Reserve the full airfield footprint before an upgrade adds its second runway.
export const INSTALLATION_EXCLUSIONS = (['BLU', 'RED'] as const).flatMap(side => [
  installationFootprint('MOB', 3, CITY_BASES[side], INSTALLATION_MARGIN),
  installationFootprint('AIRFIELD', 3, CITY_AIRBASES[side], INSTALLATION_MARGIN),
])
