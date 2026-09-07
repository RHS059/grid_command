import { BASES, local, type GeometryPacket, type Point, type Side } from './types'
import { MOB_YARD } from './mob'
import { CORRIDOR, sectorKey } from './theater'
import { inside } from './visibility'
const CELL = 25
const MOB_GATE = { minX: 40, maxX: MOB_YARD.halfWidth, length: 50 }
const key = (p: Point) => `${Math.floor(p.x/CELL)},${Math.floor(p.y/CELL)}`
const point = (k: string): Point => { const [x,y]=k.split(',').map(Number); return {x:(x+.5)*CELL,y:(y+.5)*CELL} }
const mobYardSide = (p: Point) => (Object.entries(BASES) as [Side, Point][]).find(([, base]) => {
  const x = p.x - base.x, y = p.y - base.y
  return Math.abs(x) <= MOB_YARD.halfWidth && y >= MOB_YARD.minY && y <= MOB_YARD.maxY
})?.[0]
const mobEgress = (side: Side) => ({ x: BASES[side].x + 60, y: BASES[side].y + (side === 'BLU' ? MOB_YARD.maxY + MOB_GATE.length : MOB_YARD.minY - MOB_GATE.length) })
// The slab and a short gate apron are navigation-safe even before their terrain sector arrives.
// BLU exits north and RED exits south, matching each force's route into the theater.
export function insideMobNavigation(p: Point) {
  if (mobYardSide(p)) return true
  return (Object.entries(BASES) as [Side, Point][]).some(([side, base]) => {
    const x = p.x - base.x, y = p.y - base.y
    return x >= MOB_GATE.minX && x <= MOB_GATE.maxX && (side === 'BLU'
      ? y >= MOB_YARD.maxY && y <= MOB_YARD.maxY + MOB_GATE.length
      : y <= MOB_YARD.minY && y >= MOB_YARD.minY - MOB_GATE.length)
  })
}
export class Navigation {
  mask = new Map<string,number>(); polygons = new Set<string>(); sectors = new Map<string,GeometryPacket>(); strict = false
  get count() { return this.mask.size }
  covered(p: Point) { if(insideMobNavigation(p)||!this.strict)return true;const g=(this.sectors.get(sectorKey(p))||this.sectors.get('legacy'))?.terrain;return !!g&&p.x>=g.x&&p.y>=g.y&&p.x<=g.x+(g.width-1)*g.step&&p.y<=g.y+(g.height-1)*g.step }
  importing?: GeometryPacket
  packet(packet: GeometryPacket) { this.strict=true;if(packet.evict){this.sectors.delete(packet.evict);for(const k of this.mask.keys())if(sectorKey(point(k))===packet.evict)this.mask.delete(k);for(const k of this.polygons)if(k.endsWith(`@${packet.evict}`))this.polygons.delete(k)}this.sectors.set(packet.sector||'legacy',packet);this.importing=packet;this.import(packet.features);this.importing=undefined }
  import(features: GeometryPacket['features']) {
    for(const f of features){const id=`${f.key}@${this.importing?.sector||'legacy'}`;if(this.polygons.has(id))continue;this.polygons.add(id);const rings=f.rings.map(r=>r.map(local)),r=rings[0];if(!r?.length)continue
      const g=this.importing?.terrain
      const minX=Math.floor(Math.max(g?.x??-Infinity,Math.min(...r.map(p=>p.x)))/CELL),maxX=Math.floor(Math.min(g?g.x+(g.width-1)*g.step:Infinity,Math.max(...r.map(p=>p.x)))/CELL),minY=Math.floor(Math.max(g?.y??-Infinity,Math.min(...r.map(p=>p.y)))/CELL),maxY=Math.floor(Math.min(g?g.y+(g.height-1)*g.step:Infinity,Math.max(...r.map(p=>p.y)))/CELL)
      for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){const k=`${x},${y}`,p=point(k);if(insideMobNavigation(p)||this.strict&&!this.covered(p))continue;if(inside(p,r)&&!rings.slice(1).some(h=>inside(p,h)))this.mask.set(k,f.water?2:Math.max(1,this.mask.get(k)||0))}
    }
  }
  nearest(p: Point): Point {
    if(insideMobNavigation(p)||!this.covered(p)||!this.mask.has(key(p)))return {x:p.x,y:p.y}
    const cx=Math.floor(p.x/CELL),cy=Math.floor(p.y/CELL)
    for(let r=1;r<20;r++)for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){if(Math.abs(x)!==r&&Math.abs(y)!==r)continue;const q=point(`${cx+x},${cy+y}`);if(this.covered(q)&&(insideMobNavigation(q)||!this.mask.has(key(q))))return q}return {x:p.x,y:p.y}
  }
  clear(a:Point,b:Point){const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/8));for(let i=0;i<=n;i++){const p={x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n};if(!insideMobNavigation(p)&&(!this.covered(p)||this.mask.has(key(p))))return false}return true}
  strategic(from:Point,to:Point):Point[]{
    const closest=(p:Point)=>CORRIDOR.reduce((best,q,i)=>Math.hypot(q.x-p.x,q.y-p.y)<Math.hypot(CORRIDOR[best].x-p.x,CORRIDOR[best].y-p.y)?i:best,0)
    const a=closest(from),b=closest(to),step=a<=b?1:-1,startMob=mobYardSide(from),endMob=mobYardSide(to),path:Point[]=[]
    if(startMob)path.push(mobEgress(startMob))
    if(a!==b)for(let i=a;i!==b+step;i+=step){const p=CORRIDOR[i];if((startMob&&i===a)||(endMob&&i===b))continue;path.push({...p})}
    if(endMob)path.push(mobEgress(endMob));path.push({x:to.x,y:to.y});return path
  }
  route(from:Point,to:Point):Point[]{
    if(Math.hypot(from.x-to.x,from.y-to.y)>2500)return this.strategic(from,to)
    const a=this.nearest(from),b=this.nearest(to);if(!this.covered(a)||!this.covered(b))return [b]
    if(this.clear(a,b))return [b]
    const start=key(a),goal=key(b),cost=new Map([[start,0]]),parents=new Map<string,string>(),closed=new Set<string>(),open=[{key:start,f:0}]
    let attempts=0
    while(open.length&&attempts++<6500){open.sort((a,b)=>b.f-a.f);const current=open.pop()!.key;if(closed.has(current))continue
      if(current===goal){const path:Point[]=[b];let at=goal;while(at!==start){path.push(point(at));at=parents.get(at)!}return path.reverse()}
      closed.add(current);const [x,y]=current.split(',').map(Number),p=point(current)
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const k=`${x+dx},${y+dy}`,q=point(k);if(closed.has(k)||Math.hypot(q.x-a.x,q.y-a.y)>3000||!this.clear(p,q))continue;const g=cost.get(current)!+Math.hypot(dx,dy);if(g<(cost.get(k)??Infinity)){cost.set(k,g);parents.set(k,current);open.push({key:k,f:g+Math.hypot(q.x-b.x,q.y-b.y)/CELL})}}
    }return []
  }
}

