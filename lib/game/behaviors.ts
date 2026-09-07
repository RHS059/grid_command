import { moveWithTraffic } from './traffic'
import { isVehicle, type BattleState, type Soldier } from './types'
import { Visibility } from './visibility'
import { Navigation } from './navigation'
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y)
export function updateSoldiers(state:BattleState,v:Visibility,nav:Navigation,nextId:()=>number){
  const down=state.units.flatMap(u=>(u.soldiers||[]).filter(s=>s.status==='downed').map(s=>({s,u})))
  for(const u of state.units){if(isVehicle(u.role)||u.carrier)continue;u.suppression=Math.max(0,(u.suppression||0)-.003)
    const enemy=state.units.filter(e=>e.side!==u.side&&e.hp>0&&e.spotted&&dist(u,e)<900).sort((a,b)=>dist(a,u)-dist(b,u))[0]
    const active=u.soldiers?.filter(s=>s.status==='active')||[]
    for(const [i,s] of (u.soldiers||[]).entries()){
      if(s.status==='downed'){if(state.time-s.since>75){s.status='dead';s.since=state.time}continue}if(s.status==='dead')continue
      if(u.role==='COMMAND'){s.cover=undefined;s.path=[];s.stance='stand';s.action=state.time-s.shotAt<.2?'fire':'idle';continue}
      if(s.rescue){const victim=down.find(d=>d.s.id===s.rescue);if(!victim||victim.s.status!=='downed'||(u.suppression||0)>.85){s.rescue=undefined;continue}const destination=s.cover||nav.nearest({x:s.x+Math.sin(s.heading)*-10,y:s.y+Math.cos(s.heading)*-10});if(dist(s,victim.s)>2){move(s,victim.s,nav,2.3);s.action='walk'}else{const old={x:s.x,y:s.y};move(s,destination,nav,1.2);victim.s.x=old.x;victim.s.y=old.y;s.action='drag';s.stance='crouch';if(dist(s,destination)<2){if(state.units.some(m=>m.side===u.side&&m.role==='MEDIC'&&m.hp>0&&dist(m,s)<90)){victim.s.status='active';victim.s.stance='crouch';victim.s.since=state.time;victim.u.members++;victim.u.hp=Math.min(100,victim.u.hp+100/victim.u.maxMembers);state.forces[u.side].casualties=Math.max(0,state.forces[u.side].casualties-1)}s.rescue=undefined}}continue}
      if(state.tick%20===i%20){const victim=down.find(d=>d.u.side===u.side&&dist(d.s,s)<35&&!state.units.some(g=>g.soldiers?.some(ss=>ss.rescue===d.s.id)));if(victim&&(u.suppression||0)<.8){s.rescue=victim.s.id;s.cover=nav.nearest(v.cover(victim.s,enemy||{x:0,y:0})||{x:s.x-8,y:s.y+8});continue}}
      if(s.action==='throw'&&state.time-s.since<1.1)continue
      if(enemy&&(u.suppression||0)>.3){if(!s.cover&&state.tick%10===i%10){const p=v.cover(s,enemy);if(p&&nav.clear(s,p))s.cover=p}if(s.cover){move(s,s.cover,nav,2.5);s.action=dist(s,s.cover)>1?'cover':'peek';s.stance='crouch'}else{s.stance=(u.suppression||0)>.65?'prone':'crouch';s.action='idle'}s.aim=Math.atan2(enemy.x-s.x,enemy.y-s.y)
        if(i===0&&(u.smoke||0)>0&&(u.suppression||0)>.72&&!state.smokes.some(g=>g.side===u.side&&dist(g,s)<40)){u.smoke!--;s.action='throw';s.since=state.time;const d=dist(s,enemy)||1,x=s.x+(enemy.x-s.x)/d*14,y=s.y+(enemy.y-s.y)/d*14;state.smokes.push({id:nextId(),side:u.side,x,y,z:v.height({x,y}),time:state.time,expires:state.time+25,from:{x:s.x,y:s.y,z:v.height(s)+1.5}})}
      }else{s.cover=undefined;s.stance='stand';const target={x:u.x+(i%3-1)*2.5,y:u.y-Math.floor(i/3)*3};if(dist(s,target)>1){move(s,target,nav,5);s.action='walk'}else{s.action=state.time-s.shotAt<.2?'fire':'idle'}s.aim=enemy?Math.atan2(enemy.x-s.x,enemy.y-s.y):s.heading}
    }
    if(active.length===0)u.hp=0
  }
  state.smokes=state.smokes.filter(s=>s.expires>state.time).slice(-24)
  for(const u of state.units)if(!isVehicle(u.role)&&u.soldiers){u.members=u.soldiers.filter(s=>s.status==='active').length;if(u.members===0)u.hp=0}
}
function move(s:Soldier,p:{x:number;y:number},nav:Navigation,speed:number){
  let target=p
  if(!nav.clear(s,p)){if(!s.path?.length||dist(s.path.at(-1)!,p)>20)s.path=nav.route(s,p);if(!s.path.length)return;target=s.path[0]}
  const d=dist(s,target);if(d<.1){s.path?.shift();return}const step=Math.min(d,speed*.05),next={x:s.x+(target.x-s.x)/d*step,y:s.y+(target.y-s.y)/d*step};if(nav.clear(s,next))moveWithTraffic(s,next,nav)
}

