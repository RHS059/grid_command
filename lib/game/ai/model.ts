import { missionAsset, type ContactMemory, type Point, type Role, type Side, type StrategicAction, type Unit } from '../types'

export interface Personality {
  risk: number; tempo: number; initiative: number; consistency: number; reserve: number; experience: number
}
export interface DecisionProfile { id: string; threatWeight: number; distanceWeight: number; recoveryThreshold: number; defenseThreshold: number; reviewMin: number; reviewMax: number }
export interface Doctrine { reserveFraction: number; reportLifetime: number; orderLifetime: number; surrender: boolean; maxFronts?: number; decisionProfile?: DecisionProfile }
export interface Communications { delay: number; loss: number; available: boolean }
export interface HumanFactors {
  morale: number; cohesion: number; fatigue: number; suppression: number; lastHp: number; updatedAt: number
  posture: 'STEADY' | 'WITHDRAW' | 'ROUT' | 'SURRENDER'
}
export interface KnownObjective extends Point { id: string; owner: Side | null; contested: boolean; observedAt: number }
export interface Mission {
  revision: number; unitId: string; issuer: string; target: string; destination: Point; action: StrategicAction
  task: 'ASSAULT' | 'RECON' | 'SUPPORT' | 'RESERVE' | 'WITHDRAW' | 'RESUPPLY'
  issuedAt: number; executeAt: number; expiresAt: number; initiative: number; reasons: string[]
  naval?: import('../maritime-navigation').NavalDirective
  commandPath?: string[]
}
export interface MissionExecution {
  revision: number; task: Mission['task']; target: string
  status: 'RECEIVED' | 'ACCEPTED' | 'BLOCKED' | 'COMPLETED' | 'EXPIRED'
  changedAt: number; sequence: number; reason: string; retryAt?: number
}
export interface ReadinessReport {
  position?: Point; lastFiredAt?: number
  id: string; role: Role; hp: number; ammo: number; fuel: number; morale: number; available: boolean; observedAt: number
  execution?: MissionExecution; supportRequest?: UnitMind['supportRequest']
}
export interface DecisionTrace { time: number; actor: string; level: 'commander' | 'subcommander' | 'squad' | 'unit' | 'network'; decision: string; reasons: string[]; scores?: Record<string, number> }
export interface OperationalPlan {
  expiresAt?: number
  fronts?: { id: string; target: KnownObjective; formationIds: string[] }[]
  revision: number; target: KnownObjective; action: StrategicAction; posture: 'ADVANCE' | 'DEFEND' | 'RECOVER'
  reserveIds: string[]; issuedAt: number; reviewAt: number; reasons: string[]; scores: Record<string, number>
}
export type Echelon = 'THEATER' | 'CORPS' | 'DIVISION' | 'BRIGADE' | 'BATTALION' | 'COMPANY' | 'PLATOON' | 'SECTION'
export interface OrganizationNode { id: string; name: string; echelon: Echelon; parentId?: string; unitIds: string[]; commanderUnitId?: string }
export interface EchelonState { id: string; parentId: string; unitIds: string[]; commanderId?: string; succession: number; command: CommandState; parentRevision: number; intent?: OperationalPlan }
export interface EchelonPacket { target: string; source: string; due: number; sentAt: number; plan: OperationalPlan; contacts: ContactMemory[]; objectives: KnownObjective[]; readiness: Record<string, ReadinessReport> }
export interface Formation { id: string; name: string; unitIds: string[]; commandPath?: string[]; automatic?: boolean }
export interface CommandState {
  opponent?: Record<string, { position: Point; observedAt: number; credibility: number; uncertaintyMeters: number; intent: Record<string,number>; reasons: string[] }>
  support?: SupportAllocation[]
  echelons?: Record<string, EchelonState>; echelonPackets?: EchelonPacket[]; orderSequence?: number
  echelonStatusReports?: { target: string; due: number; report: ReadinessReport }[]
  side: Side; organization?: OrganizationNode[]; readiness: Record<string, ReadinessReport>
  personality: Personality; doctrine: Doctrine; communications: Communications; commanderId?: string; degraded: boolean
  contacts: ContactMemory[]; objectives: KnownObjective[]; formations: Formation[]; plan?: OperationalPlan
  nextReview: number; signature: string; lastReport: Record<string, number>; receivedAt: Record<string, number>
}
export interface ReportPacket { side: Side; due: number; contact: ContactMemory }
export interface SupportAllocation { id: string; requester: string; kind: 'FIRE' | 'AMMO' | 'MEDICAL'; asset: string; unitId: string; revision: number; assignedAt: number; expiresAt: number; status: 'ASSIGNED' | 'ACCEPTED' | 'BLOCKED' | 'FULFILLED' | 'EXPIRED'; reason: string }
export interface UnitMind { issuedRevision?: number; lastFiredAt?: number; personality: Personality; factors: HumanFactors; contacts: ContactMemory[]; mission?: Mission; execution?: MissionExecution; lastDecision?: string; lastVehicleDecision?: string; lastStatusAt?: number; lastStatusSignature?: string; supportRequest?: { kind: 'FIRE' | 'AMMO' | 'MEDICAL'; since: number; expiresAt: number } }
export interface HierarchyState {
  sides: Record<Side, CommandState>; units: Record<string, UnitMind>; reports: ReportPacket[]; relays: ReportPacket[]; orders: Mission[]
  objectiveReports: { side: Side; due: number; objective: KnownObjective }[]
  statusReports: { side: Side; due: number; report: ReadinessReport }[]
  traces: DecisionTrace[]; nextUpdate: number; version: 1
}
export const clamp = (n: number) => Math.max(0, Math.min(1, n))
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
// Keyed draws are reproducible and do not consume the combat random stream or depend on iteration order.
export function seeded(seed: number, key: string) {
  let value = seed >>> 0
  for (const char of key) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0
  value ^= value >>> 16; value = Math.imul(value, 2246822507) >>> 0; value ^= value >>> 13
  return (value >>> 0) / 4294967296
}
export function personality(seed: number, id: string): Personality {
  return Object.fromEntries(['risk', 'tempo', 'initiative', 'consistency', 'reserve', 'experience'].map(key => [key, .25 + seeded(seed, `${id}:${key}`) * .5])) as unknown as Personality
}
export const defaultDoctrine = (): Doctrine => ({ reserveFraction: .2, reportLifetime: 45, orderLifetime: 120, surrender: false, maxFronts: 2 })
export const initialFactors = (u: Unit, time: number): HumanFactors => ({ morale: .8, cohesion: .8, fatigue: 0, suppression: u.suppression || 0, lastHp: u.hp, updatedAt: time, posture: 'STEADY' })
export function trace(ai: HierarchyState, entry: DecisionTrace) {
  ai.traces.push(entry)
  if (ai.traces.length > 240) ai.traces.splice(0, ai.traces.length - 240)
}
export const ordered = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
export const commandable = (u: Unit) => u.hp > 0 && !u.external && !u.crewBailed && !u.surrendered && !missionAsset(u.role) && !['COMMAND', 'PILOT', 'LOGISTICS'].includes(u.role)
