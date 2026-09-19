/** Run with: node --expose-gc --import tsx tests/vehicle-breakup-profile.ts */
import assert from 'node:assert/strict'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { VehicleBreakupSystem, VEHICLE_BREAKUP_LIMITS } from '../lib/game/vehicle-breakup'

const definitions = Array.from({ length: 20 }, (_, i) => ({
  id: `section-${i}`,
  center: { x: (i % 5 - 2) * 2, y: (Math.floor(i / 5) - 1.5) * 2, z: 0 },
  halfExtents: { x: .8, y: .6, z: .4 },
  mass: 12 + i,
}))
const dt = 1 / 60, measuredFrames = 600, warmups = 3, repetitions = 7

function trial(eventCount: number) {
  const system = new VehicleBreakupSystem()
  const beginAt = performance.now()
  for (let i = 0; i < eventCount; i++) {
    system.begin({ id: `vehicle-${i}`, sections: definitions, position: { x: i % 4 * 8, y: Math.floor(i / 4) * 8, z: 12 },
      velocity: { x: 5, y: -2, z: 0 }, seed: 7100 + i, destruction: 1, pieceCount: 12, shardCount: 48 })
  }
  const beginMs = performance.now() - beginAt
  const timings: number[] = []
  let activePeak = 0, staticPeak = 0, attachedPeak = 0, shardPeak = 0
  for (let i = 0; i < measuredFrames; i++) {
    const start = performance.now()
    system.update(dt)
    timings.push(performance.now() - start)
    const stats = system.stats
    activePeak = Math.max(activePeak, stats.activeBodies)
    staticPeak = Math.max(staticPeak, stats.staticBodies)
    attachedPeak = Math.max(attachedPeak, stats.attachedBodies)
    shardPeak = Math.max(shardPeak, stats.cosmeticShards)
    assert.ok(stats.activeBodies <= VEHICLE_BREAKUP_LIMITS.maxActiveBodies)
    assert.ok(stats.events <= VEHICLE_BREAKUP_LIMITS.maxEvents)
    assert.ok(stats.cosmeticShards <= VEHICLE_BREAKUP_LIMITS.maxCosmeticShards)
  }
  // Cleanup is checked but deliberately excluded from the active-window timings.
  for (let i = 0; i < Math.ceil((VEHICLE_BREAKUP_LIMITS.wreckLifetime + 1) / dt); i++) system.update(dt)
  assert.equal(system.stats.events, 0)
  assert.equal(system.stats.activeBodies, 0)
  assert.equal(system.stats.staticBodies, 0)
  assert.equal(system.stats.attachedBodies, 0)
  assert.equal(system.stats.cosmeticShards, 0)
  return { beginMs, timings, activePeak, staticPeak, attachedPeak, shardPeak, retainedPool: system.stats.pooledBodies, retainedShardPool: system.stats.pooledShards }
}

const rounded = (value: number) => Number(value.toFixed(4))
const percentile = (sorted: number[], fraction: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
const scenarios = []
for (const eventCount of [1, VEHICLE_BREAKUP_LIMITS.maxEvents]) {
  for (let i = 0; i < warmups; i++) trial(eventCount)
  global.gc?.()
  const before = process.memoryUsage().heapUsed
  const runs = Array.from({ length: repetitions }, () => trial(eventCount))
  const sorted = runs.flatMap(run => run.timings).sort((a, b) => a - b)
  global.gc?.()
  scenarios.push({
    simultaneousEvents: eventCount,
    authoredSectionsPerEvent: definitions.length,
    requestedDynamicSectionsPerEvent: 12,
    requestedCosmeticShardsPerEvent: 48,
    measuredUpdates: sorted.length,
    meanBeginMs: rounded(runs.reduce((sum, run) => sum + run.beginMs, 0) / runs.length),
    updateMs: {
      mean: rounded(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
      p50: rounded(percentile(sorted, .5)),
      p95: rounded(percentile(sorted, .95)),
      p99: rounded(percentile(sorted, .99)),
      max: rounded(sorted[sorted.length - 1]),
    },
    peakActiveBodies: Math.max(...runs.map(run => run.activePeak)),
    peakStaticBodies: Math.max(...runs.map(run => run.staticPeak)),
    peakAttachedBodies: Math.max(...runs.map(run => run.attachedPeak)),
    peakCosmeticShards: Math.max(...runs.map(run => run.shardPeak)),
    retainedPooledBodiesAfterCleanup: Math.max(...runs.map(run => run.retainedPool)),
    retainedPooledShardsAfterCleanup: Math.max(...runs.map(run => run.retainedShardPool)),
    retainedHeapDeltaBytes: process.memoryUsage().heapUsed - before,
    cleanupPassed: true,
  })
}

console.log(JSON.stringify({
  scope: 'CPU-only deterministic controller; excludes renderer, GPU, textures, browser and full-game frame cost',
  environment: { node: process.version, platform: process.platform, architecture: process.arch, cpu: cpus()[0]?.model, explicitGarbageCollection: !!global.gc },
  warmupsPerScenario: warmups, repetitionsPerScenario: repetitions, simulatedSecondsPerMeasuredRun: measuredFrames * dt,
  advisoryCpuBudgetMs: { p95: 1, p99: 2 },
  limits: VEHICLE_BREAKUP_LIMITS,
  scenarios,
}, null, 2))
