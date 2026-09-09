import { vehicleResources } from './sustainment'
import { CATALOG, isNaval, isVehicle, type BattleState, type Point, type Unit } from './types'
import { maritimeRoute, type NavalDirective } from './maritime-navigation'
import { distance, type Mission } from './ai/model'
import { recordExecution } from './ai/reporting'
import type { Navigation } from './navigation'

export const maritimeCapacity=(u:Unit)=>u.role==='LANDING_CRAFT'?24:u.role==='AMPHIBIOUS_APC'?8:0
const routeFor=(s:BattleState,u:Unit,p:Point)=>{const direct=s.maritime&&maritimeRoute(s.maritime,u,p);if(direct)return direct;if(u.role!=='AMPHIBIOUS_APC'||!s.maritime)return null;const link=s.maritime.landings.find(l=>distance(u,l.shore)<25);const route=link&&maritimeRoute(s.maritime,link.water,p);return route&&link?[link.water,...route]:null}
const nearestPort=(s:BattleState,u:Unit)=>s.maritime?.ports.filter(p=>p.side===u.side).sort((a,b)=>distance(a.position,u)-distance(b.position,u)||a.id.localeCompare(b.id))[0]
export function acceptMaritimeMission(state:BattleState,u:Unit,mission:Mission){
  const block=(reason:string)=>{recordExecution(state,u,mission,'BLOCKED',reason,state.time+10);return false}
  if(!state.maritime)return block('No authored navigable water or port network.')
  if(u.maritime?.passengers.length)return block('Embarked passengers retain dedicated lift controller ownership.')
  const directive:NavalDirective=mission.task==='RESUPPLY'?{mode:'PATROL'}:mission.naval??u.navalDirective??{mode:'PATROL' as const,waypoints:[mission.destination]}
  const pickup=state.maritime.landings.find(l=>l.id===directive.pickupId)
  const destination=mission.task==='RESUPPLY'?nearestPort(state,u)?.position:directive.mode==='AMPHIBIOUS_LIFT'?pickup?.water:directive.waypoints?.[0]??mission.destination
  if(!destination)return block('Required port, waypoint or pickup is missing.')
  const route=routeFor(state,u,destination),port=nearestPort(state,u)
  if(!route||!port)return block('No navigable route and friendly recovery port.')
  const recovery=maritimeRoute(state.maritime,destination,port.position)
  const length=(points:Point[],start:Point)=>points.reduce((sum,p,i)=>sum+distance(i?points[i-1]:start,p),0)
  if(!recovery||!(mission.task==='RESUPPLY'&&distance(u,port.position)<5)&&u.fuel<15+(length(route,u)+length(recovery,destination))/1000)return block('Insufficient route and recovery fuel reserve.')
  if(directive.mode==='PATROL'&&directive.waypoints){let previous:Point=u,total=0;for(const point of directive.waypoints){const leg=previous===u?routeFor(state,u,point):maritimeRoute(state.maritime,previous,point);if(!leg)return block('A patrol leg is not navigable.');total+=length(leg,previous);previous=point}const home=maritimeRoute(state.maritime,previous,port.position);if(!home||u.fuel<15+(total+length(home,previous))/1000)return block('Insufficient complete patrol and recovery reserve.')}
  let passengers:string[]=[]
  if(directive.mode==='AMPHIBIOUS_LIFT'){
    const landing=state.maritime.landings.find(l=>l.id===directive.landingId)
    if(!pickup||!landing||!maritimeRoute(state.maritime,pickup.water,landing.water))return block('No validated lift destination.')
    passengers=[...new Set(directive.passengerIds??[])].sort()
    const squads=passengers.map(id=>state.units.find(s=>s.id===id))
    if(!squads.length||squads.some(s=>!s||s.side!==u.side||isVehicle(s.role)||s.hp<=0||s.carrier||s.transportIntent||distance(s,pickup.shore)>40)||squads.reduce((n,s)=>n+(s!.soldiers?.filter(x=>x.status==='active').length??0),0)>maritimeCapacity(u))return block('Lift requires available nearby infantry within physical passenger capacity.')
    const transit=maritimeRoute(state.maritime,pickup.water,landing.water),returnRoute=maritimeRoute(state.maritime,landing.water,port.position)
    if(!transit||!returnRoute||u.fuel<15+(length(route,u)+length(transit,pickup.water)+length(returnRoute,landing.water))/1000)return block('Insufficient fuel for complete lift and recovery.')
    if(state.units.some(c=>c.id!==u.id&&c.maritime?.passengers.some(id=>passengers.includes(id))))return block('Passenger already reserved by another lift.')
  }
  for(const id of passengers){const squad=state.units.find(s=>s.id===id)!;squad.mission='BOARDING';squad.path=[]}
  u.navalDirective=structuredClone(directive);u.maritime={order:structuredClone(mission),revision:mission.revision,phase:mission.task==='RESUPPLY'?'service':directive.mode==='AMPHIBIOUS_LIFT'?'pickup':'sailing',waypoint:0,since:state.time,passengers};u.path=route;u.target=mission.target;u.mission=directive.mode
  recordExecution(state,u,mission,'ACCEPTED','Navigable water, local readiness, recovery reserve and passenger ownership checked.');return true
}

