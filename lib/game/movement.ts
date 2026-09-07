import { moveWithTraffic } from './traffic'
import { CATALOG, isAir, isVehicle, type Point, type Unit } from './types'
import { Navigation } from './navigation'
export const distance = (a:Point,b:Point) => Math.hypot(a.x-b.x,a.y-b.y)
export function travel(u:Unit,to:Point,nav:Navigation,time:number,speed=CATALOG[u.role].speed,altitude=80,arrival=2,reverse=false){
  if(u.hp<=0||u.crewBailed||u.emergency)return false
  if(isVehicle(u.role)&&u.fuel<=0){u.travelStatus='OUT OF FUEL';return false}
  if(isVehicle(u.role))u.engine=true
  const air=isAir(u.role),d=distance(u,to)
  if(d<arrival){if(air&&Math.abs((u.altitude||0)-altitude)>.1){const z=(u.altitude||0)+Math.sign(altitude-(u.altitude||0))*Math.min(1,Math.abs(altitude-(u.altitude||0)));if(moveWithTraffic(u,u,nav,z))u.altitude=z;return false}u.path=[];return true}
  if(!u.path.length||distance(u.path.at(-1)!,to)>4)u.path=air?[{x:to.x,y:to.y}]:nav.route(u,to)
  if(!u.path.length)return false
  let next=u.path[0],segment=distance(u,next)
  if(!air){
    const near={x:u.x+(next.x-u.x)/Math.max(1,segment)*Math.min(400,segment),y:u.y+(next.y-u.y)/Math.max(1,segment)*Math.min(400,segment)}
    if(!nav.covered(u)||!nav.covered(near)){u.travelStatus='WAITING FOR TERRAIN';return false}
    if(!nav.clear(u,near)){
      if((u.routeRetry||0)>time)return false;u.routeRetry=time+2
      const detour=nav.route(u,near);if(!detour.length){u.travelStatus='ROUTE OBSTRUCTED';return false}
      u.path=[...detour,...u.path];next=u.path[0];segment=distance(u,next)
    }
  }
  const step=Math.min(segment,speed*.05),p={x:u.x+(next.x-u.x)/Math.max(.001,segment)*step,y:u.y+(next.y-u.y)/Math.max(.001,segment)*step}
  if(!air&&!nav.clear(u,p))return false
  const z=air?(u.altitude||0)+Math.max(-.6,Math.min(.6,altitude-(u.altitude||0))):0
  if(!moveWithTraffic(u,p,nav,z,reverse)){u.travelStatus='YIELDING TO TRAFFIC';return false}
  u.travelStatus=undefined;if(distance(u,next)<.1)u.path.shift()
  if(air)u.altitude=z
  return false
}

