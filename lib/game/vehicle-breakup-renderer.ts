import * as T from './scene-data'
import { VehicleBreakupSystem, VEHICLE_BREAKUP_LIMITS } from './vehicle-breakup'
import { VehicleBreakupModels } from './vehicle-breakup-models'
import { createAircraft, disposeModel } from './aircraft-models'
import { createSupportModel, isSupportModel } from './support-models'
import { vehicleGeometry } from './unit-models'
import { isAir, isVehicle, type BattleState, type Casualty, type Graphics, type Vec3 } from './types'

type Ground = (point: { id: string; x: number; y: number }) => number
type Motion = { time: number; position: Vec3; velocity: Vec3 }
/** Owns the casualty-to-fracture handoff. The simulation and live animation keep their own trees. */
export class BattlefieldVehicleBreakup {
  readonly system = new VehicleBreakupSystem()
  readonly models: VehicleBreakupModels
  private readonly handled = new Set<string>()
  private readonly motion = new Map<string, Motion>()
  private readonly shards: T.InstancedMesh
  private readonly blasts: T.InstancedMesh
  private readonly dummy = new T.Object3D()
  private previousTime = -1
  private previousStateTime = -1
  constructor(private readonly scene: T.Scene) {
    this.models = new VehicleBreakupModels(scene)
    this.shards = new T.InstancedMesh(new T.BoxGeometry(1, .4, .2), new T.MeshStandardMaterial({ color: '#655348', roughness: .9, emissive: '#e4470c', emissiveIntensity: .35 }), VEHICLE_BREAKUP_LIMITS.maxCosmeticShards)
    this.shards.name = 'vehicle-breakup-shards'; this.shards.count = 0; this.shards.userData.disableShadow = true; this.shards.userData.vehicleEffect = true
    this.blasts = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshBasicMaterial({ color: '#ff8130', transparent: true, opacity: .4, blending: T.AdditiveBlending, depthWrite: false }), VEHICLE_BREAKUP_LIMITS.maxEvents)
    this.blasts.name = 'vehicle-breakup-blasts'; this.blasts.count = 0; this.blasts.userData.vehicleEffect = true
    scene.add(this.shards, this.blasts)
  }
  /** Only retained fracture events replace the ordinary persistent casualty wreck. */
  has(id: string) { return this.system.events.has(id) }
  private create(casualty: Casualty, state: BattleState, time: number, ground: Ground, aircraft: ReadonlyMap<string, T.Group>, graphics: Graphics) {
    let source = aircraft.get(casualty.id), temporary = false
    if (!source) {
      temporary = true
      if (isAir(casualty.role)) source = createAircraft(casualty.role, casualty.side)
      else if (isSupportModel(casualty.role)) source = createSupportModel(casualty.role, casualty.side)
      else {
        source = new T.Group()
        const material = new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .9 })
        source.add(new T.Mesh(vehicleGeometry(casualty.role, casualty.side), material))
        if (['CANNON_APC', 'IFV'].includes(casualty.role)) source.add(new T.Mesh(vehicleGeometry(casualty.role, casualty.side, true), material))
      }
    }
    const sections = this.models.prepare(casualty.role, casualty.side, source)
    const height = ground(casualty), sample = this.motion.get(casualty.id)
    const event = this.system.begin({ id: casualty.id, sections, position: { x: casualty.x, y: casualty.y, z: height + casualty.altitude + .1 },
      rotation: { x: 0, y: 0, z: -casualty.heading }, velocity: sample?.velocity,
      seed: state.seed ^ Math.round(casualty.time * 1000), destruction: 1, groundZ: height,
      pieceCount: graphics.performanceMode || graphics.quality === 'performance' ? 4 : 8,
      shardCount: graphics.performanceMode || graphics.quality === 'performance' ? 16 : graphics.quality === 'high' ? 48 : 24 })
    if (temporary) disposeModel(source)
    if (event) {
      this.handled.add(casualty.id)
      if (!temporary) { source.visible = false; source.userData.intactColliderEnabled = false }
      // Fracture gear is authored deployed. Omit it in flight until fracture rigs can
      // preserve the articulated source pose, rather than showing deployed wheels.
      if (casualty.role === 'JET' && casualty.altitude > 5) {
        const desired = event.sections.filter(piece => piece.selected).length
        for (const piece of event.sections) if (/^gear_[NLR]$/.test(piece.id)) { piece.phase = 'removed'; piece.colliderEnabled = false; piece.selected = false }
        let selected = event.sections.filter(piece => piece.selected).length
        for (const piece of event.sections) if (piece.phase !== 'removed' && !piece.selected && selected < desired) { piece.selected = true; selected++ }
      }
      // Old wrecks first observed later enter as resting sections, without a new explosion.
      if (time - casualty.time > 2) {
        event.age = Math.min(time - casualty.time, VEHICLE_BREAKUP_LIMITS.wreckLifetime)
        event.intactColliderEnabled = false; event.emittedShards = true
        for (const piece of event.sections) if (piece.phase !== 'removed') { piece.phase = 'static'; piece.colliderEnabled = true; piece.velocity = { x: 0, y: 0, z: 0 }; piece.position.z = height + Math.max(piece.halfExtents.z, piece.position.z - height - casualty.altitude) }
      }
      this.models.attach(event, casualty.role, casualty.side)
    }
    this.motion.delete(casualty.id)
  }
  update(state: BattleState, time: number, ground: Ground, visible: (casualty: Casualty) => boolean, aircraft: ReadonlyMap<string, T.Group>, graphics: Graphics) {
    // Extrapolated render time can move backward on pause or snapshot arrival.
    // Only an authoritative simulation rewind starts a new breakup lifecycle.
    if (this.previousStateTime > state.time) { this.system.clear(); this.handled.clear(); this.motion.clear(); this.previousTime = -1 }
    this.previousStateTime = state.time
    const dt = this.previousTime < 0 || state.paused ? 0 : Math.max(0, time - this.previousTime)
    // Do not integrate the same extrapolated interval twice after a correction.
    this.previousTime = Math.max(this.previousTime, time)
    const present = new Set(state.casualties.filter(casualty => isVehicle(casualty.role)).map(casualty => casualty.id))
    for (const id of this.handled) if (!present.has(id)) { this.handled.delete(id); this.system.remove(id) }
    const living = new Set<string>()
    for (const unit of state.units) if (unit.hp > 0 && isVehicle(unit.role)) {
      living.add(unit.id)
      const previous = this.motion.get(unit.id), position = { x: unit.x, y: unit.y, z: unit.altitude ?? 0 }
      if (!previous) this.motion.set(unit.id, { time: state.time, position, velocity: { x: 0, y: 0, z: 0 } })
      else if (state.time > previous.time) {
        const elapsed = state.time - previous.time
        this.motion.set(unit.id, { time: state.time, position, velocity: { x: (position.x - previous.position.x) / elapsed, y: (position.y - previous.position.y) / elapsed, z: (position.z - previous.position.z) / elapsed } })
      }
    }
    // Limit mesh/template creation too: simultaneous losses cannot build all assets in one frame.
    let created = 0
    for (const casualty of state.casualties) {
      if (!isVehicle(casualty.role) || this.handled.has(casualty.id) || !visible(casualty)) continue
      if (time - casualty.time >= VEHICLE_BREAKUP_LIMITS.wreckLifetime) { this.handled.add(casualty.id); continue }
      if (created++ < 1) this.create(casualty, state, time, ground, aircraft, graphics)
    }
    for (const id of this.motion.keys()) if (!living.has(id) && !present.has(id)) this.motion.delete(id)
    this.system.update(dt, (x, y) => ground({ id: `breakup-ground-${Math.floor(x / 4)}-${Math.floor(y / 4)}`, x, y }))
    this.models.retain(this.system.events)
    const byId = new Map(state.casualties.map(casualty => [casualty.id, casualty]))
    let shardCount = 0, blastCount = 0
    for (const event of this.system.events.values()) {
      const casualty = byId.get(event.id), show = !!casualty && graphics.models && visible(casualty)
      this.models.sync(event, show, graphics.shadows && !graphics.performanceMode)
      if (!show) continue
      for (const shard of event.shards) {
        this.dummy.position.copy(shard.position); this.dummy.rotation.set(shard.age * 9, shard.age * 7, shard.age * 5)
        this.dummy.scale.setScalar(.08 + .06 * (shardCount % 3)); this.dummy.updateMatrix()
        this.shards.setMatrixAt(shardCount++, this.dummy.matrix)
      }
      if (event.emittedShards && event.age < .55) {
        const radius = Math.sin(Math.min(1, event.age / .55) * Math.PI) * 4
        this.dummy.position.copy(event.origin); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.setScalar(radius); this.dummy.updateMatrix()
        this.blasts.setMatrixAt(blastCount++, this.dummy.matrix)
      }
    }
    this.shards.count = shardCount; this.shards.visible = shardCount > 0; this.shards.instanceMatrix.needsUpdate = shardCount > 0
    this.blasts.count = blastCount; this.blasts.visible = blastCount > 0; this.blasts.instanceMatrix.needsUpdate = blastCount > 0
  }
  dispose() {
    this.system.clear(); this.models.dispose(); this.motion.clear(); this.handled.clear()
    this.scene.remove(this.shards, this.blasts); disposeModel(this.shards); disposeModel(this.blasts)
  }
}
