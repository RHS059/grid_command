import { troopSeats, isVehicle, isAir, type BattleState, type Unit } from './types'
import { Navigation } from './navigation'
import { distance, travel } from './movement'
import { missionFuel, serviceBase } from './sustainment'

export const UNLOAD_INTERVAL = 1
export const MAX_WALK_DISTANCE = 500
export const activeTroops = (squad: Unit) => squad.soldiers?.filter(s => s.status === 'active').length || 0
const transportSquad = (squad: Unit) => squad.hp > 0 && !isVehicle(squad.role) && !['COMMAND', 'PILOT', 'LOGISTICS'].includes(squad.role) && activeTroops(squad) > 0
const intendedMission = (squad: Unit) => !['REPATH', 'WAITING FOR TRANSPORT', 'EMBARKED'].includes(squad.mission) ? squad.mission
  : squad.target === 'MOB' ? 'RESUPPLY' : squad.role === 'MEDIC' ? 'SUPPORT' : ['RIFLE', 'SCOUT', 'AT'].includes(squad.role) ? 'CAPTURE' : 'OVERWATCH'
function destinationFor(state: BattleState, squad: Unit) {
  return squad.path.at(-1) || squad.transportIntent?.destination || (squad.target === 'MOB' ? serviceBase(squad) : state.objectives.find(o => o.id === squad.target))
}
function restoreSquad(squad: Unit, nav?: Navigation) {
  const intent = squad.transportIntent
  squad.carrier = undefined
  squad.mission = intent?.mission || (squad.target === 'MOB' ? 'RESUPPLY' : 'CAPTURE')
  squad.target = intent?.target || squad.target
  const first = squad.soldiers?.find(s => s.status === 'active')
  if (first) { squad.x = first.x; squad.y = first.y }
  squad.path = intent ? nav ? nav.route(squad, intent.destination) : [{ ...intent.destination }] : []
  squad.transportIntent = undefined
  for (const body of squad.soldiers || []) body.disembarked = undefined
}
export function assignTransports(state: BattleState, nav?: Navigation) {
  // Recover living passengers whose carrier was destroyed or removed.
  for (const squad of state.units.filter(s => s.carrier && transportSquad(s))) {
    const carrier = state.units.find(c => c.id === squad.carrier)
    if (!carrier || carrier.hp <= 0 || carrier.crewBailed) {
      if (carrier) { squad.x = carrier.x; squad.y = carrier.y; for (const body of squad.soldiers || []) if (body.status === 'active') { body.x = carrier.x; body.y = carrier.y } }
      squad.carrier = undefined; squad.mission = 'WAITING FOR TRANSPORT'; squad.path = []
    }
  }
  const reserved = new Set(state.units.filter(c => c.hp > 0).flatMap(c => c.transport?.passengers || []))
  const eligible = state.units.filter(s => transportSquad(s) && !s.carrier && !reserved.has(s.id))
  for (const squad of eligible) {
    if (squad.path.length && squad.mission !== 'WAITING FOR TRANSPORT') squad.transportIntent = undefined
    const destination = destinationFor(state, squad)
    if (!destination) continue
    if (squad.mission === 'WAITING FOR TRANSPORT' && !squad.transportIntent) squad.transportIntent = { destination: { ...destination }, mission: intendedMission(squad), target: squad.target }
    if (distance(squad, destination) <= MAX_WALK_DISTANCE) {
      if (squad.transportIntent && !squad.path.length) restoreSquad(squad, nav)
      continue
    }
    if (squad.path.length || !squad.transportIntent) squad.transportIntent = { destination: { ...destination }, mission: intendedMission(squad), target: squad.target }
    squad.path = []; squad.mission = 'WAITING FOR TRANSPORT'
  }
  const available = state.units.filter(c => c.hp > 0 && !c.crewBailed && !c.external && !c.servicing && !c.emergency && troopSeats(c.role) && (!c.transport || c.transport.phase === 'available'))
    .sort((a, b) => Number(b.role === 'TRANSPORT_HELI') - Number(a.role === 'TRANSPORT_HELI') || a.id.localeCompare(b.id))
  for (const carrier of available) {
    const seats = troopSeats(carrier.role)
    for (const lead of [...eligible].sort((a, b) => distance(carrier, a) - distance(carrier, b) || a.id.localeCompare(b.id))) {
      const destination = destinationFor(state, lead)
      if (reserved.has(lead.id) || lead.side !== carrier.side || !destination || distance(lead, destination) <= MAX_WALK_DISTANCE || carrier.fuel < missionFuel(carrier, destination, lead)) continue
      let occupied = 0
      const passengers: Unit[] = []
      for (const squad of [lead, ...eligible.filter(s => s !== lead)]) {
        const troops = activeTroops(squad)
        if (squad.side !== carrier.side || squad.target !== lead.target || reserved.has(squad.id) || !squad.transportIntent || distance(squad, lead) > 150 || occupied + troops > seats) continue
        passengers.push(squad); occupied += troops
      }
      if (occupied < (carrier.role === 'TRANSPORT_HELI' ? seats / 2 : 1)) continue
      for (const squad of passengers) { reserved.add(squad.id); squad.path = []; squad.mission = 'WAITING FOR TRANSPORT' }
      carrier.transport = { phase: 'pickup', since: state.time, destination: { ...destination }, passengers: passengers.map(s => s.id), home: { ...serviceBase(carrier) } }
      carrier.path = []; carrier.target = lead.target
      break
    }
  }
}
export function updateTransports(state: BattleState, nav: Navigation) {
  for (const u of state.units) {
    if (!troopSeats(u.role) || u.hp <= 0 || u.crewBailed || u.servicing || u.emergency) continue
    const m = u.transport
    if (!m || m.phase === 'available') { u.mission = u.role === 'TRANSPORT_HELI' ? 'WAITING FOR 12–24 TROOPS' : 'AVAILABLE'; continue }
    const helicopter = u.role === 'TRANSPORT_HELI'
    const passengers = state.units.filter(s => m.passengers?.includes(s.id) && s.hp > 0 && s.side === u.side)
    const boarded = passengers.filter(s => s.carrier === u.id), aboard = boarded.reduce((n, s) => n + activeTroops(s), 0)
    const lead = passengers.find(s => !s.carrier)
    const phase = (name: string) => { m.phase = name; m.since = state.time; u.path = [] }
    u.engine = true; u.mission = m.phase.toUpperCase()
    if (!passengers.length && m.phase !== 'return') phase('return')
    if (!lead && ['pickup', 'boarding'].includes(m.phase)) {
      if (!aboard || (helicopter && aboard < 12)) phase('return')
      else { m.dispatchTroops = aboard; phase('transit') }
    }
    if (m.phase === 'pickup' && lead) {
      if (travel(u, lead, nav, state.time, undefined, 0)) phase('boarding')
      else if (state.time - m.since > 180) phase('return')
    } else if (m.phase === 'boarding' && lead && state.time - m.since >= 5) {
      if (distance(u, lead) > 5 || (u.altitude || 0) > .1) { phase('pickup'); continue }
      if (aboard + activeTroops(lead) > troopSeats(u.role)) { phase('return'); continue }
      lead.carrier = u.id; lead.path = []; lead.mission = 'EMBARKED'
      for (const body of lead.soldiers || []) body.disembarked = undefined
      if (passengers.some(s => !s.carrier)) phase('pickup')
      else {
        const troops = aboard + activeTroops(lead)
        if (helicopter && troops < troopSeats(u.role) / 2) phase('return')
        else { m.dispatchTroops = troops; phase('transit') }
      }
    } else if (m.phase === 'transit' && m.destination) {
      if (travel(u, m.destination, nav, state.time, undefined, isAir(u.role) ? 85 : 0)) phase('landing')
    } else if (m.phase === 'landing' && m.destination) {
      if (helicopter && (aboard < 12 || (m.dispatchTroops || 0) < 12)) { phase('return'); continue }
      const landing = nav.nearest(m.destination)
      if (!nav.covered(landing) || !nav.clear(landing, landing)) { u.travelStatus = 'WAITING FOR LANDING ZONE'; continue }
      if (travel(u, landing, nav, state.time, undefined, 0)) { phase('disembarking'); m.unloaded = 0; m.lastUnload = state.time }
    } else if (m.phase === 'disembarking') {
      if ((u.altitude || 0) > .1 || (helicopter && (m.dispatchTroops || 0) < 12)) { phase('return'); continue }
      if (state.time - (m.lastUnload ?? m.since) < UNLOAD_INTERVAL) continue
      const body = boarded.flatMap(s => s.soldiers || []).find(s => s.status === 'active' && !s.disembarked)
      if (body) {
        const index = m.unloaded || 0, exit = nav.nearest({ x: u.x + 12 + (index % 6) * 2, y: u.y + 12 + Math.floor(index / 6) * 2 })
        if (!nav.covered(exit) || !nav.clear(exit, exit)) { u.travelStatus = 'WAITING FOR SAFE DISEMBARKATION'; continue }
        Object.assign(body, exit, { disembarked: true, action: 'idle', stance: 'stand' }); m.unloaded = index + 1; m.lastUnload = state.time
        u.mission = `UNLOADING ${m.unloaded} / ${m.dispatchTroops}`
      }
      if (!boarded.some(s => s.soldiers?.some(b => b.status === 'active' && !b.disembarked))) {
        for (const squad of boarded) {
          restoreSquad(squad, nav)
        }
        m.passengers = []; phase('return')
      }
    } else if (m.phase === 'return') { u.servicing = true; u.target = isAir(u.role) ? 'AIRFIELD' : 'MOB' }
    for (const squad of passengers) if (squad.carrier === u.id) {
      squad.x = u.x; squad.y = u.y
      for (const body of squad.soldiers || []) if (body.status === 'active' && !body.disembarked) { body.x = u.x; body.y = u.y }
    }
  }
}

