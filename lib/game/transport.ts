import { createUnit, prepareUnit, troopSeats, isVehicle, isAir, type BattleState, type Side, type Unit } from './types'
import { Navigation } from './navigation'
import { distance, travel } from './movement'
import { missionFuel, serviceBase } from './sustainment'
import { mobHelipad, mobHelipadHold, releaseMobHelipad, reserveMobHelipad } from './mob'

export const UNLOAD_INTERVAL = 1
export const MAX_WALK_DISTANCE = 500
const PICKUP_STANDOFF = 14
const PICKUP_BOARDING_RANGE = 18
// APCs and IFVs can carry a squad through explicit Get In orders, but remain
// maneuver units under autonomous command. Dedicated carriers service the
// automatic transport pool.
const automaticCarrier = (unit: Unit) => unit.role === 'TROOP_TRUCK' || unit.role === 'TRANSPORT_HELI'
const pickupPoint = (carrier: Unit, squad: Unit, nav: Navigation) => {
  const offset = [...`${carrier.id}:${squad.id}`].reduce((value, char) => (value + char.charCodeAt(0)) % 8, 0)
  const candidates = Array.from({ length: 8 }, (_, index) => {
    const angle = (index + offset) * Math.PI / 4
    return nav.nearest({ x: squad.x + Math.sin(angle) * PICKUP_STANDOFF, y: squad.y + Math.cos(angle) * PICKUP_STANDOFF })
  }).filter(point => nav.covered(point) && nav.clear(point, point) && distance(point, squad) <= PICKUP_BOARDING_RANGE)
  return candidates.sort((a, b) => distance(carrier, a) - distance(carrier, b) || a.x - b.x || a.y - b.y)[0]
}
export const activeTroops = (squad: Unit) => squad.soldiers?.filter(s => s.status === 'active').length || 0
export const transportSquad = (squad: Unit) => squad.hp > 0 && !isVehicle(squad.role) && !['COMMAND', 'PILOT', 'LOGISTICS'].includes(squad.role) && activeTroops(squad) > 0
export function transportBlockReason(state: BattleState, squad: Unit) {
  if(squad.mission!=='WAITING FOR TRANSPORT'||!squad.transportIntent)return undefined
  const destination = destinationFor(state, squad)
  if (!destination || distance(squad, destination) <= MAX_WALK_DISTANCE) return undefined
  if (state.units.some(c => c.hp > 0 && c.transport?.passengers?.includes(squad.id))) return undefined
  const attached = state.units.filter(c => c.side === squad.side && (c.attachedSquad === squad.id || squad.attachedVehicles?.includes(c.id)))
  const pool = state.units.filter(c => c.side === squad.side && !c.external && (automaticCarrier(c) || attached.includes(c)) && troopSeats(c.role) >= activeTroops(squad))
  const healthy = pool.filter(c => c.hp > 0 && !c.crewBailed && !c.emergency)
  if (!healthy.length) return 'no operational personnel carrier is available'
  const fueled = healthy.filter(c => c.fuel >= missionFuel(c, destination, squad, state))
  if (!fueled.length) return 'available personnel carriers lack mission fuel'
  if (!fueled.some(c => !c.servicing && (!c.transport || ['available', 'escort'].includes(c.transport.phase)))) return 'personnel carriers are committed or servicing'
  const assembled=state.units.filter(other=>transportSquad(other)&&!other.carrier&&other.side===squad.side&&other.target===squad.target&&distance(other,squad)<=150).reduce((total,other)=>total+activeTroops(other),0)
  if (fueled.every(c => c.role === 'TRANSPORT_HELI') && assembled < 12) return 'fewer than 12 troops are assembled for helicopter transport'
  return undefined
}
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
export function nearestPersonnelCarrier(state: BattleState, squad: Unit, range = 150) {
  if (!transportSquad(squad) || squad.carrier) return undefined
  const destination = destinationFor(state, squad) || squad
  return state.units.filter(carrier => carrier.side === squad.side && carrier.hp > 0 && !carrier.crewBailed && !carrier.external && !carrier.servicing && !carrier.emergency && troopSeats(carrier.role) >= activeTroops(squad)
    && (!carrier.attachedSquad || carrier.attachedSquad === squad.id) && (!carrier.transport || ['available', 'escort'].includes(carrier.transport.phase)) && !carrier.transport?.passengers?.length
    && carrier.fuel >= missionFuel(carrier, destination, squad, state) && distance(carrier, squad) <= range).sort((a, b) => distance(a, squad) - distance(b, squad) || a.id.localeCompare(b.id))[0]
}
export function manualGetIn(state: BattleState, side: Side, squadId: string, carrierId?: string) {
  const squad = state.units.find(u => u.id === squadId)
  if (!squad || squad.side !== side || !transportSquad(squad) || squad.carrier) return false
  const carrier = nearestPersonnelCarrier(state, squad)
  if (!carrier || carrierId && carrier.id !== carrierId) return false
  const destination = destinationFor(state, squad) || { x: squad.x, y: squad.y }
  if (squad.path.length || !squad.transportIntent) squad.transportIntent = { destination: { ...destination }, mission: intendedMission(squad), target: squad.target }
  carrier.attachedSquad = squad.id
  squad.attachedVehicles = [...new Set([...(squad.attachedVehicles || []), carrier.id])]
  carrier.transport = { phase: 'pickup', since: state.time, destination: { ...destination }, passengers: [squad.id], home: { ...serviceBase(carrier, state, destination) }, manual: true, mobPad: squad.target === 'MOB' }
  carrier.path = []; carrier.target = squad.target; squad.path = []; squad.mission = 'WAITING FOR TRANSPORT'
  return true
}
function detach(state: BattleState, carrier: Unit) {
  if (carrier.attachedSquad) {
    const squad = state.units.find(u => u.id === carrier.attachedSquad)
    if (squad) squad.attachedVehicles = squad.attachedVehicles?.filter(id => id !== carrier.id)
  }
  carrier.attachedSquad = undefined
}
function bailCrew(state: BattleState, carrier: Unit, nav: Navigation) {
  if (carrier.crewBailed || carrier.members <= 0) return true
  const exit = nav.nearest({ x: carrier.x - Math.cos(carrier.heading) * 6, y: carrier.y + Math.sin(carrier.heading) * 6 })
  if (!nav.covered(exit) || !nav.clear(exit, exit)) { carrier.travelStatus = 'WAITING FOR SAFE CREW EXIT'; return false }
  const count = carrier.members, crew = createUnit(carrier.side, 'PILOT', `${carrier.id}-crew-${Math.floor(state.time * 20)}`, exit)
  crew.name = `${carrier.name} crew`; crew.maxMembers = count; crew.members = count; crew.heading = carrier.heading; crew.mission = 'DISMOUNTED CREW'; crew.subcommand = 'VEHICLE CREW'
  prepareUnit(crew); crew.altitude = 0
  for (const soldier of crew.soldiers || []) Object.assign(soldier, exit, { heading: carrier.heading, aim: carrier.heading })
  state.units.push(crew); carrier.crewBailed = true; carrier.members = 0; carrier.engine = false; carrier.path = []; carrier.mission = 'CREW DISMOUNTED'; carrier.serviceStatus = 'CREW DISMOUNTED'
  if (carrier.transport) { carrier.transport.phase = 'abandoned'; carrier.transport.passengers = []; carrier.transport.dismountCrew = undefined }
  detach(state, carrier)
  return true
}
export function requestDismount(state: BattleState, nav: Navigation, side: Side, unitId: string, includeCrew = false) {
  const selected = state.units.find(u => u.id === unitId)
  if (!selected || selected.side !== side || selected.hp <= 0) return false
  const carrier = troopSeats(selected.role) ? selected : selected.carrier ? state.units.find(u => u.id === selected.carrier) : state.units.find(u => selected.attachedVehicles?.includes(u.id))
  if (!carrier || carrier.side !== side || carrier.hp <= 0 || carrier.crewBailed || !troopSeats(carrier.role)) return false
  const passengers = state.units.filter(s => s.carrier === carrier.id && s.hp > 0)
  if (!passengers.length) return includeCrew && !isAir(carrier.role) ? bailCrew(state, carrier, nav) : false
  if (carrier.transport && ['landing', 'disembarking'].includes(carrier.transport.phase)) { if (includeCrew) carrier.transport.dismountCrew = true; return false }
  carrier.path = []; carrier.engine = isAir(carrier.role); carrier.transport ??= { phase: 'available', since: state.time, passengers: [] }
  carrier.transport.passengers = passengers.map(s => s.id); carrier.transport.dismountCrew = includeCrew; carrier.transport.unloaded = 0; carrier.transport.lastUnload = state.time
  if (isAir(carrier.role)) { carrier.transport.destination = { x: carrier.x, y: carrier.y }; carrier.transport.phase = 'landing' }
  else { carrier.engine = false; carrier.transport.phase = 'disembarking' }
  carrier.transport.since = state.time
  return true
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
  // Attached vehicles are the squad's first transport choice. They stay owned
  // by the squad and return to escort after this automatic movement cycle.
  for (const squad of [...eligible].sort((a, b) => a.id.localeCompare(b.id))) {
    const destination = destinationFor(state, squad)
    if (!destination || reserved.has(squad.id) || distance(squad, destination) <= MAX_WALK_DISTANCE) continue
    const carrier = state.units.filter(c => c.side === squad.side && c.hp > 0 && !c.crewBailed && !c.external && !c.servicing && !c.emergency && troopSeats(c.role) >= activeTroops(squad)
      && (c.attachedSquad === squad.id || squad.attachedVehicles?.includes(c.id)) && (!c.transport || ['available', 'escort'].includes(c.transport.phase))
      && !c.transport?.passengers?.length && distance(c, squad) <= 150 && c.fuel >= missionFuel(c, destination, squad, state))
      .sort((a, b) => distance(a, squad) - distance(b, squad) || a.id.localeCompare(b.id))[0]
    if (!carrier) continue
    carrier.attachedSquad = squad.id
    squad.attachedVehicles = [...new Set([...(squad.attachedVehicles || []), carrier.id])]
    carrier.transport = { phase: 'pickup', since: state.time, destination: { ...destination }, passengers: [squad.id], home: { ...serviceBase(carrier, state, destination) }, manual: true, autoDismount: true, mobPad: squad.target === 'MOB' }
    carrier.path = []; carrier.target = squad.target; squad.path = []; squad.mission = 'WAITING FOR TRANSPORT'; reserved.add(squad.id)
  }
  const available = state.units.filter(c => c.hp > 0 && !c.crewBailed && !c.external && !c.servicing && !c.emergency && !c.attachedSquad && automaticCarrier(c) && (!c.transport || c.transport.phase === 'available'))
    .sort((a, b) => Number(b.role === 'TRANSPORT_HELI') - Number(a.role === 'TRANSPORT_HELI') || a.id.localeCompare(b.id))
  for (const carrier of available) {
    const seats = troopSeats(carrier.role)
    for (const lead of [...eligible].sort((a, b) => distance(carrier, a) - distance(carrier, b) || a.id.localeCompare(b.id))) {
      const destination = destinationFor(state, lead)
      if (reserved.has(lead.id) || lead.side !== carrier.side || !destination || distance(lead, destination) <= MAX_WALK_DISTANCE || carrier.fuel < missionFuel(carrier, destination, lead, state)) continue
      let occupied = 0
      const passengers: Unit[] = []
      for (const squad of [lead, ...eligible.filter(s => s !== lead)]) {
        const troops = activeTroops(squad)
        if (squad.side !== carrier.side || squad.target !== lead.target || reserved.has(squad.id) || !squad.transportIntent || distance(squad, lead) > 150 || occupied + troops > seats) continue
        passengers.push(squad); occupied += troops
      }
      if (occupied < (carrier.role === 'TRANSPORT_HELI' ? seats / 2 : 1)) continue
      for (const squad of passengers) { reserved.add(squad.id); squad.path = []; squad.mission = 'WAITING FOR TRANSPORT' }
      carrier.transport = { phase: 'pickup', since: state.time, destination: { ...destination }, passengers: passengers.map(s => s.id), home: { ...serviceBase(carrier, state, destination) }, mobPad: lead.target === 'MOB' }
      carrier.path = []; carrier.target = lead.target
      break
    }
  }
}
export function updateTransports(state: BattleState, nav: Navigation) {
  for (const u of state.units) {
    if (!troopSeats(u.role) || u.hp <= 0 || u.crewBailed || u.servicing || u.emergency) continue
    const m = u.transport
    if (!m) continue
    if (m.phase === 'available' && !automaticCarrier(u) && !m.manual && !u.attachedSquad) { u.transport = undefined; continue }
    if (m.phase === 'available') { u.mission = u.role === 'TRANSPORT_HELI' ? 'WAITING FOR 12–24 TROOPS' : 'AVAILABLE'; continue }
    const helicopter = u.role === 'TRANSPORT_HELI'
    const passengers = state.units.filter(s => m.passengers?.includes(s.id) && s.hp > 0 && s.side === u.side)
    const boarded = passengers.filter(s => s.carrier === u.id), aboard = boarded.reduce((n, s) => n + activeTroops(s), 0)
    const lead = passengers.find(s => !s.carrier)
    const phase = (name: string) => {
      m.phase = name; m.since = state.time; u.path = []
      if (!['pickup', 'boarding'].includes(name)) { m.pickup = undefined; m.pickupFor = undefined }
    }
    u.engine = true; u.mission = m.phase.toUpperCase()
    if (!passengers.length && !['return', 'escort'].includes(m.phase)) phase('return')
    if (!lead && ['pickup', 'boarding'].includes(m.phase)) {
      if (!aboard || (helicopter && aboard < 12 && !m.manual)) phase('return')
      else { m.dispatchTroops = aboard; phase('transit') }
    }
    if (m.phase === 'pickup' && lead) {
      if (m.pickupFor !== lead.id || !m.pickup) { m.pickup = pickupPoint(u, lead, nav); m.pickupFor = lead.id }
      if (!m.pickup) {
        u.travelStatus = 'WAITING FOR SAFE PICKUP POINT'
        if (state.time - m.since > 180) phase('return')
      }
      else if (travel(u, m.pickup, nav, state.time, undefined, 0)) phase('boarding')
      else if (state.time - m.since > 180) phase('return')
    } else if (m.phase === 'boarding' && lead && state.time - m.since >= 5) {
      if (distance(u, lead) > PICKUP_BOARDING_RANGE || (u.altitude || 0) > .1) { m.pickup = undefined; m.pickupFor = undefined; phase('pickup'); continue }
      if (aboard + activeTroops(lead) > troopSeats(u.role)) { phase('return'); continue }
      lead.carrier = u.id; lead.path = []; lead.mission = 'EMBARKED'
      for (const body of lead.soldiers || []) body.disembarked = undefined
      if (passengers.some(s => !s.carrier)) phase('pickup')
      else {
        const troops = aboard + activeTroops(lead)
        if (helicopter && troops < troopSeats(u.role) / 2 && !m.manual) phase('return')
        else { m.dispatchTroops = troops; phase('transit') }
      }
    } else if (m.phase === 'transit' && m.destination) {
      const pad=helicopter&&m.mobPad?mobHelipad(u.side):undefined
      if(pad&&distance(u,pad)<=180&&!reserveMobHelipad(state,u.side,u.id)){u.travelStatus='HOLDING FOR MOB HELIPAD';travel(u,mobHelipadHold(u.side,u.id),nav,state.time,undefined,85);continue}
      if (travel(u, pad||m.destination, nav, state.time, undefined, isAir(u.role) ? 85 : 0)) phase(m.manual && !m.autoDismount ? 'attached-hold' : 'landing')
    } else if (m.phase === 'attached-hold') {
      u.engine = helicopter; u.path = []; u.mission = helicopter ? 'HOLDING FOR DISMOUNT' : 'AWAITING DISMOUNT'
    } else if (m.phase === 'landing' && m.destination) {
      if (helicopter && !m.manual && (aboard < 12 || (m.dispatchTroops || 0) < 12)) { phase('return'); continue }
      if(helicopter&&m.mobPad&&distance(u,mobHelipad(u.side))>180){travel(u,mobHelipad(u.side),nav,state.time,undefined,85);continue}
      if(helicopter&&m.mobPad&&!reserveMobHelipad(state,u.side,u.id)){u.travelStatus='HOLDING FOR MOB HELIPAD';travel(u,mobHelipadHold(u.side,u.id),nav,state.time,undefined,85);continue}
      const landing = m.mobPad ? mobHelipad(u.side) : nav.nearest(m.destination)
      if(helicopter&&m.mobPad&&distance(u,landing)>3){travel(u,landing,nav,state.time,undefined,85);continue}
      if (!nav.covered(landing) || !nav.clear(landing, landing)) { u.travelStatus = 'WAITING FOR LANDING ZONE'; continue }
      if (travel(u, landing, nav, state.time, undefined, 0)) { phase('disembarking'); m.unloaded = 0; m.lastUnload = state.time }
    } else if (m.phase === 'disembarking') {
      u.engine = false
      if ((u.altitude || 0) > .1 || (helicopter && !m.manual && (m.dispatchTroops || 0) < 12)) { phase('return'); continue }
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
        m.passengers = []
        if (m.dismountCrew) { if (!bailCrew(state, u, nav)) continue; continue }
        if (m.manual && !helicopter && !u.crewBailed) phase('escort')
        else { releaseMobHelipad(state,u.side,u.id); detach(state, u); phase('return') }
      }
    } else if (m.phase === 'escort') {
      const squad = state.units.find(s => s.id === u.attachedSquad && s.hp > 0)
      if (!squad) { detach(state, u); m.manual = undefined; phase('available') }
      else {
        u.target = squad.target; u.mission = `SUPPORTING ${squad.name}`
        const follow = nav.nearest({ x: squad.x - Math.sin(squad.heading) * 18, y: squad.y - Math.cos(squad.heading) * 18 })
        if (distance(u, follow) > 22) travel(u, follow, nav, state.time, undefined, 0, 4)
        else { u.path = []; u.engine = false }
      }
    } else if (m.phase === 'return') { releaseMobHelipad(state,u.side,u.id); u.servicing = true; u.target = isAir(u.role) ? 'AIRFIELD' : 'MOB' }
    for (const squad of passengers) if (squad.carrier === u.id) {
      squad.x = u.x; squad.y = u.y
      for (const body of squad.soldiers || []) if (body.status === 'active' && !body.disembarked) { body.x = u.x; body.y = u.y }
    }
  }
}

