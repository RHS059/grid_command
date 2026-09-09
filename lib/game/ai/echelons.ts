import type { BattleState, Unit } from '../types'
import { planOperation } from './commander'
import { decomposeMission } from './subcommander'
import { commandable, ordered, personality, seeded, trace, type CommandState, type Mission } from './model'

/** Each authored headquarters owns its received picture, planning clock, personality and succession. */
export function initializeEchelons(state: BattleState, root: CommandState) {
  if (!root.organization || root.echelons) return
  root.echelons = {}; root.echelonPackets = []; root.orderSequence = 0
  for (const node of root.organization.filter(n => n.parentId)) {
    const descendants = root.formations.filter(f => f.commandPath?.includes(node.id)).flatMap(f => f.unitIds).sort()
    const command: CommandState = { side: root.side, personality: personality(state.seed, `${root.side}:hq:${node.id}`), doctrine: { ...root.doctrine },
      communications: { ...root.communications }, readiness: {}, contacts: [], objectives: [], formations: [], degraded: false, nextReview: 0, signature: '', lastReport: {}, receivedAt: {} }
    // Initial readiness is an authored scenario briefing; later updates arrive only in packets.
    command.readiness = Object.fromEntries(descendants.filter(id => root.readiness[id]).map(id => [id, structuredClone(root.readiness[id])]))
    command.formations = structuredClone(root.formations.filter(f=>f.commandPath?.includes(node.id))).map(f=>({...f,commandPath:f.commandPath?.slice(f.commandPath.indexOf(node.id))}))
    root.echelons[node.id] = { id: node.id, parentId: node.parentId!, unitIds: descendants, commanderId: node.commanderUnitId,
      succession: 0, command, parentRevision: 0 }
  }
}

export function broadcastEchelonIntent(state: BattleState, root: CommandState, source: string, command: CommandState) {
  if (!command.plan) return
  for (const child of ordered(Object.values(root.echelons || {}).filter(n => n.parentId === source))) {
    const net = command.communications
    if (!root.communications.available || !net.available || seeded(state.seed, `hq:${root.side}:${source}:${child.id}:${command.plan.revision}`) < net.loss) {
      trace(state.behavior!, {time:state.time,actor:source,level:'network',decision:'HQ INTENT LOST',reasons:[`Intent to ${child.id} lost; its prior received intent remains active.`]});continue
    }
    const intent=structuredClone(command.plan),assigned=intent.fronts?.filter(f=>f.formationIds.some(id=>child.command.formations.some(formation=>formation.id===id)))
    if(assigned?.length){intent.fronts=assigned;intent.target=assigned[0].target}
    root.echelonPackets!.push({target:child.id,source,due:state.time+Math.max(0,net.delay)*(command.degraded?2:1),sentAt:state.time,
      plan:intent,contacts:structuredClone(command.contacts),objectives:structuredClone(command.objectives),
      readiness:structuredClone(Object.fromEntries(child.unitIds.filter(id=>command.readiness[id]).map(id=>[id,command.readiness[id]])))})
  }
}

