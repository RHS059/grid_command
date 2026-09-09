import type { Unit } from '../types'
import { commandable, ordered, type CommandState, type Formation, type OrganizationNode } from './model'

const echelons = ['THEATER', 'CORPS', 'DIVISION', 'BRIGADE', 'BATTALION', 'COMPANY', 'PLATOON', 'SECTION']
const validName = (value: string) => typeof value === 'string' && value.trim().length > 0 && !['__proto__', 'constructor', 'prototype'].includes(value)

export function validateFormations(command: CommandState, formations: Formation[], own: Unit[]) {
  const ids = new Set<string>(), members = new Set<string>()
  const allowed = new Set(own.filter(u => u.side === command.side && commandable(u)).map(u => u.id))
  for (const formation of formations) {
    if (!validName(formation.id) || ids.has(formation.id) || formation.id.includes(':auto:')) throw new Error('Formation IDs must be nonempty, unique and outside the reserved automatic namespace.')
    if (!validName(formation.name)) throw new Error('Formation names must be nonempty.')
    ids.add(formation.id)
    for (const unitId of formation.unitIds) {
      if (!allowed.has(unitId) || members.has(unitId)) throw new Error(`Invalid or multiply assigned unit: ${unitId}`)
      members.add(unitId)
    }
  }
}

/** Validate an authored tree atomically. Echelon labels never invent personnel, equipment or doctrine. */
export function configureOrganization(command: CommandState, nodes: OrganizationNode[], own: Unit[]) {
  if (command.plan) throw new Error('Configure scenario organization before operational planning starts.')
  validateFormations(command, nodes, own)
  if (!nodes.length || nodes.filter(n => n.parentId === undefined).length !== 1) throw new Error('Organization must have exactly one root.')
  const byId = new Map(nodes.map(n => [n.id, n])), commanders = new Set<string>()
  for (const node of nodes) {
    if (!echelons.includes(node.echelon)) throw new Error(`Unknown echelon: ${node.echelon}`)
    if (node.parentId !== undefined) {
      const parent = byId.get(node.parentId)
      if (!parent) throw new Error(`Missing parent for ${node.id}`)
      if (echelons.indexOf(parent.echelon) >= echelons.indexOf(node.echelon)) throw new Error(`Command links must descend in echelon: ${node.id}`)
    }
  }
  // Validate every link before traversing ancestry, including when malformed input contains a cycle.
  for (const node of nodes) {
    if (node.commanderUnitId !== undefined) {
      const leader = own.find(u => u.id === node.commanderUnitId && u.side === command.side && u.hp > 0 && !u.surrendered && !u.crewBailed && !u.external && (u.role === 'COMMAND' || commandable(u)))
      if (!leader || commanders.has(leader.id)) throw new Error(`Invalid or multiply assigned commander: ${node.commanderUnitId}`)
      commanders.add(leader.id)
      if (leader.role !== 'COMMAND') {
        let memberNode = nodes.find(n => n.unitIds.includes(leader.id))
        while (memberNode && memberNode.id !== node.id) memberNode = memberNode.parentId === undefined ? undefined : byId.get(memberNode.parentId)
        if (!memberNode) throw new Error(`Commander ${leader.id} must belong to ${node.id} or a subordinate.`)
      }
    }
  }
  const formations = ordered(nodes).filter(n => n.unitIds.length).map(node => {
    const commandPath = [node.id]
    let parent = node.parentId === undefined ? undefined : byId.get(node.parentId)
    while (parent) { commandPath.unshift(parent.id); parent = parent.parentId === undefined ? undefined : byId.get(parent.parentId) }
    return { id: node.id, name: node.name, unitIds: [...node.unitIds].sort(), commandPath }
  })
  const root = nodes.find(n => n.parentId === undefined)!
  command.organization = ordered(nodes).map(n => ({ ...n, unitIds: [...n.unitIds].sort() }))
  command.formations = formations
  if (root.commanderUnitId) command.commanderId = root.commanderUnitId
}

export function commandDelay(command: CommandState, unitId: string, order = false) {
  const formation = command.formations.find(f => f.unitIds.includes(unitId))
  const hops = formation?.commandPath?.length ?? (order ? 2 : 1)
  return Math.max(0, command.communications.delay) * hops * (command.degraded ? 2 : 1)
}
