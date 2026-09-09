import { ordered, type CommandState, type OperationalPlan } from './model'

/** Assign whole command branches to distinct objectives; a unit never belongs to two fronts. */
export function allocateFronts(command: CommandState, plan: OperationalPlan) {
  const formations=ordered(command.formations), branches=new Map<string,string[]>()
  for(const formation of formations) {
    const branch=formation.commandPath?.[1]||formation.id
    branches.set(branch,[...(branches.get(branch)||[]),formation.id])
  }
  const targets=[...command.objectives].filter(o=>o.owner!==command.side||o.contested).sort((a,b)=>plan.scores[b.id]-plan.scores[a.id]||a.id.localeCompare(b.id))
  const count=Math.min(Math.max(1,Math.floor(command.doctrine.maxFronts??1)),branches.size,targets.length)
  if(count<2||plan.posture!=='ADVANCE')return
  plan.fronts=targets.slice(0,count).map((target,i)=>({id:`${command.side}:front:${i+1}`,target:{...target},formationIds:[]}))
  let index=0
  for(const branch of [...branches.keys()].sort())plan.fronts[index++%count].formationIds.push(...branches.get(branch)!)
  plan.reasons.push(`${count} simultaneous objective fronts; command branches remain intact and reserve assignments remain exclusive.`)
}

export function formationPlan(plan: OperationalPlan, formationId: string): OperationalPlan {
  const front=plan.fronts?.find(f=>f.formationIds.includes(formationId))
  return front?{...plan,target:front.target}:plan
}
