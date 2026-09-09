import type { Point, Side, Stock } from './types'
export interface MaritimeTheater { water: Point[][]; ports: { id: string; side: Side; position: Point; stock: Stock }[]; landings: { id: string; water: Point; shore: Point }[] }
export interface NavalDirective { mode: 'PATROL' | 'ESCORT' | 'SURFACE_STRIKE' | 'AIR_DEFENSE' | 'AMPHIBIOUS_LIFT'; waypoints?: Point[]; escortId?: string; pickupId?: string; landingId?: string; passengerIds?: string[] }
export function waterAt(theater: MaritimeTheater, p: Point) {
  return theater.water.some(ring => { let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++) { const a=ring[i],b=ring[j]; if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside } return inside })
}
/** Authored navigable water is public terrain knowledge, never an enemy position source. */
export function maritimeRoute(theater: MaritimeTheater, start: Point, end: Point): Point[] | null {
  const clear=(a:Point,b:Point)=>{const n=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/5);for(let i=0;i<=n;i++)if(!waterAt(theater,{x:a.x+(b.x-a.x)*i/Math.max(1,n),y:a.y+(b.y-a.y)*i/Math.max(1,n)}))return false;return true}
  if(!waterAt(theater,start)||!waterAt(theater,end))return null
  if(clear(start,end))return [{...end}]
  const step=25,key=(p:Point)=>`${p.x},${p.y}`, origin={x:Math.round(start.x/step)*step,y:Math.round(start.y/step)*step}
  if(!clear(start,origin))return null
  const open=[origin],came=new Map<string,Point>(),cost=new Map([[key(origin),0]])
  for(let count=0;open.length&&count<12000;count++){
    open.sort((a,b)=>(cost.get(key(a))!+Math.hypot(a.x-end.x,a.y-end.y))-(cost.get(key(b))!+Math.hypot(b.x-end.x,b.y-end.y))||key(a).localeCompare(key(b)))
    const p=open.shift()!;if(Math.hypot(p.x-end.x,p.y-end.y)<40&&clear(p,end)){const path=[end,p];let q=p;while(came.has(key(q))){q=came.get(key(q))!;path.push(q)}return path.reverse()}
    for(const [dx,dy]of[[0,1],[1,0],[0,-1],[-1,0]]){const q={x:p.x+dx*step,y:p.y+dy*step},g=cost.get(key(p))!+step;if(g>20000||g>=(cost.get(key(q))??Infinity)||!clear(p,q))continue;cost.set(key(q),g);came.set(key(q),p);open.push(q)}
  }return null
}
