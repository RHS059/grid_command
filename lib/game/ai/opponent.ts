import { CATALOG } from '../types'
import { clamp, distance, type CommandState } from './model'

/** Credibility and intent hypotheses use observation history only, never enemy live state or decoy flags. */
export function updateOpponentModel(command:CommandState,time:number) {
  command.opponent??={}
  const active=new Set(command.contacts.map(c=>c.unitId))
  for(const id of Object.keys(command.opponent))if(!active.has(id))delete command.opponent[id]
  for(const contact of command.contacts) {
    const old=command.opponent[contact.unitId],dt=old?contact.lastSeen-old.observedAt:0
    const speed=CATALOG[contact.role].speed,corroboration=new Set(contact.observers).size
    let credibility=old?.credibility??.65
    const reasons:string[]=[]
    if(dt>0&&old&&distance(old.position,contact.position)>Math.max(50,speed*dt*2)) {credibility=Math.max(.1,credibility-.3);reasons.push('Reported displacement exceeds the generous kinematic envelope; alternate identification remains possible.')}
    else if(!old||dt>0){credibility=clamp(credibility+(corroboration>=2?.1:0));reasons.push(corroboration>=2?'Independent observer corroboration.':'Single-source observation; uncorroborated identity remains uncertain.')}
    const hypotheses:Record<string,number>={unknown:1}
    if(old&&dt>0)for(const objective of command.objectives){
      const approach=distance(old.position,objective)-distance(contact.position,objective)
      hypotheses[objective.id]=Math.max(0,approach/Math.max(1,speed*dt))
    }
    const total=Object.values(hypotheses).reduce((a,b)=>a+b,0)
    command.opponent[contact.unitId]={position:{...contact.position},observedAt:contact.lastSeen,credibility,
      uncertaintyMeters:10+Math.max(0,time-contact.lastSeen)*speed,intent:dt>0?Object.fromEntries(Object.entries(hypotheses).map(([id,v])=>[id,v/total])):old?.intent||{unknown:1},reasons:reasons.length?reasons:old?.reasons||[]}
  }
}
