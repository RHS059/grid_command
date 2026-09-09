import type { BattleState, ContactMemory, Side, Unit } from '../types'
import { commandable, defaultDoctrine, distance, initialFactors, ordered, personality, seeded, trace, type CommandState, type HierarchyState } from './model'
import { readinessSnapshot } from './reporting'

const copy = (c: ContactMemory): ContactMemory => ({ ...c, position: { ...c.position }, observers: [...c.observers] })
export function initializeHierarchy(state: BattleState): HierarchyState {
  const command = (side: Side): CommandState => ({ side, personality: personality(state.seed, `${side}:command`), doctrine: defaultDoctrine(),
    readiness: Object.fromEntries(ordered(state.units.filter(u => u.side === side && commandable(u))).map(u => [u.id, readinessSnapshot(u, state.time)])),
    communications: { delay: 2, loss: .03, available: true }, commanderId: ordered(state.units).find(u => u.side === side && u.role === 'COMMAND' && u.hp > 0)?.id,
    degraded: false, contacts: [], objectives: state.objectives.map(o => ({ id: o.id, x: o.x, y: o.y, owner: null, contested: false, observedAt: -1 })),
    formations: [], nextReview: 0, signature: '', lastReport: {}, receivedAt: {} })
  return { version: 1, sides: { BLU: command('BLU'), RED: command('RED') }, units: {}, reports: [], relays: [], objectiveReports: [], statusReports: [], orders: [], traces: [], nextUpdate: 0 }
}
export function rememberUnit(ai: HierarchyState, state: BattleState, u: Unit) {
  ai.units[u.id] ??= { personality: personality(state.seed, u.id), factors: initialFactors(u, state.time), contacts: [] }
  return ai.units[u.id]
}
export function mergeContact(contacts: ContactMemory[], next: ContactMemory) {
  const index = contacts.findIndex(c => c.unitId === next.unitId)
  if (index < 0) contacts.push(copy(next))
  else if (contacts[index].lastSeen <= next.lastSeen) contacts[index] = copy(next)
  contacts.sort((a, b) => a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0)
}
function ageContacts(contacts: ContactMemory[], time: number, lifetime: number) {
  return contacts.filter(c => time - c.lastSeen <= lifetime).map(c => ({ ...c, confidence: Math.min(c.confidence, Math.max(0, 1 - (time - c.lastSeen) / lifetime)) }))
}

export function updateBlackboards(state: BattleState, ai: HierarchyState) {
  // The perception contact is an observation snapshot. Never resolve its ID against live enemy state.
  for (const side of ['BLU', 'RED'] as const) {
    const command = ai.sides[side], net = command.communications
    const own = ordered(state.units.filter(u => u.side === side && u.hp > 0 && !u.carrier && !u.surrendered && !u.crewBailed && !u.external))
    for (const contact of state.contacts?.[side] || []) {
      const observers = own.filter(u => contact.observers.includes(u.id))
      if (!observers.length || state.time - contact.lastSeen > 1) continue
      for (const observer of observers) mergeContact(rememberUnit(ai, state, observer).contacts, contact)
      const last = command.lastReport[contact.unitId]
      if (last !== undefined && contact.lastSeen - last < 2) continue
      command.lastReport[contact.unitId] = contact.lastSeen
      if (!net.available || seeded(state.seed, `report:${side}:${contact.unitId}:${contact.lastSeen}`) < net.loss) {
        trace(ai, { time: state.time, actor: side, level: 'network', decision: 'REPORT LOST', reasons: ['Observation remains with the observer; radio path unavailable or packet lost.'] }); continue
      }
      ai.reports.push({ side, due: state.time + Math.max(0, net.delay) * (command.degraded ? 2 : 1), contact: copy(contact) })
    }
    for (const objective of command.objectives) {
      // Objective locations are public scenario geography; control changes require local friendly presence.
      if (!own.some(u => distance(u, objective) <= 180)) continue
      const observed = state.objectives.find(o => o.id === objective.id)
      const key = `objective:${objective.id}`
      if (observed && net.available && state.time - (command.lastReport[key] ?? -Infinity) >= 2) {
        command.lastReport[key] = state.time
        if (seeded(state.seed, `${side}:${key}:${state.time}`) >= net.loss)
          ai.objectiveReports.push({ side, due: state.time + net.delay, objective: { ...objective, owner: observed.owner, contested: observed.contested, observedAt: state.time } })
      }
    }
  }
  const waiting = [] as typeof ai.reports
  for (const packet of ai.reports) {
    if (packet.due > state.time) { waiting.push(packet); continue }
    const command = ai.sides[packet.side]
    if (!command.communications.available) continue
    const previous = command.contacts.find(c => c.unitId === packet.contact.unitId)
    if (!previous || previous.lastSeen < packet.contact.lastSeen) {
      mergeContact(command.contacts, packet.contact); command.receivedAt[packet.contact.unitId] = state.time
      if (seeded(state.seed, `relay:${packet.side}:${packet.contact.unitId}:${packet.contact.lastSeen}`) >= command.communications.loss)
        ai.relays.push({ side: packet.side, due: state.time + command.communications.delay, contact: copy(packet.contact) })
    }
  }
  ai.reports = waiting
  for (const packet of ai.objectiveReports.filter(p => p.due <= state.time)) {
    const command = ai.sides[packet.side], objective = command.objectives.find(o => o.id === packet.objective.id)
    if (command.communications.available && objective && packet.objective.observedAt >= objective.observedAt) Object.assign(objective, packet.objective)
  }
  ai.objectiveReports = ai.objectiveReports.filter(p => p.due > state.time)
  for (const relay of ai.relays.filter(p => p.due <= state.time)) {
    if (!ai.sides[relay.side].communications.available) continue
    for (const u of ordered(state.units.filter(u => u.side === relay.side && u.hp > 0 && !u.surrendered && !u.crewBailed && !u.external))) mergeContact(rememberUnit(ai, state, u).contacts, relay.contact)
  }
  ai.relays = ai.relays.filter(p => p.due > state.time)
  for (const side of ['BLU', 'RED'] as const) {
    const command = ai.sides[side]
    command.contacts = ageContacts(command.contacts, state.time, command.doctrine.reportLifetime)
    for (const u of ordered(state.units.filter(u => u.side === side && u.hp > 0))) {
      const mind = rememberUnit(ai, state, u)
      mind.contacts = ageContacts(mind.contacts, state.time, command.doctrine.reportLifetime)
    }
  }
}
