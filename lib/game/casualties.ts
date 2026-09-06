import { isAir, isVehicle, type BattleState, type Unit, type Side } from './types'
import { Navigation } from './navigation'
import { Visibility } from './visibility'
import { distance } from './movement'
export function recordCasualties(state:BattleState,nav:Navigation,v:Visibility,random:()=>number){
  for(const carrier of state.units){if(carrier.hp>0||carrier.lossProcessed)continue;carrier.lossProcessed=true;carrier.destroyedAt=state.time;carrier.path=[];carrier.firing=false
    for(const squad of state.units.filter(u=>u.carrier===carrier.id)){
      squad.carrier=undefined;squad.path=[];const before=squad.members
      for(const [i,s] of (squad.soldiers||[]).entries())if(s.status==='active'){
        if(s.disembarked){s.disembarked=undefined;continue}
        const p=nav.nearest({x:carrier.x+12+i*2,y:carrier.y+8});Object.assign(s,p)
        if(isAir(carrier.role)||random()<.65||!nav.covered(p)||!nav.clear(p,p)){s.status='dead';s.since=state.time}
      }
      squad.x=carrier.x;squad.y=carrier.y;squad.members=squad.soldiers?.filter(s=>s.status==='active').length||0;squad.hp=squad.members/squad.maxMembers*100;state.forces[squad.side].casualties+=before-squad.members
    }
    if(carrier.transport){carrier.transport.cargo=0;carrier.transport.manifest=undefined;carrier.transport.passengers=[];carrier.transport.phase='destroyed'}
    if(isVehicle(carrier.role))state.casualties.push({id:carrier.id,side:carrier.side,role:carrier.role,x:carrier.x,y:carrier.y,heading:carrier.heading,time:state.time,observed:carrier.spotted?['BLU','RED']:[carrier.side],altitude:carrier.altitude||0})
  }
  for(const u of state.units){for(const s of u.soldiers||[])if(s.status==='dead'&&!state.casualties.some(c=>c.id===s.id))state.casualties.push({id:s.id,side:u.side,role:u.role,soldier:{...s,action:'idle'},x:s.x,y:s.y,heading:s.heading,time:s.since,observed:u.spotted?['BLU','RED']:[u.side],altitude:0})
    if(u.soldiers)u.soldiers=u.soldiers.filter(s=>s.status!=='dead')
  }
  for(const c of state.casualties){if(c.altitude>0)c.altitude=Math.max(0,c.altitude-(8+(state.time-c.time)*9.8)*.05)
    if(state.tick%20===0)for(const side of ['BLU','RED'] as Side[])if(!c.observed.includes(side)&&state.units.some(u=>u.hp>0&&!u.carrier&&u.side===side&&distance(u,c)<700&&v.ray({x:u.x,y:u.y,z:v.height(u)+1.7},{x:c.x,y:c.y,z:v.height(c)+.5}).kind==='clear'))c.observed.push(side)
  }
}
