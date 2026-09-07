import type { MobState } from './mob'
import { ORIGIN, CITY_BASES, CITY_AIRBASES, CITY_OBJECTIVES, toPoint, fromPoint } from './theater'
export type Side = 'BLU' | 'RED'
export type AirfieldTier = 1 | 2 | 3
export const AIRFIELD_TIERS = {
  1: { runways: 1, forklifts: 1, trucks: 1, trailers: 0, supplyMultiplier: 1, income: 10, cost: 0, buildSeconds: 0 },
  2: { runways: 1, forklifts: 2, trucks: 2, trailers: 0, supplyMultiplier: 2, income: 20, cost: 600, buildSeconds: 60 },
  3: { runways: 2, forklifts: 4, trucks: 4, trailers: 2, supplyMultiplier: 4, income: 40, cost: 1200, buildSeconds: 90 },
} as const
export interface AirfieldState { tier: AirfieldTier; upgrade?: { tier: AirfieldTier; due: number } }
export interface MissionState { objectiveId?: string; manual?: boolean; autoDismount?: boolean; dismountCrew?: boolean; mobPad?: boolean; pickup?: Point; pickupFor?: string; containerState?: 'loaded' | 'empty'; containerCount?: number; unloadedContainers?: number; airfieldSlot?: number; mobHold?: number; mobDock?: number; queuedAt?: number; unloadStarted?: number; unloadSeconds?: number; phase: string; since: number; destination?: Point; passengers?: string[]; cargo?: number; manifest?: Stock; shipment?: string; home?: Point; location?: 'MOB' | 'AIRBASE'; runway?: number; trailers?: number; dispatchTroops?: number; unloaded?: number; lastUnload?: number }
export interface Stock { fuel: number; ammo: number; repair: number }
export const emptyStock = (): Stock => ({ fuel: 0, ammo: 0, repair: 0 })
export const stockTotal = (s: Stock) => s.fuel + s.ammo + s.repair
export interface Depot { airfield: Stock; pending: Stock; mob: Stock }
export interface Missile { id: number; source: string; target: string; due: number; damage: number }
export interface Casualty { id: string; side: Side; role: Role; soldier?: Soldier; x: number; y: number; heading: number; time: number; observed: Side[]; altitude: number }
export type Perspective = Side | 'OBS'
export type Role = 'RIFLE' | 'SCOUT' | 'MG' | 'AT' | 'MORTAR' | 'ENGINEER' | 'MEDIC' | 'LOGISTICS' | 'TANK' | 'PILOT' | 'COMMAND' | 'TRUCK' | 'RECON_UAV' | 'APC' | 'CANNON_APC' | 'IFV' | 'CAS_FIGHTER' | 'JET' | 'ATTACK_HELI' | 'FORKLIFT' | 'CARGO_PLANE' | 'UAV_JAMMER' | 'AA_TEAM' | 'TRANSPORT_HELI' | 'HEAVY_LIFT_HELI' | 'TROOP_TRUCK'
export type Point = { x: number; y: number }
export type Vec3 = Point & { z: number }
export type Stance = 'stand' | 'crouch' | 'prone'
export type SoldierAction = 'idle' | 'walk' | 'fire' | 'cover' | 'peek' | 'throw' | 'drag'
export type StrategicAction = 'ASSEMBLE' | 'MASS' | 'FLANK' | 'SEIZE' | 'RESUPPLY'
export type StrategicTask = 'CAPTURE' | 'SUPPORT' | 'OVERWATCH' | 'RESUPPLY'
export type TacticalAction = 'ADVANCE' | 'HOLD' | 'ENGAGE' | 'COVER' | 'SUPPRESS' | 'LOCAL_FLANK' | 'WITHDRAW' | 'RESCUE' | 'RESUPPLY' | 'MOUNT'
export interface StrategicOrder { revision: number; action: StrategicAction; task: StrategicTask; target: string; destination: Point; issuedAt: number }
export interface TacticalIntent { action: TacticalAction; score: number; decidedAt: number; committedUntil: number; targetId?: string; destination?: Point }
export interface MovementIntent { source: 'strategic' | 'tactical'; destination: Point; speed: number; arrival: number; issuedAt: number }
export type OrderRefusalCode = 'NO_ROUTE' | 'NO_TRANSPORT' | 'INSUFFICIENT_FUEL' | 'LANDING_BLOCKED'
export interface OrderRefusal { code: OrderRefusalCode; reason: string; target: string; since: number; retryAt: number }
export interface ContactMemory { unitId: string; role: Role; position: Point; lastSeen: number; confidence: number; observers: string[] }
export interface Soldier extends Point { disembarked?: boolean; id: string; status: 'active' | 'downed' | 'dead'; stance: Stance; action: SoldierAction; heading: number; aim: number; shotAt: number; since: number; rescue?: string; cover?: Point; path?: Point[]; routeAt?: number }
export interface GeometryFeature { key: string; water: boolean; rings: number[][][]; base?: number; roof?: number; elevation?: number }
export interface TerrainGrid { x: number; y: number; step: number; width: number; height: number; values: number[] }
export interface GeometryPacket { sector?: string; evict?: string; features: GeometryFeature[]; terrain: TerrainGrid; version: number; complete: boolean }
export interface ShotEvent { id: number; time: number; unit: string; soldier?: string; side: Side; weapon: string; start: Vec3; end: Vec3; speed: number; size: number; blast: number; sound: string; spotted: boolean }
export interface Smoke extends Vec3 { id: number; side: Side; time: number; expires: number; from: Vec3 }
export const isAir = (r: Role) => ['RECON_UAV', 'CAS_FIGHTER', 'JET', 'ATTACK_HELI', 'CARGO_PLANE', 'TRANSPORT_HELI', 'HEAVY_LIFT_HELI'].includes(r)
export const isVehicle = (r: Role) => ['TANK', 'APC', 'CANNON_APC', 'IFV', 'TRUCK', 'TROOP_TRUCK', 'FORKLIFT', 'UAV_JAMMER'].includes(r) || isAir(r)
export const isArmored = (r: Role) => ['TANK', 'APC', 'CANNON_APC', 'IFV'].includes(r)
export const troopSeats = (r: Role) => r === 'TRANSPORT_HELI' ? 24 : r === 'APC' ? 8 : ['TROOP_TRUCK', 'CANNON_APC', 'IFV'].includes(r) ? 6 : 0
export const missionAsset = (r: Role) => ['FORKLIFT','CARGO_PLANE','UAV_JAMMER','TRANSPORT_HELI','HEAVY_LIFT_HELI','TROOP_TRUCK','TRUCK'].includes(r)
export interface Unit extends Point {
  crewBailed?: boolean; external?: boolean; engine?: boolean; servicing?: boolean; serviceStatus?: string; emergency?: boolean;
  serviceObjective?: string; travelStatus?: string; routeRetry?: number; transport?: MissionState; carrier?: string; transportIntent?: { destination: Point; mission: string; target: string }; attachedSquad?: string; attachedVehicles?: string[]; deployment?: 'garage'; destroyedAt?: number; lossProcessed?: boolean; lock?: { target: string; since: number }; construction?: { builder: string; due: number }; fuelCommitment?: { target: string; required: number; reservedAt: number };
  soldiers?: Soldier[]; aim?: number; altitude?: number; cooldown?: number; suppression?: number; smoke?: number; airPhase?: 'attack' | 'return' | 'rearm';
  strategicOrder?: StrategicOrder; tacticalIntent?: TacticalIntent; movementIntent?: MovementIntent; orderRefusal?: OrderRefusal;
  id: string; name: string; side: Side; role: Role; members: number; maxMembers: number;
  hp: number; ammo: number; fuel: number; heading: number; mission: string; target: string;
  path: Point[]; spotted: boolean; firing: boolean; kills: number; subcommand: string;
}
export type ObjectiveFacilityKind = 'helipad' | 'vehicleBay'
export interface ObjectiveFacility { hp: number; occupant?: string; construction?: { side: Side; due: number } }
export interface ObjectiveRestock { truckId: string; side: Side }
export interface Objective extends Point { id: string; name: string; owner: Side | null; contested: boolean; progress: number; capturing: Side | null; stock: Stock; facilities: Partial<Record<ObjectiveFacilityKind, ObjectiveFacility>>; restock?: ObjectiveRestock }
export interface RadioEvent { id: number; time: number; side: Side | 'SYS'; text: string; type: 'command' | 'combat' | 'logistics' | 'system' }
export interface Force { sp: number; tempo: number; action: string; target: string; cycles: number; casualties: number; fuel: number; ammo: number; manpower: number; queue: number; purchase: string; hold: number; delivered: number }
export interface BattleState { facilityDamageCursor?: number; mobs?: Record<Side, MobState>; airfields: Record<Side, AirfieldState>; nextSupply: Record<Side, number>; depots: Record<Side, Depot>; contacts?: Record<Side, ContactMemory[]>; missiles: Missile[]; casualties: Casualty[]; shipmentSerial: number; shots: ShotEvent[]; smokes: Smoke[]; geometryReady: boolean; workerMs: number; time: number; tick: number; seed: number; paused: boolean; speed: number; units: Unit[]; objectives: Objective[]; forces: Record<Side, Force>; events: RadioEvent[]; winner: Side | 'DRAW' | null; navCells: number; buildings: number }
export interface Graphics { performanceMode?: boolean; quality: 'performance' | 'balanced' | 'high'; terrain: boolean; buildings: boolean; shadows: boolean; labels: boolean; routes: boolean; grid: boolean; models: boolean }
export const DEFAULT_GRAPHICS: Graphics = { performanceMode: false, quality: 'balanced', terrain: false, buildings: true, shadows: true, labels: true, routes: true, grid: true, models: true }
export const CENTER = ORIGIN
export const SIDE_COLOR = { BLU: '#54b7ff', RED: '#ee777b' }
export const BASES = CITY_BASES
export const AIRBASES = CITY_AIRBASES
export const CATALOG: Record<Role, { members: number; speed: number; range: number; power: number; cost: number }> = {
  FORKLIFT: { members: 1, speed: 3, range: 0, power: 0, cost: 150 },
  CARGO_PLANE: { members: 3, speed: 85, range: 0, power: 0, cost: 7000 },
  UAV_JAMMER: { members: 0, speed: 0, range: 600, power: 0, cost: 200 },
  AA_TEAM: { members: 2, speed: 3.4, range: 2400, power: 60, cost: 500 },
  TRANSPORT_HELI: { members: 2, speed: 75, range: 0, power: 0, cost: 4500 },
  HEAVY_LIFT_HELI: { members: 3, speed: 65, range: 0, power: 0, cost: 6000 },
  TROOP_TRUCK: { members: 1, speed: 24, range: 0, power: 0, cost: 300 },
  RIFLE: { members: 4, speed: 3.8, range: 600, power: 6, cost: 200 }, SCOUT: { members: 4, speed: 4.5, range: 600, power: 3, cost: 150 },
  MG: { members: 4, speed: 3.2, range: 800, power: 7, cost: 250 }, AT: { members: 4, speed: 3.4, range: 410, power: 7, cost: 350 },
  MORTAR: { members: 4, speed: 2.7, range: 1200, power: 8, cost: 450 }, ENGINEER: { members: 4, speed: 3.4, range: 150, power: 1, cost: 300 },
  MEDIC: { members: 3, speed: 3.8, range: 150, power: 1, cost: 250 }, LOGISTICS: { members: 4, speed: 3.6, range: 160, power: 2, cost: 300 },
  TANK: { members: 3, speed: 9, range: 600, power: 22, cost: 8000 }, PILOT: { members: 2, speed: 3.8, range: 120, power: 1, cost: 200 },
  COMMAND: { members: 1, speed: 0, range: 220, power: 1, cost: 0 }, TRUCK: { members: 1, speed: 12, range: 0, power: 0, cost: 350 },
  CANNON_APC: { members: 3, speed: 10, range: 1100, power: 14, cost: 5000 },
  IFV: { members: 3, speed: 10, range: 1300, power: 18, cost: 6000 },
  CAS_FIGHTER: { members: 2, speed: 85, range: 1200, power: 12, cost: 8000 },
  JET: { members: 1, speed: 110, range: 1800, power: 28, cost: 16000 },
  ATTACK_HELI: { members: 2, speed: 28, range: 1500, power: 24, cost: 10000 },
  RECON_UAV: { members: 1, speed: 24, range: 950, power: 0, cost: 500 }, APC: { members: 3, speed: 10, range: 420, power: 11, cost: 4000 },
}
export function prepareUnit(u: Unit) {
  u.aim = u.heading; u.cooldown = 0; u.suppression = 0; u.smoke = 2; u.airPhase = 'attack'; u.altitude = u.role === 'JET' ? 230 : u.role === 'CAS_FIGHTER' ? 140 : isAir(u.role) ? 95 : 0
  u.soldiers = isVehicle(u.role) ? [] : Array.from({ length: u.maxMembers }, (_, i) => ({ id: `${u.id}:${i}`, x: u.x + (i % 3 - 1) * 2.5, y: u.y - Math.floor(i / 3) * 3, status: 'active', stance: 'stand', action: 'idle', heading: u.heading, aim: u.heading, shotAt: -10, since: 0 }))
}
export function lngLat(p: Point): [number, number] { return fromPoint(p) }
export function local(p: number[]): Point { return toPoint(p[0],p[1]) }
export function clock(seconds: number) { const s = Math.floor(seconds); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
export function createUnit(side: Side, role: Role, id: string, point: Point = isAir(role) ? AIRBASES[side] : BASES[side]): Unit {
  const d = CATALOG[role], vehicle = isVehicle(role)
  const u: Unit = { ...point, id, name: `${side === 'BLU' ? 'SABER' : 'VIPER'} ${id.split('-').at(-1)}`, side, role, members: d.members, maxMembers: d.members, hp: 100, ammo: vehicle ? 0 : 100, fuel: vehicle ? 0 : 100, heading: side === 'BLU' ? 0 : Math.PI, mission: vehicle ? 'AWAITING SERVICE' : 'HOLD', target: isAir(role) ? 'AIRFIELD' : 'MOB', path: [], spotted: false, firing: false, kills: 0, subcommand: 'RESERVE', engine: false, servicing: vehicle }
  prepareUnit(u)
  u.altitude = 0
  return u
}
export function initialState(seed = 3701): BattleState {
  const force = (): Force => ({ sp: 2000, tempo: 58, action: 'ASSEMBLE', target: 'C', cycles: 0, casualties: 0, fuel: 0, ammo: 0, manpower: 120, queue: 0, purchase: 'Commander only · awaiting first requisition', hold: 0, delivered: 0 })
  const depot = (): Depot => ({ airfield: emptyStock(), pending: emptyStock(), mob: emptyStock() })
  const objectives: Objective[] = CITY_OBJECTIVES.map(o => ({ ...o, owner: null, contested: false, progress: 0, capturing: null, stock: emptyStock(), facilities: {} }))
  const units = (['BLU', 'RED'] as Side[]).map(side => createUnit(side, 'COMMAND', `${side}-command`))
  return { mobs: { BLU: { tier: 1 }, RED: { tier: 1 } }, airfields: { BLU: { tier: 1 }, RED: { tier: 1 } }, nextSupply: { BLU: 30, RED: 30 }, depots: { BLU: depot(), RED: depot() }, contacts: { BLU: [], RED: [] }, missiles: [], casualties: [], shipmentSerial: 0, shots: [], smokes: [], geometryReady: false, workerMs: 0, time: 0, tick: 0, seed, paused: false, speed: 1, units, objectives, forces: { BLU: force(), RED: force() }, events: [{ id: 1, time: 0, side: 'SYS', type: 'system', text: 'Commanders online. Depots empty. Scheduled airfield supplies inbound; all force assets must be purchased.' }], winner: null, navCells: 0, buildings: 0 }
}

