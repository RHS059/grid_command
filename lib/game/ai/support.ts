import { BASES, isNaval, type BattleState } from '../types'
import { distance, ordered, trace, type CommandState, type Mission, type SupportAllocation } from './model'

export const supportCapabilities = { ground: ['FIRE','MEDICAL'], air: ['FIRE'], logistics: ['AMMO'], naval: ['FIRE'], amphibious: ['FIRE','LIFT'] } as const
const active=(a:SupportAllocation)=>a.status==='ASSIGNED'||a.status==='ACCEPTED'
export const supportOwns=(command:CommandState,unitId:string)=>command.support?.some(a=>active(a)&&a.unitId===unitId)??false

/** Allocation uses only received reports. Existing controllers retain resource use and actual fulfillment. */
export function allocateSupport(state:BattleState,command:CommandState):Mission[] {
  const missions:Mission[]=[],reports=command.readiness
  command.support??=[]
  for(const allocation of command.support.filter(active)) {
    const asset=reports[allocation.unitId],requester=reports[allocation.requester],execution=asset?.execution
    const previous=allocation.status
    if(state.time>allocation.expiresAt){allocation.status='EXPIRED';allocation.reason='No received fulfillment before allocation expiry.'}
    else if(execution?.revision===allocation.revision) {
      if(execution.status==='BLOCKED'){allocation.status='BLOCKED';allocation.reason=execution.reason}
      else if(execution.status==='ACCEPTED'||execution.status==='COMPLETED') {
        allocation.status='ACCEPTED';allocation.reason='Received local controller acceptance.'
        const fresh=requester&&requester.observedAt>=allocation.assignedAt
        const fulfilled=allocation.kind==='AMMO'?fresh&&requester.ammo>=80&&execution.status==='COMPLETED':allocation.kind==='MEDICAL'?fresh&&requester.hp>=65&&asset.position&&requester.position&&distance(asset.position,requester.position)<80:
          (asset.lastFiredAt??-Infinity)>=Math.max(allocation.assignedAt,execution.changedAt)&&asset.observedAt>=allocation.assignedAt&&asset.position&&requester?.position&&distance(asset.position,requester.position)<1500
        if(fulfilled){allocation.status='FULFILLED';allocation.reason=allocation.kind==='FIRE'?'Received evidence of supporting fire near the requester; suppression is not certified.':`Received restored ${allocation.kind==='AMMO'?'ammunition':'health'} after support acceptance.`}
      }
    }
    if(previous!==allocation.status)trace(state.behavior!,{time:state.time,actor:command.side,level:'commander',decision:`SUPPORT ${allocation.status}`,reasons:[`${allocation.id}: ${allocation.reason}`]})
  }
  command.support=command.support.filter(a=>state.time-a.assignedAt<600).slice(-80)
  if(!command.plan)return missions
  const occupied=new Set(command.support.filter(active).map(a=>a.asset))
  for(const requester of ordered(Object.values(reports)).filter(r=>r.supportRequest&&r.supportRequest.expiresAt>=state.time&&state.time-r.observedAt<=command.doctrine.reportLifetime)) {
    const request=requester.supportRequest!
    if(command.support.some(a=>a.requester===requester.id&&a.kind===request.kind&&(active(a)||state.time-a.assignedAt<10)))continue
    const asset=request.kind==='AMMO'?requester:ordered(Object.values(reports)).filter(r=>r.id!==requester.id&&r.available&&r.hp>=25&&r.ammo>=12&&
      state.time-r.observedAt<=command.doctrine.reportLifetime&&!command.plan!.reserveIds.includes(r.id)&&!occupied.has(r.id)&&
      (request.kind==='MEDICAL'?r.role==='MEDIC':['MG','MORTAR','TANK','IFV','CAS_FIGHTER','ATTACK_HELI','FRIGATE','PATROL_BOAT','AMPHIBIOUS_APC'].includes(r.role)))
      .sort((a,b)=>distance(a.position||BASES[command.side],requester.position||BASES[command.side])-distance(b.position||BASES[command.side],requester.position||BASES[command.side])||a.id.localeCompare(b.id))[0]
    const assetId=request.kind==='AMMO'?`depot:${command.side}`:asset?.id
    if(!asset||!assetId||occupied.has(assetId)||supportOwns(command,asset.id))continue
    const target=command.objectives.find(o=>o.id===requester.execution?.target)||command.plan.target
    const mission:Mission={revision:0,unitId:asset.id,issuer:`${command.side}:support`,target:target.id,destination:request.kind==='AMMO'?{...BASES[command.side]}:{...(requester.position||target)},action:request.kind==='AMMO'?'RESUPPLY':'ASSEMBLE',
      task:request.kind==='AMMO'?'RESUPPLY':'SUPPORT',issuedAt:state.time,executeAt:state.time+Math.max(0,command.communications.delay)*2,expiresAt:state.time+command.doctrine.orderLifetime,initiative:command.personality.initiative,
      reasons:[`${request.kind} allocation for reported request from ${requester.id}; existing route, fuel and resource controllers must accept and fulfill.`]}
    if(isNaval(asset.role)&&request.kind==='FIRE'){mission.naval={mode:'SURFACE_STRIKE',waypoints:[{...(asset.position||mission.destination)}]};mission.destination={...(asset.position||mission.destination)}}
    const allocation:SupportAllocation={id:`${requester.id}:${request.kind}:${state.time}`,requester:requester.id,kind:request.kind,asset:assetId,unitId:asset.id,revision:0,assignedAt:state.time,expiresAt:mission.expiresAt,status:'ASSIGNED',reason:'Allocated from received availability; execution acceptance pending.'}
    command.support.push(allocation);occupied.add(assetId);missions.push(mission)
    trace(state.behavior!,{time:state.time,actor:command.side,level:'commander',decision:'SUPPORT ASSIGNED',reasons:[`${allocation.id}: ${assetId}.`]})
  }
  return missions
}
