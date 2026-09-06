import { local, type GeometryPacket, type Point, type Vec3, type Smoke, type TerrainGrid } from './types'
import { sectorKey } from './theater'
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t, z: a.z + (b.z-a.z)*t })
export function inside(p: Point, ring: Point[]) { let yes = false; for(let i=0,j=ring.length-1;i<ring.length;j=i++) { const a=ring[i],b=ring[j]; if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) yes=!yes } return yes }
function segment(a: Point,b: Point,c: Point,d: Point) { const rx=b.x-a.x, ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx; if(Math.abs(den)<1e-9)return null; const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/den; return t>=0&&t<=1&&u>=0&&u<=1?t:null }
export function sphereHit(a: Vec3,b: Vec3,c: Vec3,r: number): number | null { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ox=a.x-c.x,oy=a.y-c.y,oz=a.z-c.z; const aa=dx*dx+dy*dy+dz*dz,bb=2*(dx*ox+dy*oy+dz*oz),cc=ox*ox+oy*oy+oz*oz-r*r,disc=bb*bb-4*aa*cc; if(cc<=0)return 0; if(disc<0||aa===0)return null; const t=(-bb-Math.sqrt(disc))/(2*aa);return t>=0&&t<=1?t:null }
interface Prism { key: string; rings: Point[][]; base: number; roof: number }
export class Visibility {
  buildings = new Map<string,Prism>(); buckets = new Map<string,Set<string>>(); terrain: TerrainGrid | null=null; ready=false; version=0
  sectors = new Map<string, GeometryPacket>()
  import(packet: GeometryPacket) {
    if(packet.evict){this.sectors.delete(packet.evict);this.buildings.clear();this.buckets.clear();const saved=[...this.sectors.values()];this.sectors.clear();for(const old of saved)this.import({...old,evict:undefined})}
    this.sectors.set(packet.sector||'legacy',packet)
    this.terrain=packet.terrain; this.ready=packet.complete; this.version=packet.version
    for(const f of packet.features) { if(f.water||this.buildings.has(f.key))continue; const rings=f.rings.map(r=>r.map(local)), ring=rings[0]; if(!ring?.length)continue; const elevation=f.elevation??this.height(ring[0]); const p={key:f.key,rings,base:elevation+(f.base??0),roof:elevation+(f.roof??6)}; this.buildings.set(f.key,p)
      const xs=ring.map(v=>v.x),ys=ring.map(v=>v.y); for(let x=Math.floor(Math.min(...xs)/100);x<=Math.floor(Math.max(...xs)/100);x++)for(let y=Math.floor(Math.min(...ys)/100);y<=Math.floor(Math.max(...ys)/100);y++){ const key=`${x},${y}`;if(!this.buckets.has(key))this.buckets.set(key,new Set());this.buckets.get(key)!.add(f.key) }
    }
  }
  grid(p: Point) { const g=(this.sectors.get(sectorKey(p))||this.sectors.get('legacy'))?.terrain;return g&&p.x>=g.x&&p.y>=g.y&&p.x<=g.x+(g.width-1)*g.step&&p.y<=g.y+(g.height-1)*g.step?g:undefined }
  covered(p: Point) { return this.ready && !!this.grid(p) }
  height(p: Point) { const g=this.grid(p);if(!g)return 0; const gx=Math.max(0,Math.min(g.width-1.001,(p.x-g.x)/g.step)),gy=Math.max(0,Math.min(g.height-1.001,(p.y-g.y)/g.step)),x=Math.floor(gx),y=Math.floor(gy),fx=gx-x,fy=gy-y; const at=(xx:number,yy:number)=>g.values[yy*g.width+xx]||0;return (at(x,y)*(1-fx)+at(x+1,y)*fx)*(1-fy)+(at(x,y+1)*(1-fx)+at(x+1,y+1)*fx)*fy }
  ray(a: Vec3,b: Vec3,smokes: Smoke[]=[],time=0) {
    let t=1, kind='clear'; if(!this.covered(a)||!this.covered(b))return { t:0,point:a,kind:'unknown' }
    const ids=new Set<string>(),dx=b.x-a.x,dy=b.y-a.y,sx=Math.sign(dx),sy=Math.sign(dy),endX=Math.floor(b.x/100),endY=Math.floor(b.y/100)
    let bx=Math.floor(a.x/100),by=Math.floor(a.y/100),tx=dx?((bx+(sx>0?1:0))*100-a.x)/dx:Infinity,ty=dy?((by+(sy>0?1:0))*100-a.y)/dy:Infinity
    for(let i=0;i<128;i++){this.buckets.get(`${bx},${by}`)?.forEach(id=>ids.add(id));if(bx===endX&&by===endY)break;if(tx<ty){bx+=sx;tx+=100/Math.abs(dx)}else{by+=sy;ty+=100/Math.abs(dy)}}
    for(const id of ids){const p=this.buildings.get(id)!, cuts=[0,1];for(const ring of p.rings)for(let i=0;i<ring.length;i++){const hit=segment(a,b,ring[i],ring[(i+1)%ring.length]);if(hit!==null)cuts.push(hit)}if(b.z!==a.z)for(const z of [p.base,p.roof]){const k=(z-a.z)/(b.z-a.z);if(k>0&&k<1)cuts.push(k)}cuts.sort((x,y)=>x-y)
      for(let i=0;i<cuts.length-1;i++){if(cuts[i]>=t)break;const m=lerp3(a,b,(cuts[i]+cuts[i+1])/2);if(m.z>=p.base&&m.z<=p.roof&&inside(m,p.rings[0])&&!p.rings.slice(1).some(r=>inside(m,r))){t=cuts[i];kind='building';break}}
    }
    const terrainSteps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/5));for(let i=1;i<=terrainSteps;i++){const k=i/terrainSteps;if(k>=t)break;const p=lerp3(a,b,k);if(!this.covered(p))return {t:0,point:a,kind:'unknown'};if(p.z<this.height(p)){t=k;kind='terrain';break}}
    for(const s of smokes){const age=time-s.time;if(age<1||time>s.expires)continue;const radius=Math.min(15,(age-1)*5)*Math.min(1,(s.expires-time)/4);const hit=sphereHit(a,b,{...s,z:s.z+5},radius);if(hit!==null&&hit<t){t=hit;kind='smoke'}}
    return {t,point:lerp3(a,b,t),kind}
  }
  cover(p: Point, enemy: Point): Point | undefined { let best:Point|undefined,score=Infinity;for(const id of this.buckets.get(`${Math.floor(p.x/100)},${Math.floor(p.y/100)}`)||[]){const wall=this.buildings.get(id)!;for(const v of wall.rings[0]){const dx=v.x-enemy.x,dy=v.y-enemy.y,d=Math.hypot(dx,dy)||1,q={x:v.x+dx/d*2,y:v.y+dy/d*2},dist=Math.hypot(q.x-p.x,q.y-p.y);if(dist<45&&dist<score){score=dist;best=q}}}return best }
}
