import type { Vec3 } from './types'

export const VEHICLE_BREAKUP_LIMITS = {
  maxActiveBodies: 48, maxEvents: 16, maxPiecesPerEvent: 12, minPiecesPerEvent: 4,
  releasesPerFrame: 2, fixedStep: 1 / 60, maxSubsteps: 6,
  sleepSpeed: .35, sleepDelay: .6, maxDynamicAge: 12, wreckLifetime: 45,
  minShardsPerEvent: 16, maxShardsPerEvent: 48, maxCosmeticShards: 256, shardLifetime: 2.5,
} as const

export interface BreakupSectionDefinition {
  id: string
  center: Vec3
  halfExtents: Vec3
  mass?: number
  detachThreshold?: number
}
export interface BreakupPiece {
  id: string
  phase: 'attached' | 'dynamic' | 'static' | 'removed'
  position: Vec3
  rotation: Vec3
  velocity: Vec3
  angularVelocity: Vec3
  halfExtents: Vec3
  colliderEnabled: boolean
  mass: number
  detachThreshold: number
  dynamicAge: number
  quietTime: number
  /** The selected large pieces alone consume the active-body budget. */
  selected: boolean
}
export interface BreakupEvent {
  id: string
  sections: BreakupPiece[]
  intactColliderEnabled: boolean
  destruction: number
  age: number
  groundZ: number
  seed: number
  shards: BreakupShard[]
  shardCount: number
  origin: Vec3
  velocity: Vec3
  emittedShards: boolean
}
export interface BreakupShard {
  id: string
  position: Vec3
  velocity: Vec3
  origin: Vec3
  age: number
  active: boolean
  colliderEnabled: false
}
export interface BreakupStart {
  id: string
  sections: readonly BreakupSectionDefinition[]
  position: Vec3
  rotation?: Vec3
  velocity?: Vec3
  seed?: number
  destruction?: number
  groundZ?: number
  pieceCount?: number
  shardCount?: number
}
type Limits = { -readonly [K in keyof typeof VEHICLE_BREAKUP_LIMITS]: number }
const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 })
const copy = (v: Vec3): Vec3 => ({ ...v })
const bounded = (n: number, low: number, high: number) => Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : low
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)
const eventContactGrace = (a: BreakupPiece, b: BreakupPiece) => a.dynamicAge < .18 || b.phase === 'dynamic' && b.dynamicAge < .18
const hash = (text: string, seed: number) => {
  let result = seed | 0
  for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619)
  result ^= result >>> 16; result = Math.imul(result, 0x7feb352d); result ^= result >>> 15
  return result >>> 0
}
const random = (id: string, seed: number, axis: string) => hash(id + axis, seed) / 0xffffffff
const rotate = (v: Vec3, r: Vec3): Vec3 => {
  const cx = Math.cos(r.x), sx = Math.sin(r.x), cy = Math.cos(r.y), sy = Math.sin(r.y), cz = Math.cos(r.z), sz = Math.sin(r.z)
  // Match scene-data's XYZ Euler quaternion (rightmost local rotation acts first).
  const x = v.x * cz - v.y * sz, y = v.x * sz + v.y * cz
  const xx = x * cy + v.z * sy, z = -x * sy + v.z * cy
  return { x: xx, y: y * cx - z * sx, z: y * sx + z * cx }
}
/** Conservative world box of the rotating, simple convex section collider. */
export function breakupWorldHalfExtents(piece: Pick<BreakupPiece, 'halfExtents' | 'rotation'>): Vec3 {
  const h = piece.halfExtents, r = piece.rotation
  const x = rotate({ x: h.x, y: 0, z: 0 }, r), y = rotate({ x: 0, y: h.y, z: 0 }, r), z = rotate({ x: 0, y: 0, z: h.z }, r)
  return { x: Math.abs(x.x) + Math.abs(y.x) + Math.abs(z.x), y: Math.abs(x.y) + Math.abs(y.y) + Math.abs(z.y), z: Math.abs(x.z) + Math.abs(y.z) + Math.abs(z.z) }
}

