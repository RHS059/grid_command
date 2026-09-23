import { CATALOG, isAir, isVehicle, type Role } from './types'
import type { BaseKind } from './base-models'
import { HEMTT_VARIANTS, isHemttVariant, type HemttVariant } from './hemtt-model'
export type ModelId = Role | BaseKind | HemttVariant
export const MODEL_NAMES: Record<ModelId, string> = {
  PATROL_BOAT: 'Patrol boat', FRIGATE: 'Missile cruiser', AIRCRAFT_CARRIER: 'Aircraft carrier', LANDING_CRAFT: 'Landing craft', AMPHIBIOUS_APC: 'Amphibious APC',
  FORKLIFT: 'Supply forklift', CARGO_PLANE: 'Tactical cargo plane', UAV_JAMMER: 'UAV jammer', AA_TEAM: 'Anti-air launcher team', TRANSPORT_HELI: 'Troop transport helicopter', HEAVY_LIFT_HELI: 'Heavy-lift helicopter', TROOP_TRUCK: 'Light troop carrier',
  RIFLE: 'Rifle squad', SCOUT: 'Scout team', MG: 'Machine gun team', AT: 'Anti-tank team', MORTAR: 'Mortar team', ENGINEER: 'Combat engineer', MEDIC: 'Combat medic', LOGISTICS: 'Logistics team', TANK: 'Main battle tank', PILOT: 'Pilot', COMMAND: 'Command officer', TRUCK: 'Supply truck', FUEL_TRUCK: 'Fuel HEMTT', TROOP_HEMTT: 'Troop HEMTT', MEDICAL_HEMTT: 'Medical HEMTT', REPAIR_HEMTT: 'Repair HEMTT', FOB_HEMTT: 'FOB HEMTT', RECON_UAV: 'Reconnaissance UAV', APC: 'Armored personnel carrier', CANNON_APC: 'Cannon APC', IFV: 'Infantry fighting vehicle', CAS_FIGHTER: 'CAS fighter', JET: 'FQ-44 Fury strike fighter', ATTACK_HELI: 'Attack helicopter', MOB: 'Main operating base', AIRFIELD: 'Airfield compound',
}
export const MODEL_CATALOG = [...(Object.keys(CATALOG) as Role[]).flatMap(id => id === 'TRUCK' ? [id, ...HEMTT_VARIANTS] : [id]), 'MOB', 'AIRFIELD'] as ModelId[]
export const modelCategory = (id: ModelId) => isHemttVariant(id) ? 'Vehicles' : id === 'MOB' || id === 'AIRFIELD' ? 'Structures' : isAir(id) ? 'Aircraft' : isVehicle(id) ? 'Vehicles' : 'Personnel'
export const MODEL_NOTES: Partial<Record<ModelId, string>> = {
  PATROL_BOAT: 'Patrol boat', FRIGATE: 'Guided-missile surface combatant with VLS, radar arrays, fore gun, hangar and flight deck.', AIRCRAFT_CARRIER: 'Fleet carrier with angled flight deck, island, elevators, defensive mounts and parked aircraft.', LANDING_CRAFT: 'Landing craft', AMPHIBIOUS_APC: 'Amphibious APC',
  FORKLIFT: 'Articulated forks and visible pallets. Transfers up to 750 supply units between apron and storage. Airfield tiers provide one, two or four forklifts.',
  CARGO_PLANE: 'Pale faceted strategic airlifter with four underwing jet engines, swept high wings, a T-tail, multi-wheel landing gear and a rear cargo ramp. Tier 1 delivers 3,300 supply units per wave; tier 2 delivers 6,600; tier 3 receives two simultaneous 6,600-unit flights on separate strips.',
  UAV_JAMMER: 'Static electronics and antenna array. Blocks hostile UAV reconnaissance within 600 m; 200 SP, 15-second construction, three per side.',
  AA_TEAM: 'Shoulder-fired air-defense launcher with radio support. Air-only targeting, 2.5-second acquisition and four missiles before resupply.',
  TRANSPORT_HELI: '24 troop seats: six four-person rifle squads, plus two crew. Requires at least 12 active troops for an assault sortie. Lands fully, unloads one soldier per second, then released infantry can capture; the helicopter itself never captures.',
  HEAVY_LIFT_HELI: 'Angular cargo cabin, high wing, twin wingtip rotors, twin tail fins and sling cargo. Transfers up to 1,800 supply units at 65 m/s.',
  TROOP_TRUCK: 'Open four-wheel utility carrier with roll cage, angular hood and troop seating. Six passengers; 24 m/s on validated ground routes.',
  APC: 'Eight-wheel armored troop hull, rear ramp and compact machine-gun station.',
  IFV: 'Tracked fighting vehicle with sloped glacis, autocannon turret and twin missile fittings.',
  ATTACK_HELI: 'Shared heavy-lift wingtip-rotor airframe with an independently aimed gun turret under the cockpit. Existing attack-helicopter combat loadout retained.',
  CAS_FIGHTER: 'Tandem canopy, five-blade nose propeller, straight tapered wings, wing guns and fuel tanks. Guns engage all ground unit types, deal 10% damage to tanks, and carry no anti-tank missiles. 8,000 SP; 85 m/s; 1,200 m gun range.',
  JET: 'FQ-44 Fury with a pointed nose, swept wings, one tail fin, one exhaust and gray camouflage.',
  RECON_UAV: 'Long-span reconnaissance airframe with a V-tail, rear pusher propeller and stabilized sensor turret.',
  MOB: 'Headquarters, communications mast, service shelter, supply containers and a perimeter with open vehicle access. Visual scenery; existing gameplay is unchanged.',
  AIRFIELD: 'Runway and threshold markings, taxiway, apron, hangars, glazed control tower, helipads and fuel tanks. 1,200 m runway used by physical cargo deliveries; supplies are handled by forklifts before onward transport.',
  FUEL_TRUCK: 'HEMTT base with an elliptical fuel tank, rear pump and hose-reel module, top catwalk and ladder. Preview only; refuelling gameplay is not implemented yet.',
  TROOP_HEMTT: 'HEMTT base with a drop-side bed under a canvas cover, rolled rear flap, tailgate and ladder. Preview only.',
  MEDICAL_HEMTT: 'HEMTT base with a red-cross shelter and roof AC; deploys an awning, tent walls and litters. Preview only.',
  REPAIR_HEMTT: 'HEMTT wrecker with a pedestal crane, tool lockers and rear underlift; deploys boom and outriggers. Preview only.',
  FOB_HEMTT: 'HEMTT with an expandable command shelter, generator, mast and dish; deploys expansions and a camo net. Preview only.',
  TRUCK: 'Eight-wheel cab-over container supply truck: 900-unit cargo body. Tier 3 provides four trucks with two 900-unit trailers each, for 2,700 units per vehicle.',
}
