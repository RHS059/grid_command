import entries from './generated/carrier-entries.json'
import { troopSeats, type BattleState, type Unit } from './types'
import type { Navigation } from './navigation'
import { distance } from './movement'
import { moveWithTraffic } from './traffic'

export const CARRIER_CLIP_SECONDS = 80 / 24
export const carrierEntry = (carrier: Unit, seatId: string) => {
  const p = entries.find(e => e.id === seatId)!
  return { x: carrier.x + Math.cos(carrier.heading) * p.x + Math.sin(carrier.heading) * p.y,
    y: carrier.y - Math.sin(carrier.heading) * p.x + Math.cos(carrier.heading) * p.y }
}
export const carrierActorIds = (state: BattleState) => new Set(state.units.filter(c => c.hp > 0 && !c.crewBailed)
  .flatMap(c => [...(c.transport?.occupants || []), ...(c.maritime?.occupants || [])].filter(o => o.phase !== 'approaching').map(o => o.soldierId)))

export function cleanCarrierOccupants(state: BattleState) {
  for (const squad of state.units) if (squad.mission === 'BOARDING' && !squad.carrier &&
    !state.units.some(c => c.hp > 0 && !c.crewBailed && (c.transport?.phase === 'boarding' && c.transport.passengers?.includes(squad.id) || c.maritime?.passengers.includes(squad.id)))) {
    squad.mission = 'WAITING FOR TRANSPORT'; squad.path = []
  }
  for (const carrier of state.units) {
    const m = carrier.transport
    if (!m?.occupants) continue
    m.occupants = m.occupants.filter(o => {
      const squad = state.units.find(s => s.id === o.squadId)
      const valid = carrier.hp > 0 && !carrier.crewBailed && (squad?.carrier === carrier.id || !carrier.emergency && !carrier.servicing) &&
        !!squad && squad.hp > 0 && !squad.surrendered && !!m.passengers?.includes(o.squadId) &&
        !!squad.soldiers?.some(s => s.id === o.soldierId && s.status === 'active' && !s.disembarked) &&
        (squad.carrier === carrier.id || m.phase === 'boarding')
      if (!valid && squad && !squad.carrier && squad.mission === 'BOARDING') squad.mission = 'WAITING FOR TRANSPORT'
      return valid
    })
  }
}

/** Old snapshots acquire stable identities once, before any casualty or unload can compact seats. */
export function initializeSeated(carrier: Unit, squads: Unit[], time: number) {
  const m = carrier.transport!
  if (m.occupants !== undefined) return
  m.occupants = squads.flatMap(s => (s.soldiers || []).filter(b => b.status === 'active' && !b.disembarked)
    .map(b => ({ soldierId: b.id, squadId: s.id }))).sort((a,b) => a.soldierId.localeCompare(b.soldierId))
    .slice(0, troopSeats(carrier.role)).map((o,i) => ({ ...o, seatId: entries[i].id, phase: 'seated', startedAt: time }))
}

export function mountCarrier(carrier: Unit, squad: Unit, state: BattleState, nav: Navigation) {
  const m = carrier.transport!, bodies = (squad.soldiers || []).filter(s => s.status === 'active').sort((a,b) => a.id.localeCompare(b.id))
  m.occupants ??= []
  const missing = bodies.filter(b => !m.occupants!.some(o => o.soldierId === b.id))
  const free = entries.filter(e => !m.occupants!.some(o => o.seatId === e.id))
  if (missing.length > free.length) return false
  for (const [i,b] of missing.entries()) m.occupants.push({ soldierId: b.id, squadId: squad.id, seatId: free[i].id, phase: 'approaching', startedAt: state.time })
  carrier.path = []; carrier.engine = false
  const dt = Math.min(.1, Math.max(0, state.time - (m.occupantUpdatedAt ?? state.time)))
  m.occupantUpdatedAt = state.time
  for (const o of m.occupants.filter(o => o.squadId === squad.id)) {
    const body = bodies.find(b => b.id === o.soldierId)!, entry = carrierEntry(carrier, o.seatId)
    if (o.phase === 'approaching') {
      if (!nav.covered(entry) || !nav.clear(entry, entry)) { carrier.travelStatus = 'WAITING FOR SAFE BOARDING'; continue }
      if (distance(body, entry) > .05) {
        if (!body.path?.length || distance(body.path.at(-1)!, entry) > .1) body.path = nav.route(body, entry)
        const next = nav.clear(body, entry) ? entry : body.path[0]
        if (!next) continue
        const d = distance(body,next), step = Math.min(d, 3 * dt)
        const p = { x: body.x + (next.x-body.x)*step/Math.max(d,.001), y: body.y+(next.y-body.y)*step/Math.max(d,.001) }
        if (nav.clear(body,p)) moveWithTraffic(body,p,nav)
        if (distance(body,next)<.05) body.path.shift()
        body.action = 'walk'
        continue
      }
      o.phase = 'mounting'; o.startedAt = state.time; body.path = []; body.action = 'idle'
    }
    if (o.phase === 'mounting' && state.time - o.startedAt >= CARRIER_CLIP_SECONDS) o.phase = 'seated'
  }
  return bodies.length > 0 && m.occupants.filter(o => o.squadId === squad.id).every(o => o.phase === 'seated')
}

/** Returns only after one actor has fully exited; no ground copy exists during playback. */
export function dismountCarrier(carrier: Unit, squads: Unit[], state: BattleState, nav: Navigation) {
  const m = carrier.transport!
  initializeSeated(carrier,squads,state.time)
  carrier.path = []; carrier.engine = false
  const o = m.occupants!.find(o => o.phase === 'dismounting') || m.occupants!.find(o => o.phase === 'seated')
  if (!o) return
  const body = squads.find(s => s.id === o.squadId)?.soldiers?.find(s => s.id === o.soldierId)
  if (!body) return
  const exit = carrierEntry(carrier,o.seatId)
  const dx=exit.x-carrier.x,dy=exit.y-carrier.y,d=Math.hypot(dx,dy)
  const rally = {x:exit.x+dx/d*8,y:exit.y+dy/d*8}
  if (!nav.covered(exit) || !nav.clear(exit,exit) || !nav.covered(rally) || !nav.clear(exit,rally)) {
    carrier.travelStatus = 'WAITING FOR SAFE DISEMBARKATION'; return
  }
  if (o.phase === 'seated') { o.phase = 'dismounting'; o.startedAt = state.time; return }
  if (state.time-o.startedAt < CARRIER_CLIP_SECONDS) return
  Object.assign(body,exit,{disembarked:true,action:'walk',stance:'stand',path:[rally]})
  m.occupants = m.occupants!.filter(record => record !== o)
  m.unloaded = (m.unloaded || 0)+1; m.lastUnload = state.time
}
