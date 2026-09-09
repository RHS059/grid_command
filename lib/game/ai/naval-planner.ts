import { isNaval, type Unit } from '../types'
import type { CommandState, Mission } from './model'
/** Authored intent and received reports only; no enemy ID is resolved against live world truth. */
export function navalMission(unit:Unit,command:CommandState,mission:Mission):Mission{
  if(!isNaval(unit.role))return mission
  const directive: import('../maritime-navigation').NavalDirective=structuredClone(unit.navalDirective??{mode:unit.role==='FRIGATE'?'AIR_DEFENSE':'PATROL',waypoints:[{x:unit.x,y:unit.y}]})
  let destination=directive.waypoints?.[0]??{x:unit.x,y:unit.y}
  if(directive.mode==='ESCORT')destination=command.readiness[directive.escortId??'']?.position??destination
  if(directive.mode==='SURFACE_STRIKE'){
    const contact=[...command.contacts].filter(c=>c.confidence>.3).sort((a,b)=>b.lastSeen-a.lastSeen||a.unitId.localeCompare(b.unitId))[0]
    // Fire from the authored station; physical visibility and weapon range decide whether a shot exists.
    if(contact)mission.reasons.push(`Surface fire station covers received contact ${contact.unitId} observed at ${contact.lastSeen}.`)
  }
  return {...mission,task:mission.task==='RESUPPLY'?'RESUPPLY':'SUPPORT',destination,naval:directive}
}
