import { navalMission } from './naval-planner'
import { BASES, type Side, type Unit } from '../types'
import { distance, ordered, type CommandState, type Formation, type Mission, type OperationalPlan } from './model'
import { commandDelay, validateFormations } from './organization'
import { formationPlan } from './fronts'

/** Scenario-authored names and unit membership; no nation-specific organization is invented. */
export function configureFormations(command: CommandState, formations: Formation[], own: Unit[]) {
  if (command.plan) throw new Error('Configure scenario formations before operational planning starts.')
  validateFormations(command, formations, own)
  command.organization = undefined
  command.formations = ordered(formations).map(f => ({ id: f.id, name: f.name, unitIds: [...f.unitIds].sort() }))
}

export function assignFormations(command: CommandState, own: Unit[], side: Side) {
  // Preserve explicit scenario organizations and stable existing assignments across losses/reinforcement.
  const assigned = new Set(command.formations.flatMap(f => f.unitIds))
  for (const unit of ordered(own).filter(u => !assigned.has(u.id))) {
    let formation = command.formations.find(f => f.unitIds.length < 3 && f.automatic)
    if (!formation) {
      const id = `${side}:auto:${command.formations.length + 1}`, root = command.organization?.find(n => n.parentId === undefined)
      formation = { id, name: `Maneuver group ${command.formations.length + 1}`, unitIds: [], automatic: true, ...(root ? { commandPath: [root.id, id] } : {}) }; command.formations.push(formation)
    }
    formation.unitIds.push(unit.id)
  }
}

export function decomposeMission(side: Side, time: number, plan: OperationalPlan, command: CommandState, formation: Formation, own: Unit[]): Mission[] {
  plan = formationPlan(plan, formation.id)
  const members = ordered(own.filter(u => formation.unitIds.includes(u.id)))
  const support = members.some(u => ['MG', 'MORTAR', 'IFV', 'CANNON_APC', 'TANK'].includes(u.role) && u.ammo >= 12)
  const nearThreat = command.contacts.some(c => c.confidence > .3 && distance(c.position, plan.target) < 500)
  return members.map((unit, slot) => {
    const reserve = plan.reserveIds.includes(unit.id), recovering = unit.ammo < 12 || unit.hp < 25 || plan.posture === 'RECOVER'
    const task: Mission['task'] = recovering ? 'RESUPPLY' : reserve ? 'RESERVE' : plan.posture === 'DEFEND' ? 'WITHDRAW' : ['SCOUT', 'RECON_UAV'].includes(unit.role) ? 'RECON' : ['MG', 'MORTAR', 'MEDIC', 'AA_TEAM'].includes(unit.role) ? 'SUPPORT' : 'ASSAULT'
    const sign = side === 'BLU' ? -1 : 1
    const destination = ['RESUPPLY', 'WITHDRAW', 'RESERVE'].includes(task) ? { ...BASES[side] } : {
      x: plan.target.x + (slot - 1) * 24,
      y: plan.target.y + sign * (task === 'SUPPORT' ? unit.role === 'MORTAR' ? 380 : 150 : task === 'RECON' ? 100 : 20),
    }
    // Support receives its task first. This is a sequencing window, not a guarantee of suppression.
    const synchronization = task === 'ASSAULT' && nearThreat && support ? 4 : 0
    return navalMission(unit, command, { revision: plan.revision, unitId: unit.id, issuer: formation.id, target: plan.target.id, destination, action: plan.action, task,
      issuedAt: time, executeAt: time + commandDelay(command, unit.id, true) + synchronization,
      expiresAt: time + command.doctrine.orderLifetime, initiative: command.personality.initiative * (command.degraded ? .65 : 1),
      ...(formation.commandPath ? { commandPath: [...formation.commandPath] } : {}),
      reasons: [`${formation.name}: ${task.toLowerCase()} within command intent.`, ...(synchronization ? ['Support-first synchronization window before assault.'] : []), ...(nearThreat && !support && task === 'ASSAULT' ? ['Support requested: no ready local fire-support element.'] : [])] })
  })
}
