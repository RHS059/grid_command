import test from 'node:test'
import assert from 'node:assert/strict'
import { createUnit, initialState, BASES, AIRBASES, lngLat, type BattleState } from '../lib/game/types'
import { Navigation } from '../lib/game/navigation'

test('scenario has equal allocations and a north-south objective chain', () => {
  const state = initialState()
  assert.equal(state.units.filter(u => u.side === 'BLU').length, 1)
  assert.equal(state.units.filter(u => u.side === 'RED').length, 1)
  assert.equal(state.forces.BLU.sp, 2000)
  assert.equal(state.forces.RED.sp, 2000)
  assert.ok(state.objectives.every(o=>o.y>BASES.BLU.y&&o.y<BASES.RED.y));assert.ok(state.objectives.every((o,i)=>i===0||o.y<state.objectives[i-1].y))
})

test('all objectives start neutral for every seed', () => {
  for (const seed of [1, 3701, 987654]) {
    const state = initialState(seed)
    assert.equal(state.objectives.length, 10)
    for (const objective of state.objectives) assert.deepEqual({ owner: objective.owner, capturing: objective.capturing, progress: objective.progress, contested: objective.contested }, { owner: null, capturing: null, progress: 0, contested: false })
    assert.equal(state.forces.BLU.hold, 0); assert.equal(state.forces.RED.hold, 0)
  }
})

test('navigation avoids imported real-polygon masks and validates diagonal edges', () => {
  const nav = new Navigation()
  nav.import([{ key: 'building', water: false, rings: [[lngLat({ x: 350, y: -100 }), lngLat({ x: 450, y: -100 }), lngLat({ x: 450, y: 100 }), lngLat({ x: 350, y: 100 }), lngLat({ x: 350, y: -100 })]] }])
  const start = { x: 200, y: 0 }, goal = { x: 600, y: 0 }
  assert.ok(nav.count > 0)
  assert.equal(nav.clear(start, goal), false)
  const path = nav.route(start, goal)
  assert.ok(path.length > 1)
  let previous = start
  for (const p of path) { assert.ok(nav.clear(previous, p), `blocked segment ${JSON.stringify([previous, p])}`); previous = p }
  assert.deepEqual(path.at(-1), goal)
})

test('water stays blocked inside objective areas', () => {
  const nav = new Navigation(), rings = [[lngLat({ x: -70, y: -70 }), lngLat({ x: 70, y: -70 }), lngLat({ x: 70, y: 70 }), lngLat({ x: -70, y: 70 }), lngLat({ x: -70, y: -70 })]]
  nav.import([{ key: 'objective-building', water: false, rings }]); assert.ok(nav.count > 0)
  nav.import([{ key: 'objective-water', water: true, rings }]); assert.ok(nav.count > 0)
  assert.notDeepEqual(nav.nearest({ x: 0, y: 0 }), { x: 0, y: 0 })
})

test('worker supports pause, fixed stepping, capture thresholds, victory, and deterministic restart', async () => {
  let update: () => void = () => {}, state = initialState()
  const originalInterval = globalThis.setInterval
  const scope = globalThis as unknown as { self: { onmessage: (e: { data: Record<string, unknown> }) => void; postMessage: (s: BattleState) => void } }
  const originalSelf = scope.self
  scope.self = { onmessage: () => {}, postMessage: s => { state = s } }
  globalThis.setInterval = ((fn: () => void) => { update = fn; return 0 }) as unknown as typeof setInterval
  try {
    await import('../lib/game/simulation.worker')
    const send = (type: string, extra: Record<string, unknown> = {}) => scope.self.onmessage({ data: { type, ...extra } })
    send('init', { seed: 3701 }); update(); assert.equal(state.tick, 1)
    send('pause', { value: true }); const paused = state.tick; update(); assert.equal(state.tick, paused)
    send('step'); assert.equal(state.tick, paused + 1)
    send('speed', { value: -10 }); assert.equal(state.speed, 1)
    send('restart', { seed: 123 }); assert.ok(state.objectives.every(o => o.owner === null && o.progress === 0)); for (let i = 0; i < 40; i++) update()
    const first = JSON.stringify({ ...state, workerMs: 0 })
    send('restart', { seed: 123 }); assert.ok(state.objectives.every(o => o.owner === null && o.progress === 0)); for (let i = 0; i < 40; i++) update()
    assert.equal(JSON.stringify({ ...state, workerMs: 0 }), first)

    send('restart', { seed: 3701 })
    for (let i = 0; i < 15000; i++) update()
    assert.equal(state.airfields.BLU.tier, 3); assert.equal(state.airfields.RED.tier, 3)
    assert.ok(state.forces.BLU.sp >= 0); assert.ok(state.forces.RED.sp >= 0)
    send('restart', { seed: 3701 }); state.tick = 100
    const squad = createUnit('BLU', 'RIFLE', 'capture-test'), support = createUnit('BLU', 'AA_TEAM', 'capture-support')
    state.units = [squad, support, ...state.units.filter(u => u.role === 'COMMAND')]
    for (const unit of [squad, support]) {
      Object.assign(unit, { x: state.objectives[2].x, y: state.objectives[2].y, path: [] })
      unit.soldiers!.forEach(s => { s.x = unit.x; s.y = unit.y; s.status = 'active' })
    }
    support.members = 1; support.soldiers![1].status = 'downed'
    for (let i = 0; i < 20; i++) update()
    assert.equal(state.objectives[2].progress, 0)
    support.members = 2; support.soldiers![1].status = 'active'
    for (let i = 0; i < 159; i++) update()
    assert.equal(state.objectives[2].owner, null)
    update(); update(); assert.equal(state.objectives[2].owner, 'BLU')
    state.objectives.forEach(o => { o.owner = 'BLU' }); state.forces.BLU.hold = 59.96
    update(); assert.equal(state.winner, 'BLU')

    send('restart'); state.tick = 3
    state.units.filter(u => u.role === 'COMMAND').forEach(u => { u.hp = 0 })
    update(); assert.equal(state.winner, 'DRAW')
    send('restart'); send('geometry', { packet: { complete: true, version: 1, features: [], terrain: { x: -1800, y: -1100, step: 50, width: 73, height: 45, values: Array(73*45).fill(0) } } })
    assert.equal(state.geometryReady,true)
    const jet=createUnit('BLU','JET','jet-test');state.units=[jet];state.tick=100;jet.x=0;jet.y=0;jet.members=1;jet.fuel=100;jet.ammo=100;jet.servicing=false;const oldX=jet.x,oldY=jet.y;update();assert.ok(jet.x!==oldX||jet.y!==oldY);assert.equal(state.objectives[2].progress,0)
    jet.x=AIRBASES[jet.side].x;jet.y=AIRBASES[jet.side].y;jet.altitude=0;jet.fuel=2;jet.ammo=2;update();assert.equal(jet.airPhase,'rearm');assert.equal(jet.fuel,2)
    state.depots.BLU.airfield={fuel:100,ammo:100,repair:100};update();assert.ok(jet.fuel>2)
    send('restart');assert.equal(state.geometryReady,true);assert.equal(state.shots.length,0)
  } finally { globalThis.setInterval = originalInterval; scope.self = originalSelf }
})
