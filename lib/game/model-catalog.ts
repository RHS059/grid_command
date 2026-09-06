import { CATALOG, isAir, isVehicle, type Role } from './types'
import type { BaseKind } from './base-models'
export type ModelId = Role | BaseKind
export const MODEL_NAMES: Record<ModelId, string> = {
  FORKLIFT: 'Supply forklift', CARGO_PLANE: 'Tactical cargo plane', UAV_JAMMER: 'UAV jammer', AA_TEAM: 'Anti-air launcher team', TRANSPORT_HELI: 'Troop transport helicopter', HEAVY_LIFT_HELI: 'Heavy-lift helicopter', TROOP_TRUCK: 'Light troop carrier',
  RIFLE: 'Rifle squad', SCOUT: 'Scout team', MG: 'Machine gun team', AT: 'Anti-tank team', MORTAR: 'Mortar team', ENGINEER: 'Combat engineer', MEDIC: 'Combat medic', LOGISTICS: 'Logistics team', TANK: 'Main battle tank', PILOT: 'Pilot', COMMAND: 'Command officer', TRUCK: 'Supply truck', RECON_UAV: 'Reconnaissance UAV', APC: 'Armored personnel carrier', CANNON_APC: 'Cannon APC', IFV: 'Infantry fighting vehicle', JET: 'Strike fighter', ATTACK_HELI: 'Attack helicopter', MOB: 'Main operating base', AIRFIELD: 'Airfield compound',
}
export const MODEL_CATALOG = [...Object.keys(CATALOG) as Role[], 'MOB', 'AIRFIELD'] as ModelId[]
export const modelCategory = (id: ModelId) => id === 'MOB' || id === 'AIRFIELD' ? 'Structures' : isAir(id) ? 'Aircraft' : isVehicle(id) ? 'Vehicles' : 'Personnel'
export const MODEL_NOTES: Partial<Record<ModelId, string>> = {
  FORKLIFT: 'Articulated forks and visible pallets. Transfers up to 750 supply units between apron and storage. Airfield tiers provide one, two or four forklifts.',
  CARGO_PLANE: 'Four turboprops and a rear cargo ramp. Tier 1 delivers 3,300 supply units per wave; tier 2 delivers 6,600; tier 3 receives two simultaneous 6,600-unit flights on separate strips.',
  UAV_JAMMER: 'Static electronics and antenna array. Blocks hostile UAV reconnaissance within 600 m; 200 SP, 15-second construction, three per side.',
  AA_TEAM: 'Shoulder-fired air-defense launcher with radio support. Air-only targeting, 2.5-second acquisition and four missiles before resupply.',
  TRANSPORT_HELI: '24 troop seats: six four-person rifle squads, plus two crew. Requires at least 12 active troops for an assault sortie. Lands fully, unloads one soldier per second, then released infantry can capture; the helicopter itself never captures.',
  HEAVY_LIFT_HELI: 'Distinct tandem rotors and sling cargo. Transfers up to 1,800 supply units at 65 m/s.',
  TROOP_TRUCK: 'Open four-wheel utility carrier with roll cage, angular hood and troop seating. Six passengers; 24 m/s on validated ground routes.',
  APC: 'Eight-wheel armored troop hull, rear ramp and compact machine-gun station.',
  IFV: 'Tracked fighting vehicle with sloped glacis, autocannon turret and twin missile fittings.',
  ATTACK_HELI: 'Tandem cockpit, four-blade main rotor, tail rotor, chin-mounted cannon, sensor turret and wing-mounted ordnance.',
  JET: 'Swept wings, tapered nose, glazed canopy, twin exhausts, canted tail surfaces and underwing stores.',
  RECON_UAV: 'Long-span reconnaissance airframe with a V-tail, rear pusher propeller and stabilized sensor turret.',
  MOB: 'Headquarters, communications mast, service shelter, supply containers and a perimeter with open vehicle access. Visual scenery; existing gameplay is unchanged.',
  AIRFIELD: 'Runway and threshold markings, taxiway, apron, hangars, glazed control tower, helipads and fuel tanks. 1,200 m runway used by physical cargo deliveries; supplies are handled by forklifts before onward transport.',
  TRUCK: 'Six-wheel supply truck: 900-unit cargo body. Tier 3 provides four trucks with two 900-unit trailers each, for 2,700 units per vehicle.',
}
