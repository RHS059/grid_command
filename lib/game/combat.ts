import { isAir, isVehicle, type BattleState, type Unit, type Soldier, type Vec3 } from './types'
import { jammed } from './electronic-warfare'
import { Visibility, lerp3, sphereHit } from './visibility'
import { weaponFor, eligible, damageFor } from './weapons'
export function bodyHeight(s?:Soldier){return s?.stance==='prone'?.42:s?.stance==='crouch'?1.05:1.6}
export function eye(u:Unit,v:Visibility,s?:Soldier):Vec3 {const p=s||u;return {x:p.x,y:p.y,z:v.height(p)+(u.altitude||0)+(isVehicle(u.role)?2:bodyHeight(s))}}
export function canSee(a:Unit,b:Unit,v:Visibility,state:BattleState){if(a.carrier||b.carrier||a.role==='UAV_JAMMER'||jammed(a,b,state))return false;const range=weaponFor(a.role)?.range||950;if(Math.hypot(a.x-b.x,a.y-b.y)>range+80)return false;const sa=a.soldiers?.find(s=>s.status==='active'),sb=b.soldiers?.find(s=>s.status==='active');return v.ray(eye(a,v,sa),eye(b,v,sb),state.smokes,state.time).kind==='clear'}
export function resolveCombat(state:BattleState,v:Visibility,random:()=>number,nextId:()=>number,candidates?:(unit:Unit,range:number)=>Unit[]){
  const living=state.units.filter(u=>u.hp>0&&!u.carrier&&(u.members>0||isVehicle(u.role))),hits=new Map<string,{amount:number;soldier?:string}>()
  for(const missile of state.missiles)if(missile.due<=state.time){const target=living.find(u=>u.id===missile.target);if(target)hits.set(target.id,{amount:(hits.get(target.id)?.amount||0)+missile.damage})}
  state.missiles=state.missiles.filter(m=>m.due>state.time)
  for(const u of living){u.firing=false;const w=weaponFor(u.role);if(!w||u.crewBailed||u.external||u.servicing||u.emergency||u.ammo<(w.id==='aa'?25:w.armor?2:.3)||u.airPhase==='return'||u.airPhase==='rearm')continue
    if((u.cooldown||0)>state.time&&u.role!=='ATTACK_HELI')continue
    const targets=(candidates?candidates(u,w.range):living).filter(e=>e.side!==u.side&&e.hp>0&&!e.carrier&&eligible(w,e)&&Math.hypot(e.x-u.x,e.y-u.y)<=w.range&&canSee(u,e,v,state)).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y)||a.id.localeCompare(b.id));const target=targets[0];if(!target){u.lock=undefined;continue}
    u.aim=Math.atan2(target.x-u.x,target.y-u.y)
    if((u.cooldown||0)>state.time)continue
    if(w.id==='aa'){
      if((u.suppression||0)>.5){u.lock=undefined;continue}
      if(u.lock?.target!==target.id){u.lock={target:target.id,since:state.time};continue}
      if(state.time-u.lock.since<2.5)continue
      const start=eye(u,v,u.soldiers?.find(s=>s.status==='active')),end=eye(target,v),id=nextId(),flight=Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)/w.speed
      state.missiles.push({id,source:u.id,target:target.id,due:state.time+flight,damage:w.damage});state.shots.push({id,time:state.time,unit:u.id,side:u.side,weapon:w.id,start,end,speed:w.speed,size:.3,blast:8,sound:w.sound,spotted:u.spotted});u.ammo=Math.max(0,u.ammo-25);u.cooldown=state.time+w.cooldown;u.firing=true;u.lock=undefined;continue
    }
    const active=u.soldiers?.filter(s=>s.status==='active'&&!s.rescue&&s.action!=='throw')||[],soldier=active.length?active[Math.floor(state.time/w.cooldown)%active.length]:undefined;if(!isVehicle(u.role)&&!soldier)continue
    const enemy=target.soldiers?.find(s=>s.status==='active'),origin=eye(u,v,soldier),start={...origin},aim=eye(target,v,enemy),heading=Math.atan2(aim.x-origin.x,aim.y-origin.y)
    if((u.role==='JET'||u.role==='CAS_FIGHTER')&&Math.abs(Math.atan2(Math.sin(heading-u.heading),Math.cos(heading-u.heading)))>.65)continue
    if(soldier){start.z-=soldier.stance==='stand'?.35:soldier.stance==='crouch'?.15:.1;start.x+=Math.sin(heading)*.85+Math.cos(heading)*.17;start.y+=Math.cos(heading)*.85-Math.sin(heading)*.17}else start.z-=.15
    aim.z-=.25
    if(v.ray(origin,start).kind!=='clear'||v.ray(start,aim,state.smokes,state.time).kind!=='clear')continue
    const d=Math.hypot(aim.x-start.x,aim.y-start.y,aim.z-start.z),scatter=(random()-.5)*(d/w.range)*2.2;const end={x:aim.x+scatter,y:aim.y+(random()-.5)*d/w.range*2,z:aim.z+(random()-.5)*d/w.range*.8}
    let hit=v.ray(start,end,[],state.time),victim:Unit|undefined,hitSoldier:Soldier|undefined
    for(const e of living){if(e.id===u.id||e.side===u.side)continue;const bodies=e.soldiers?.filter(s=>s.status!=='dead')||[];for(const s of bodies.length?bodies:[undefined]){const c=eye(e,v,s);c.z-=isVehicle(e.role)?.8:.45;const t=sphereHit(start,end,c,isVehicle(e.role)?2.2:.65);if(t!==null&&t<hit.t){hit={t,point:lerp3(start,end,t),kind:'unit'};victim=e;hitSoldier=s}}}
    // Mortar paths are sampled as an arc; acquisition still requires direct sight.
    if(w.id==='mortar'){let previous=start;for(let i=1;i<=24;i++){const p=lerp3(start,hit.point,i/24);p.z+=Math.sin(i/24*Math.PI)*d*.22;const block=v.ray(previous,p);if(block.kind!=='clear'){hit={t:hit.t,point:block.point,kind:block.kind};victim=undefined;break}previous=p}}
    u.firing=true;u.aim=Math.atan2(aim.x-start.x,aim.y-start.y);u.cooldown=state.time+w.cooldown;u.ammo=Math.max(0,u.ammo-(w.armor?2:.3));if(soldier){soldier.aim=u.aim;soldier.shotAt=state.time;soldier.action=soldier.cover?'peek':'fire'}
    state.shots.push({id:nextId(),time:state.time,unit:u.id,soldier:soldier?.id,side:u.side,weapon:w.id,start,end:hit.point,speed:w.speed,size:w.size,blast:w.blast,sound:w.sound,spotted:u.spotted})
    const damage=(e:Unit,amount:number,s?:Soldier)=>{const old=hits.get(e.id);hits.set(e.id,{amount:(old?.amount||0)+amount,soldier:s?.id||old?.soldier});e.suppression=Math.min(1,(e.suppression||0)+.22)}
    if(victim&&victim.side!==u.side)damage(victim,damageFor(w,victim,d),hitSoldier)
    if(w.blast)for(const e of living){if(e.side===u.side||e.id===victim?.id)continue;const c=eye(e,v),dist=Math.hypot(c.x-hit.point.x,c.y-hit.point.y,c.z-hit.point.z);if(dist<w.blast&&v.ray({...hit.point,z:hit.point.z+.15},c).kind==='clear')damage(e,damageFor(w,e,d)*(1-dist/w.blast)*.5)}
    target.suppression=Math.min(1,(target.suppression||0)+.05)
  }
  for(const [id,h] of hits){const u=living.find(e=>e.id===id)!;const before=u.members;u.hp=Math.max(0,u.hp-h.amount);const expected=u.hp>0&&!u.crewBailed?Math.ceil(u.maxMembers*u.hp/100):0
    if(u.soldiers?.length){const active=u.soldiers.filter(s=>s.status==='active').sort((a,b)=>Number(b.id===h.soldier)-Number(a.id===h.soldier));for(let i=0;i<Math.max(0,active.length-expected);i++){active[i].status=random()<.6?'downed':'dead';active[i].since=state.time;active[i].rescue=undefined;active[i].action='idle'}u.members=u.soldiers.filter(s=>s.status==='active').length}else u.members=expected
    state.forces[u.side].casualties+=Math.max(0,before-u.members);if(u.hp<=0)u.path=[]
  }
  state.shots=state.shots.filter(e=>state.time-e.time<8).slice(-512)
}