/** The unit controller owns physical execution; commanders see its outcomes only in delayed reports. */
export function updateMaritime(state:BattleState,nav:Navigation,dt:number){
  if(!state.maritime)return
  for(const u of state.units.filter(u=>isNaval(u.role))){
    const run=u.maritime,mission=run?.order??state.behavior?.units[u.id]?.mission
    u.engine=false
    if(!run)continue
    const finish=(reason:string)=>{if(mission)recordExecution(state,u,mission,'COMPLETED',reason);run.phase='complete';u.path=[]}
    if(u.hp<=0){run.occupants=[];run.passengers=[];continue}
    if(run.phase==='complete')continue
    if(mission&&state.time>mission.expiresAt&&!run.passengers.some(id=>state.units.find(s=>s.id===id)?.carrier===u.id)){u.path=[];run.passengers=[];run.occupants=[];run.phase='complete';recordExecution(state,u,mission,'EXPIRED','Maritime intent expired.');continue}
    const morale=state.behavior?.units[u.id]?.factors.morale??.8
    if((u.fuel<20||u.hp<30||morale<.2)&&!run.passengers.length&&run.phase!=='service'){
      const port=nearestPort(state,u),route=port&&routeFor(state,u,port.position)
      if(route){u.path=route;run.phase='service';if(mission)recordExecution(state,u,mission,'BLOCKED','Local readiness requires recovery to a supplied port.',state.time+30)}
    }
    if(u.path.length&&u.fuel>0){const p=u.path[0],d=distance(u,p),step=Math.min(d,CATALOG[u.role].speed*dt*(u.hp<30?.5:1));const next={x:u.x+(p.x-u.x)*step/Math.max(d,.001),y:u.y+(p.y-u.y)*step/Math.max(d,.001)}
      const shoreLink=u.role==='AMPHIBIOUS_APC'&&state.maritime.landings.some(l=>distance(u,l.water)+distance(u,l.shore)<=distance(l.water,l.shore)+.2&&nav.covered(l.shore)&&nav.clear(l.shore,l.shore))
      if((maritimeRoute(state.maritime,u,next)||shoreLink)&&!state.units.some(other=>other!==u&&other.hp>0&&isNaval(other.role)&&distance(other,next)<6)){u.heading=Math.atan2(p.x-u.x,p.y-u.y);Object.assign(u,next);u.engine=true;if(d<=step+.01)u.path.shift()}
      for(const id of run.passengers){const s=state.units.find(s=>s.id===id);if(s?.carrier===u.id){s.x=u.x;s.y=u.y}}
      continue
    }
    if(u.path.length)continue
    const directive=u.navalDirective!
    if(run.phase==='service'){
      const port=nearestPort(state,u);if(!port||distance(u,port.position)>5)continue
      for(const [resource,field]of[['fuel','fuel'],['ammo','ammo'],['repair','hp']]as const){const capacity=vehicleResources(u.role)[resource];if(capacity<=0)continue;const amount=Math.min(port.stock[resource],(100-u[field])/100*capacity,dt*2/100*capacity);port.stock[resource]-=amount;u[field]+=amount/capacity*100}
      if(u.fuel>=80&&(vehicleResources(u.role).ammo===0||u.ammo>=80)&&u.hp>=65)finish('Resources restored by consuming friendly port stock.')
      continue
    }
    if(run.phase==='pickup'||run.phase==='landing'||run.phase==='beach'){
      const landing=state.maritime.landings.find(l=>l.id===(run.phase==='pickup'?directive.pickupId:directive.landingId))
      if(!landing||!nav.covered(landing.shore)||!nav.clear(landing.shore,landing.shore)){for(const o of run.occupants??[])if(o.phase==='mounting'||o.phase==='dismounting')o.startedAt=state.time;if(mission)recordExecution(state,u,mission,'BLOCKED','Landing shore is not known traversable.',state.time+10);continue}
      if(u.role==='AMPHIBIOUS_APC'&&run.phase!=='pickup'&&distance(u,landing.shore)>.1){run.phase='beach';const d=distance(u,landing.shore),step=Math.min(d,3*dt);if(u.fuel<=0)continue;u.heading=Math.atan2(landing.shore.x-u.x,landing.shore.y-u.y);u.x+=(landing.shore.x-u.x)*step/d;u.y+=(landing.shore.y-u.y)*step/d;u.engine=true;continue}
      const boarding=run.phase==='pickup',pending=run.passengers.map(id=>state.units.find(s=>s.id===id)).filter((s):s is Unit=>!!s&&s.hp>0&&(boarding?!s.carrier:s.carrier===u.id))
      if(pending.length){const squad=pending[0];if(boarding&&distance(squad,landing.shore)>2){const route=nav.route(squad,landing.shore);if(!route)continue;const p=route[0]??landing.shore,d=distance(squad,p),step=Math.min(d,3*dt);const old={x:squad.x,y:squad.y};squad.x+=(p.x-squad.x)*step/Math.max(d,.001);squad.y+=(p.y-squad.y)*step/Math.max(d,.001);for(const s of squad.soldiers??[]){s.x+=squad.x-old.x;s.y+=squad.y-old.y}continue}
        run.occupants??=[]
        const bodies=(squad.soldiers??[]).filter(s=>s.status==='active').sort((a,b)=>a.id.localeCompare(b.id))
        const body=boarding?bodies.find(s=>!run.occupants!.some(o=>o.soldierId===s.id&&o.phase==='seated')):bodies.find(s=>!s.disembarked)
        if(body){let occupant=run.occupants.find(o=>o.soldierId===body.id)
          if(!occupant){occupant={soldierId:body.id,squadId:squad.id,seatId:`naval-${run.occupants.length}`,phase:'mounting',startedAt:state.time};run.occupants.push(occupant)}
          if(!boarding&&occupant.phase!=='dismounting'){occupant.phase='dismounting';occupant.startedAt=state.time}
          if(state.time-occupant.startedAt<80/24)continue
          if(boarding)occupant.phase='seated';else{body.x=landing.shore.x;body.y=landing.shore.y;body.disembarked=true;run.occupants=run.occupants.filter(o=>o!==occupant)}
          continue
        }
        squad.carrier=boarding?u.id:undefined;const position=boarding?u:landing.shore;squad.x=position.x;squad.y=position.y
        for(const body of bodies){body.x=squad.x;body.y=squad.y;body.path=[];body.disembarked=undefined} squad.path=[];if(!boarding)squad.mission='HOLD';continue
      }
      if(boarding){const destination=state.maritime.landings.find(l=>l.id===directive.landingId)!;const route=maritimeRoute(state.maritime,u,destination.water);if(route){u.path=route;run.phase='landing'}}else{run.passengers=[];finish('All surviving passengers physically landed on known traversable shore.')}continue
    }
    if(directive.mode==='PATROL'&&directive.waypoints?.length){run.waypoint++;if(run.waypoint>=directive.waypoints.length){finish('Completed every ordered patrol waypoint.');continue}u.path=routeFor(state,u,directive.waypoints[run.waypoint])??[]}
    else if(directive.mode==='ESCORT'){
      const report=state.behavior?.sides[u.side].readiness[directive.escortId??''];if(report?.position&&state.time-report.observedAt<45&&distance(u,report.position)>80)u.path=routeFor(state,u,report.position)??[]
    }
    else if(directive.mode==='SURFACE_STRIKE'&&(state.behavior?.units[u.id]?.lastFiredAt??-Infinity)>=run.since)finish('Locally executed surface fire; destruction is not assumed.')
  }
}