export function advanceEchelons(state: BattleState, root: CommandState, own: Unit[]): Mission[] {
  const missions: Mission[]=[]
  for(const packet of root.echelonStatusReports||[]) {
    const command=root.echelons?.[packet.target]?.command
    if(command&&packet.due<=state.time&&root.communications.available&&command.communications.available&&state.time-packet.report.observedAt<=command.doctrine.reportLifetime&&
      (command.readiness[packet.report.id]?.observedAt??-Infinity)<packet.report.observedAt)command.readiness[packet.report.id]=packet.report
  }
  root.echelonStatusReports=(root.echelonStatusReports||[]).filter(p=>p.due>state.time&&state.time-p.report.observedAt<=root.doctrine.reportLifetime)
  for (const packet of [...(root.echelonPackets || [])].sort((a,b)=>a.due-b.due||a.target.localeCompare(b.target)||a.plan.revision-b.plan.revision)) {
    if (packet.due>state.time)continue
    const node=root.echelons?.[packet.target]
    if(!node||!root.communications.available||!node.command.communications.available||state.time>(packet.plan.expiresAt??packet.sentAt+root.doctrine.orderLifetime)||packet.plan.revision<=node.parentRevision)continue
    node.parentRevision=packet.plan.revision;node.intent=packet.plan
    node.command.contacts=packet.contacts;node.command.objectives=packet.objectives
    for(const report of Object.values(packet.readiness))if((node.command.readiness[report.id]?.observedAt??-Infinity)<report.observedAt)node.command.readiness[report.id]=report
    trace(state.behavior!,{time:state.time,actor:node.id,level:'subcommander',decision:'HQ INTENT RECEIVED',reasons:[`Parent ${packet.source} revision ${packet.plan.revision}; picture sent at ${packet.sentAt}.`]})
  }
  root.echelonPackets=(root.echelonPackets||[]).filter(p=>p.due>state.time&&state.time-p.sentAt<=root.doctrine.orderLifetime)
  for(const node of ordered(Object.values(root.echelons||{}))) {
    const command=node.command,local=ordered(own.filter(u=>node.unitIds.includes(u.id)))
    if(node.commanderId&&!state.units.some(u=>u.id===node.commanderId&&u.hp>0&&!u.surrendered&&!u.crewBailed)) {
      // Loss of the headquarters' own commander is locally observable, not a free report to its parent.
      const occupied=new Set([root.commanderId,...Object.values(root.echelons||{}).filter(n=>n!==node).map(n=>n.commanderId)])
      node.commanderId=local.find(u=>commandable(u)&&!occupied.has(u.id))?.id;node.succession++;command.degraded=true;command.nextReview=Math.max(command.nextReview,state.time+15)
      trace(state.behavior!,{time:state.time,actor:node.id,level:'subcommander',decision:'HQ SUCCESSION',reasons:[`Local successor ${node.commanderId||'unavailable'}; 15-second minimum disruption. Parent knowledge is unchanged.`]})
    }
    if(!node.intent||state.time>(node.intent.expiresAt??node.intent.issuedAt+root.doctrine.orderLifetime)||state.time<command.nextReview)continue
    if(!node.commanderId&&node.succession>0)continue
    command.contacts=command.contacts.filter(c=>state.time-c.lastSeen<=command.doctrine.reportLifetime).map(c=>({...c,confidence:Math.min(c.confidence,Math.max(0,1-(state.time-c.lastSeen)/command.doctrine.reportLifetime))}))
    const allowed=new Set(node.intent.fronts?.map(f=>f.target.id)||[node.intent.target.id])
    const picture={...command,objectives:command.objectives.filter(o=>allowed.has(o.id))}
    const plan=planOperation(root.side,state.time,picture);command.opponent=picture.opponent;if(!plan)continue
    plan.expiresAt=Math.min(plan.expiresAt!,node.intent.expiresAt??node.intent.issuedAt+root.doctrine.orderLifetime)
    // A subordinate may choose execution posture, but it cannot invent permission for another objective.
    plan.reserveIds=[...new Set([...plan.reserveIds,...node.intent.reserveIds.filter(id=>node.unitIds.includes(id))])]
    if(node.intent.posture==='RECOVER'){plan.posture='RECOVER';plan.action='RESUPPLY'}
    command.plan=plan;command.nextReview=plan.reviewAt
    trace(state.behavior!,{time:state.time,actor:node.id,level:'subcommander',decision:`HQ ${plan.posture} ${plan.target.id}`,reasons:plan.reasons,scores:plan.scores})
    const formation=root.formations.find(f=>f.id===node.id)
    if(formation)for(const mission of decomposeMission(root.side,state.time,plan,command,formation,local)) {
      mission.revision=++root.orderSequence!
      mission.expiresAt=Math.min(mission.expiresAt,plan.expiresAt)
      missions.push(mission)
    }
    broadcastEchelonIntent(state,root,node.id,command)
  }
  return missions
}