/** Presentation physics: deterministic fixed steps, simple box contacts, no engine/world mutation. */
export class VehicleBreakupSystem {
  readonly events = new Map<string, BreakupEvent>()
  readonly limits: Limits
  private readonly pool: BreakupPiece[] = []
  private readonly shardPool: BreakupShard[] = []
  private accumulator = 0
  constructor(options: Partial<Limits> = {}) {
    this.limits = { ...VEHICLE_BREAKUP_LIMITS, ...options }
    for (const key of Object.keys(this.limits) as (keyof Limits)[]) {
      if (!Number.isFinite(this.limits[key]) || this.limits[key] <= 0) this.limits[key] = VEHICLE_BREAKUP_LIMITS[key]
    }
    this.limits.maxPiecesPerEvent = Math.floor(bounded(this.limits.maxPiecesPerEvent, 4, 12))
    this.limits.minPiecesPerEvent = Math.floor(bounded(this.limits.minPiecesPerEvent, 4, this.limits.maxPiecesPerEvent))
    this.limits.maxShardsPerEvent = Math.floor(bounded(this.limits.maxShardsPerEvent, 16, 48))
    this.limits.minShardsPerEvent = Math.floor(bounded(this.limits.minShardsPerEvent, 16, this.limits.maxShardsPerEvent))
    for (const key of ['maxActiveBodies', 'maxEvents', 'releasesPerFrame', 'maxSubsteps', 'maxCosmeticShards'] as const) this.limits[key] = Math.max(1, Math.floor(this.limits[key]))
  }
  get stats() {
    let activeBodies = 0, staticBodies = 0, attachedBodies = 0, cosmeticShards = 0
    for (const event of this.events.values()) for (const piece of event.sections) {
      if (piece.phase === 'dynamic') activeBodies++
      else if (piece.phase === 'static') staticBodies++
      else if (piece.phase === 'attached') attachedBodies++
    }
    for (const event of this.events.values()) cosmeticShards += event.shards.length
    return { events: this.events.size, activeBodies, staticBodies, attachedBodies, pooledBodies: this.pool.length, cosmeticShards, pooledShards: this.shardPool.length }
  }
  begin(input: BreakupStart): BreakupEvent | undefined {
    if (this.events.has(input.id)) return this.events.get(input.id)
    // Avoid malformed/duplicate section IDs and unbounded imported metadata.
    const definitions = input.sections.filter((section, index, all) => all.findIndex(other => other.id === section.id) === index).slice(0, 20)
    if (!definitions.length) return undefined
    while (this.events.size >= this.limits.maxEvents) this.remove(this.events.keys().next().value!)
    const seed = input.seed ?? hash(input.id, 2166136261), rotation = input.rotation ?? zero()
    const count = Math.min(definitions.length, Math.floor(bounded(input.pieceCount ?? 8, this.limits.minPiecesPerEvent, this.limits.maxPiecesPerEvent)))
    const selected = new Set([...definitions].sort((a, b) => hash(a.id, seed) - hash(b.id, seed)).slice(0, count).map(section => section.id))
    const sections = definitions.map(definition => {
      const offset = rotate(definition.center, rotation), piece = this.pool.pop() ?? {} as BreakupPiece
      Object.assign(piece, {
        id: definition.id, phase: 'attached', position: { x: input.position.x + offset.x, y: input.position.y + offset.y, z: input.position.z + offset.z },
        rotation: copy(rotation), velocity: copy(input.velocity ?? zero()), angularVelocity: zero(),
        halfExtents: { x: Math.max(.05, Math.abs(definition.halfExtents.x)), y: Math.max(.05, Math.abs(definition.halfExtents.y)), z: Math.max(.05, Math.abs(definition.halfExtents.z)) },
        colliderEnabled: false, mass: Math.max(.1, definition.mass ?? 1), detachThreshold: bounded(definition.detachThreshold ?? .35, .01, 1),
        dynamicAge: 0, quietTime: 0, selected: selected.has(definition.id),
      })
      return piece
    })
    const event: BreakupEvent = { id: input.id, sections, intactColliderEnabled: true, destruction: bounded(input.destruction ?? 1, 0, 1), age: 0, groundZ: input.groundZ ?? 0, seed, shards: [], emittedShards: false,
      shardCount: Math.floor(bounded(input.shardCount ?? 24, this.limits.minShardsPerEvent, this.limits.maxShardsPerEvent)), origin: copy(input.position), velocity: copy(input.velocity ?? zero()) }
    this.events.set(input.id, event)
    return event
  }
  setDestruction(id: string, value: number) {
    const event = this.events.get(id)
    if (event && Number.isFinite(value)) event.destruction = Math.max(event.destruction, bounded(value, 0, 1))
  }
  private settle(piece: BreakupPiece, ground: number) {
    piece.phase = 'static'; piece.velocity = zero(); piece.angularVelocity = zero()
    piece.position.z = Math.max(piece.position.z, ground + breakupWorldHalfExtents(piece).z)
    piece.colliderEnabled = true
  }
  private emitShards(event: BreakupEvent) {
    if (event.emittedShards) return
    event.emittedShards = true
    const count = Math.min(event.shardCount, this.limits.maxCosmeticShards - this.stats.cosmeticShards)
    for (let index = 0; index < count; index++) {
      const id = `${event.id}-shard-${index}`, shard = this.shardPool.pop() ?? {} as BreakupShard
      Object.assign(shard, { id, origin: copy(event.origin), position: copy(event.origin), age: 0, active: true, colliderEnabled: false,
        velocity: { x: event.velocity.x + (random(id, event.seed, 'x') * 2 - 1) * 16, y: event.velocity.y + (random(id, event.seed, 'y') * 2 - 1) * 16, z: event.velocity.z + 4 + random(id, event.seed, 'z') * 12 } })
      event.shards.push(shard)
    }
  }
  private recycleShards(event: BreakupEvent) {
    for (const shard of event.shards) {
      shard.active = false
      if (this.shardPool.length < this.limits.maxCosmeticShards) this.shardPool.push(shard)
    }
    event.shards.length = 0
  }
  update(dt: number, groundHeight?: (x: number, y: number) => number) {
    if (!Number.isFinite(dt) || dt <= 0) return
    const terrain = (event: BreakupEvent, piece: BreakupPiece) => {
      const height = groundHeight?.(piece.position.x, piece.position.y)
      return height !== undefined && Number.isFinite(height) ? height : event.groundZ
    }
    let active = this.stats.activeBodies, released = 0
    // This budget is per render call, not per fixed substep, including overload fallback.
    for (const event of this.events.values()) for (const piece of event.sections) {
      if (released >= this.limits.releasesPerFrame) break
      if (piece.phase !== 'attached' || event.destruction < piece.detachThreshold || !piece.selected && event.destruction < 1) continue
      if (event.intactColliderEnabled) {
        // Atomically replace the intact proxy with only the retained section colliders.
        event.intactColliderEnabled = false
        for (const retained of event.sections) if (retained.phase !== 'removed') retained.colliderEnabled = true
        this.emitShards(event)
      }
      released++
      if (!piece.selected || active >= this.limits.maxActiveBodies) {
        piece.position.z = terrain(event, piece) + breakupWorldHalfExtents(piece).z
        this.settle(piece, terrain(event, piece)); continue
      }
      piece.phase = 'dynamic'; active++
      piece.velocity.x += (random(piece.id, event.seed, 'x') * 2 - 1) * 7
      piece.velocity.y += (random(piece.id, event.seed, 'y') * 2 - 1) * 7
      piece.velocity.z += 4 + random(piece.id, event.seed, 'z') * 6
      piece.angularVelocity = { x: (random(piece.id, event.seed, 'rx') * 2 - 1) * 2, y: (random(piece.id, event.seed, 'ry') * 2 - 1) * 2, z: (random(piece.id, event.seed, 'rz') * 2 - 1) * 2 }
    }
    this.accumulator += Math.min(dt, this.limits.fixedStep * this.limits.maxSubsteps)
    let steps = 0
    while (this.accumulator + 1e-9 >= this.limits.fixedStep && steps++ < this.limits.maxSubsteps) {
      const step = this.limits.fixedStep
      this.accumulator = Math.max(0, this.accumulator - step)
      const colliders: { event: BreakupEvent; piece: BreakupPiece; half: Vec3 }[] = []
      for (const event of this.events.values()) {
        event.age += step
        for (const shard of event.shards) {
          shard.age += step
          const t = shard.age
          shard.position.x = shard.origin.x + shard.velocity.x * t
          shard.position.y = shard.origin.y + shard.velocity.y * t
          shard.position.z = shard.origin.z + shard.velocity.z * t - 4.905 * t * t
        }
        if (event.shards[0]?.age >= this.limits.shardLifetime) this.recycleShards(event)
        for (const piece of event.sections) {
          if (piece.phase === 'dynamic') {
            piece.dynamicAge += step; piece.velocity.z -= 9.81 * step
            for (const axis of ['x', 'y', 'z'] as const) {
              piece.position[axis] += piece.velocity[axis] * step
              piece.rotation[axis] += piece.angularVelocity[axis] * step
              piece.velocity[axis] *= Math.exp(-.28 * step)
            }
            const ground = terrain(event, piece), height = breakupWorldHalfExtents(piece).z
            if (piece.position.z <= ground + height) {
              piece.position.z = ground + height
              piece.velocity.z = Math.abs(piece.velocity.z) < 1.1 ? 0 : Math.abs(piece.velocity.z) * .18
              piece.velocity.x *= .78; piece.velocity.y *= .78
              piece.angularVelocity.x *= .65; piece.angularVelocity.y *= .65; piece.angularVelocity.z *= .65
              piece.quietTime = length(piece.velocity) < this.limits.sleepSpeed && length(piece.angularVelocity) < this.limits.sleepSpeed ? piece.quietTime + step : 0
              if (piece.quietTime >= this.limits.sleepDelay) this.settle(piece, ground)
            } else piece.quietTime = 0
            if (piece.dynamicAge >= this.limits.maxDynamicAge) {
              piece.position.z = ground + height
              this.settle(piece, ground)
            }
          }
          if (piece.colliderEnabled) colliders.push({ event, piece, half: breakupWorldHalfExtents(piece) })
        }
      }
      // Only active bodies initiate contact work; sleeping wrecks have no pair-loop cost.
      for (let a = 0; a < colliders.length; a++) {
        const left = colliders[a], p = left.piece
        if (p.phase !== 'dynamic') continue
        for (let b = 0; b < colliders.length; b++) {
        const right = colliders[b], q = right.piece
        if (a === b || q.phase === 'dynamic' && b < a || left.event === right.event && eventContactGrace(p, q)) continue
        const overlap = { x: left.half.x + right.half.x - Math.abs(p.position.x - q.position.x), y: left.half.y + right.half.y - Math.abs(p.position.y - q.position.y), z: left.half.z + right.half.z - Math.abs(p.position.z - q.position.z) }
        if (overlap.x <= 0 || overlap.y <= 0 || overlap.z <= 0) continue
        const axis = overlap.x < overlap.y && overlap.x < overlap.z ? 'x' : overlap.y < overlap.z ? 'y' : 'z'
        const normal = p.position[axis] < q.position[axis] ? -1 : 1
        const invP = p.phase === 'dynamic' ? 1 / p.mass : 0, invQ = q.phase === 'dynamic' ? 1 / q.mass : 0, total = invP + invQ
        p.position[axis] += normal * overlap[axis] * invP / total
        q.position[axis] -= normal * overlap[axis] * invQ / total
        const speed = (p.velocity[axis] - q.velocity[axis]) * normal
        if (speed < 0) {
          const impulse = -1.15 * speed / total
          p.velocity[axis] += normal * impulse * invP
          q.velocity[axis] -= normal * impulse * invQ
        }
        }
      }
      for (const event of this.events.values()) if (event.age >= this.limits.wreckLifetime) this.remove(event.id)
    }
  }
  remove(id: string) {
    const event = this.events.get(id)
    if (!event) return
    for (const piece of event.sections) {
      piece.phase = 'removed'; piece.colliderEnabled = false
      if (this.pool.length < this.limits.maxEvents * 20) this.pool.push(piece)
    }
    this.recycleShards(event)
    this.events.delete(id)
  }
  clear() {
    for (const id of this.events.keys()) this.remove(id)
    this.accumulator = 0
  }
}
