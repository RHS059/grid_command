import { AIRBASES, BASES, isAir, isVehicle, type BattleState, type Point, type Soldier, type Unit } from './types'
import type { Navigation } from './navigation'
import { sectorKey } from './theater'

type Mover = (Unit | Soldier)
type Body = { id: string; mover: Mover; unit: Unit; x: number; y: number; z: number; heading: number; radius: number; front: number; back: number; height: number; airborne: boolean; fixed: boolean; vx: number; vy: number }
const sessions = new WeakMap<Navigation, Traffic>()
const CELL = 64, DT = .05
const LOGISTICS_ROLES = new Set(['CARGO_PLANE','FORKLIFT','HEAVY_LIFT_HELI','TRUCK'])
const STATIONARY_LOGISTICS_PHASES = new Set(['waiting','loading','unloading','placing','mob-holding','mob-unloading'])
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
function ground(nav: Navigation, p: Point) {
  const g = (nav.sectors.get(sectorKey(p)) || nav.sectors.get('legacy'))?.terrain
  if (!g) return 0
  const x = Math.max(0, Math.min(g.width - 1, Math.round((p.x - g.x) / g.step)))
  const y = Math.max(0, Math.min(g.height - 1, Math.round((p.y - g.y) / g.step)))
  return g.values[y * g.width + x] || 0
}
function segment(body: Body, p: Point = body, heading = body.heading) {
  const x = Math.sin(heading), y = Math.cos(heading)
  return [{ x: p.x + x * body.back, y: p.y + y * body.back }, { x: p.x + x * body.front, y: p.y + y * body.front }] as const
}
function pointSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy) / Math.max(.0001, dx*dx+dy*dy)))
  return Math.hypot(p.x-a.x-t*dx, p.y-a.y-t*dy)
}
function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x)
  const abC = cross(a,b,c), abD = cross(a,b,d), cdA = cross(c,d,a), cdB = cross(c,d,b)
  if (abC*abD < 0 && cdA*cdB < 0) return 0
  return Math.min(pointSegment(a,c,d), pointSegment(b,c,d), pointSegment(c,a,b), pointSegment(d,a,b))
}
function footprint(unit: Unit, air: boolean) {
  if (air) return ['CARGO_PLANE','JET','CAS_FIGHTER'].includes(unit.role) ? { radius: 10, front: 10, back: -10 } : { radius: 7, front: 1.8, back: -1.8 }
  if (unit.role === 'TRUCK') return { radius: 1.5, front: 4.5, back: -4.8 - (unit.transport?.trailers || 0) * 6.2 }
  if (unit.role === 'TROOP_TRUCK') return { radius: 1.15, front: 2.5, back: -2.5 }
  if (unit.role === 'FORKLIFT') return { radius: 1.1, front: 2.8, back: -1.3 }
  if (['TANK','APC','CANNON_APC','IFV'].includes(unit.role)) return { radius: 1.7, front: 4, back: -4 }
  return { radius: 1, front: 1, back: -1 }
}
class Traffic {
  bodies = new Map<string, Body>()
  cells = new Map<string, Set<Body>>()
  constructor(private nav: Navigation, state: BattleState, previous?: Traffic) {
    for (const unit of state.units) {
      if (unit.carrier) {
        for (const s of unit.soldiers || []) if (s.disembarked && s.status !== 'dead') this.add(unit, s, previous)
        continue
      }
      if (isVehicle(unit.role)) {
        if (unit.hp > 0 && !(unit.role === 'CARGO_PLANE' && ['waiting','departed'].includes(unit.transport?.phase || ''))) {
          const home=isAir(unit.role)?AIRBASES[unit.side]:BASES[unit.side]
          const parkedService=!!unit.servicing&&(unit.altitude||0)<=.5&&length(unit,home)<=100
          const garage=Object.values(state.mobs||{}).find(m=>m.garage?.unitId===unit.id)?.garage
          this.add(unit, unit, previous, parkedService || (unit.deployment==='garage' && garage?.phase!=='rollout'))
        }
      } else for (const s of unit.soldiers || []) if (s.status !== 'dead') this.add(unit, s, previous)
    }
  }
  private keys(body: Body) {
    const reach = Math.max(Math.abs(body.back), body.front) + body.radius + 1, keys: string[] = []
    for (let x=Math.floor((body.x-reach)/CELL);x<=Math.floor((body.x+reach)/CELL);x++)
      for (let y=Math.floor((body.y-reach)/CELL);y<=Math.floor((body.y+reach)/CELL);y++) keys.push(`${x},${y}`)
    return keys
  }
  private add(unit: Unit, mover: Mover, previous?: Traffic, parked = false) {
    const vehicle = mover === unit, air = vehicle && isAir(unit.role), old = previous?.bodies.get(mover.id)
    const shape = footprint(unit, air)
    const body: Body = { id: mover.id, mover, unit, x: mover.x, y: mover.y,
      z: ground(this.nav, mover) + (vehicle ? unit.altitude || 0 : 0),
      heading: mover.heading, radius: vehicle ? shape.radius : .48,
      front: vehicle ? shape.front : 0,
      back: vehicle ? shape.back : 0,
      height: vehicle ? air ? 5 : 3 : 1.8, airborne: air && (unit.altitude || 0) > .5,
      fixed: vehicle ? parked || unit.crewBailed === true || unit.role === 'UAV_JAMMER' || (LOGISTICS_ROLES.has(unit.role) && STATIONARY_LOGISTICS_PHASES.has(unit.transport?.phase || '')) : unit.role === 'COMMAND' || (mover as Soldier).status === 'downed',
      vx: old ? (mover.x-old.x)/DT : 0, vy: old ? (mover.y-old.y)/DT : 0 }
    this.bodies.set(body.id, body)
    for (const key of this.keys(body)) { if (!this.cells.has(key)) this.cells.set(key,new Set()); this.cells.get(key)!.add(body) }
  }
  private neighbors(body: Body, p: Point, margin = 0) {
    const reach = Math.max(Math.abs(body.back), body.front) + body.radius + margin + 1, result = new Set<Body>()
    for (let x=Math.floor((p.x-reach)/CELL);x<=Math.floor((p.x+reach)/CELL);x++)
      for (let y=Math.floor((p.y-reach)/CELL);y<=Math.floor((p.y+reach)/CELL);y++)
        for (const other of this.cells.get(`${x},${y}`) || []) if (other !== body) result.add(other)
    return result
  }
  private gap(body: Body, other: Body, p: Point, heading: number, z: number, future = 0) {
    // Vertical separation lets aircraft pass over ground traffic and each other.
    if (z > other.z + other.height + 1 || other.z > z + body.height + 1) return Infinity
    const [a,b] = segment(body,p,heading), [c,d] = segment(other,{x:other.x+other.vx*future,y:other.y+other.vy*future})
    return segmentDistance(a,b,c,d) - body.radius - other.radius - .25
  }
  private put(body: Body, p: Point, heading = body.heading, z = body.z) {
    for (const key of this.keys(body)) this.cells.get(key)?.delete(body)
    body.x=p.x;body.y=p.y;body.z=z;body.heading=heading
    body.mover.x=p.x;body.mover.y=p.y;body.mover.heading=heading
    for (const key of this.keys(body)) { if (!this.cells.has(key)) this.cells.set(key,new Set()); this.cells.get(key)!.add(body) }
  }
  separate() {
    // Resolve coincident spawn/disembark positions gradually, without crossing terrain.
    for (let pass=0;pass<3;pass++) for (const body of this.bodies.values()) {
      if (body.fixed) continue
      for (const other of this.neighbors(body,body)) {
        const overlap = -this.gap(body,other,body,body.heading,body.z)
        if (overlap <= 0) continue
        let dx=body.x-other.x,dy=body.y-other.y,d=Math.hypot(dx,dy)
        if(d<.001){const sign=body.id<other.id?1:-1;dx=sign;dy=sign*.31;d=Math.hypot(dx,dy)}
        const step=Math.min(1,overlap+.02),p={x:body.x+dx/d*step,y:body.y+dy/d*step}
        if ((body.airborne || this.nav.clear(body,p)) && this.gap(body,other,p,body.heading,body.z)>-overlap) this.put(body,p)
      }
    }
  }
  move(mover: Mover, next: Point, altitude: number, reverse: boolean) {
    const body=this.bodies.get(mover.id)
    if(!body) { mover.x=next.x;mover.y=next.y;return true }
    if(body.fixed)return false
    // A mover may have been placed by a boarding/rescue transition since this tick began.
    if(length(body,mover)>.01)this.put(body,mover,mover.heading,ground(this.nav,mover)+altitude)
    const dx=next.x-mover.x,dy=next.y-mover.y,step=Math.hypot(dx,dy)
    if(step<.0001){
      const z=ground(this.nav,mover)+altitude
      const neighbors=[...this.neighbors(body,body)],blockers=neighbors.filter(o=>this.gap(body,o,body,body.heading,z)<0)
      if(blockers.length){
        // A vertical-only retry can deadlock forever while its horizontal volume overlaps.
        // Sidestep at the current altitude, then let the next tick resume the climb/descent.
        if(isAir(body.unit.role)){
          blockers.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)
          const side=body.id<blockers[0].id?1:-1
          for(const turn of [side*Math.PI/2,-side*Math.PI/2,side*Math.PI/4,-side*Math.PI/4,Math.PI]){
            const angle=body.heading+turn,p={x:body.x+Math.sin(angle),y:body.y+Math.cos(angle)}
            if(!body.airborne&&!this.nav.clear(body,p))continue
            const safe=neighbors.every(other=>{
              const oldGap=this.gap(body,other,body,body.heading,body.z),newGap=this.gap(body,other,p,body.heading,body.z)
              return newGap>=0||(oldGap<0&&newGap>oldGap+.001)
            })
            if(safe){this.put(body,p,body.heading,body.z);return false}
          }
        }
        return false
      }
      body.airborne=isAir(body.unit.role)&&altitude>.5;this.put(body,body,body.heading,z);return true
    }
    const direction=Math.atan2(dx,dy), airborne=isAir(body.unit.role)&&altitude>.5
    // Both directions use the same right-hand preference to avoid head-on deadlocks.
    for(const scale of [1,.5,.2]) for(const turn of [0,.35,-.35,.7,-.7,1.15,-1.15,1.57,-1.57]){
      const angle=direction+turn,heading=angle+(reverse?Math.PI:0)
      const p={x:body.x+Math.sin(angle)*step*scale,y:body.y+Math.cos(angle)*step*scale}
      if(!airborne&&!this.nav.clear(body,p))continue
      const z=ground(this.nav,p)+altitude,others=this.neighbors(body,p,Math.min(40,step*12))
      let blocked=false
      for(const other of others){
        const oldGap=this.gap(body,other,body,body.heading,body.z)
        const samples=Math.max(1,Math.ceil(step*scale/1.5))
        for(let i=1;i<=samples;i++){
          const q={x:body.x+(p.x-body.x)*i/samples,y:body.y+(p.y-body.y)*i/samples}
          const gap=this.gap(body,other,q,heading,body.z+(z-body.z)*i/samples)
          if(gap<0&&(oldGap>=0||gap<=oldGap+.001)){blocked=true;break}
        }
        if(blocked)break
        const horizon=.4,look={x:p.x+(p.x-body.x)*8,y:p.y+(p.y-body.y)*8}
        if(oldGap>=0&&this.gap(body,other,look,heading,z,horizon)<0){blocked=true;break}
      }
      if(!blocked){body.airborne=airborne;this.put(body,p,heading,z);return true}
    }
    return false
  }
}
export function beginTraffic(state: BattleState, nav: Navigation) {
  const traffic = new Traffic(nav,state,sessions.get(nav))
  sessions.set(nav,traffic);traffic.separate()
}
export function moveWithTraffic(mover: Mover, next: Point, nav: Navigation, altitude = 0, reverse = false) {
  const traffic=sessions.get(nav)
  if(traffic)return traffic.move(mover,next,altitude,reverse)
  mover.heading=Math.atan2(next.x-mover.x,next.y-mover.y)+(reverse?Math.PI:0)
  mover.x=next.x;mover.y=next.y;return true
}

