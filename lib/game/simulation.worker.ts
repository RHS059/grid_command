import { MOB_GARAGE, MOB_GARAGE_STAGING, mobWorld, startMobUpgrade, requisitionCost, requisitionDelay } from './mob'
import { beginTraffic, moveWithTraffic } from './traffic'
import { initialState, CATALOG, BASES, AIRBASES, type BattleState, type Side, type Unit, type Point, type Role } from './types'
import { Navigation } from './navigation'
import { Visibility } from './visibility'
import { canSee, resolveCombat } from './combat'
import { updateSoldiers } from './behaviors'
import { isAir, isVehicle, troopSeats, type GeometryPacket } from './types'
import { assignTransports, manualGetIn, requestDismount, updateTransports } from './transport'
import { updateSupplyMissions } from './logistics'
import { deployJammer, updateJammers } from './electronic-warfare'
import { recordCasualties } from './casualties'
import { missionAsset } from './types'
import { travel } from './movement'
import { createUnit } from './types'
import { captureBodies } from './capture'
import { nextPurchase, startAirfieldUpgrade } from './requisitions'
import { AIRFIELD_TIERS } from './types'
import { updateVehicleService, consumeFuel, missionFuel, syncDepotTotals } from './sustainment'
let visibility = new Visibility(), geometry = new Map<string,GeometryPacket>(), shotId = 0
const nextShot = () => ++shotId

let state = initialState(), nav = new Navigation(), seed = 3701, eventId = 1, serial = 31, ready = false
const sides: Side[] = ['BLU', 'RED']
const deliveries: { side: Side; role: Role; due: number; unitId?: string }[] = []
const seen = new Set<string>()
const INFANTRY_STAGING_X = [-15, 5, 25, 45] as const
const INFANTRY_STAGING_Y = { BLU: [88, 110] as const, RED: [-22, 0] as const }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
function log(side: Side | 'SYS', text: string, type: 'command' | 'combat' | 'logistics' | 'system' = 'command') { state.events.unshift({ id: ++eventId, time: state.time, side, text, type }); state.events.length = Math.min(80, state.events.length) }
function route(u: Unit, target: Point) {
  if (isAir(u.role)) { u.path = [target]; return }
  const start = nav.nearest(u); u.x = start.x; u.y = start.y
  u.path = nav.route(u, target)
  if (!u.path.length && distance(u, target) > 50) { u.mission = 'REPATH'; if (!seen.has(`nav-${u.id}`)) { seen.add(`nav-${u.id}`); log(u.side, `${u.name}: route obstructed. Holding for a new approach.`, 'system') } }
}
function plan(side: Side) {
  const own = state.units.filter(u => u.side === side && u.hp > 0 && !u.external)
  const contacts = state.units.filter(u => u.side !== side && u.hp > 0 && u.spotted)
  const f = state.forces[side], held = state.objectives.filter(o => o.owner === side).length
  const tempo = Math.min(96, 48 + (state.objectives.length - held) * 2.5 + f.casualties * .6 + state.time / 90)
  const candidates = state.objectives.filter(o => o.owner !== side || o.contested)
  const target = [...candidates].sort((a, b) => {
    const score = (o: typeof a) => distance(BASES[side], o) / 100 + contacts.filter(e => distance(e, o) < 250).length * (1.3 - tempo / 100)
    return score(a) - score(b)
  })[0] || state.objectives[Math.floor(state.objectives.length / 2)]
  const action = f.cycles > 0 && f.cycles % 3 === 0 ? 'FLANK' : own.filter(u => u.ammo < 20).length > 3 ? 'RESUPPLY' : held < 2 ? 'MASS' : 'SEIZE'
  return { side, own, target, tempo, action }
}
function commanders() {
  // Both plans observe the same pre-order state; neither side gets a first-mover information advantage.
  const plans = sides.map(plan)
  for (const p of plans) {
    const f = state.forces[p.side]; f.action = p.action; f.target = p.target.id; f.tempo = p.tempo; f.cycles++
    let assault = 0
    for (const u of p.own) {
      if (u.crewBailed || u.servicing || u.emergency || u.deployment || missionAsset(u.role) || u.carrier || u.attachedSquad || (troopSeats(u.role)>0&&u.transport&&!['available','escort'].includes(u.transport.phase)) || state.units.some(c=>c.hp>0&&c.transport?.passengers?.includes(u.id)) || state.units.some(j=>j.hp>0&&j.construction?.builder===u.id) || ['COMMAND', 'PILOT', 'LOGISTICS'].includes(u.role)) continue
      if (isVehicle(u.role) && u.fuel < missionFuel(u, p.target)) { u.path = []; u.servicing = true; u.mission = 'RTB FOR SERVICE'; u.target = isAir(u.role) ? 'AIRFIELD' : 'MOB'; u.serviceStatus = 'INSUFFICIENT MISSION FUEL RESERVE'; continue }
      u.serviceStatus = undefined
      if (u.role === 'CAS_FIGHTER' || u.role === 'JET' || u.role === 'ATTACK_HELI') { if(u.airPhase === 'attack') { u.mission = 'CAS'; u.target = p.target.id; route(u,p.target) } continue }
      if (u.role === 'RECON_UAV') { u.mission = 'RECON'; u.target = 'Enemy MOB'; route(u, BASES[p.side === 'BLU' ? 'RED' : 'BLU']); continue }
      if (u.ammo < 12 || u.hp < 22) { u.mission = 'RESUPPLY'; u.target = 'MOB'; route(u, BASES[p.side]); continue }
      const sign = p.side === 'BLU' ? -1 : 1
      if (['RIFLE', 'SCOUT', 'TANK', 'APC', 'CANNON_APC', 'IFV', 'AT'].includes(u.role)) {
        u.mission = 'CAPTURE'; u.target = p.target.id; u.subcommand = `MANEUVER ${Math.floor(assault / 3) + 1}`
        const destination = { x: p.target.x + ((assault % 3) - 1) * 30, y: p.target.y + sign * (assault % 2) * 25 }
        if (p.action === 'FLANK' && assault === 0 && distance(u, destination) > 220) {
          const flank = nav.nearest({ x: destination.x + sign * 280, y: destination.y + sign * 190 })
          route(u, flank)
          const first = [...u.path], second = nav.route(flank, destination)
          if (first.length && second.length) u.path = [...first, ...second]
          else route(u, destination)
          if (u.path.length) u.mission = 'CAPTURE'
        } else route(u, destination)
        assault++
      } else {
        u.mission = u.role === 'MEDIC' ? 'SUPPORT' : 'OVERWATCH'; u.target = p.target.id; u.subcommand = 'FIRE SUPPORT'
        route(u, { x: p.target.x + (u.role === 'MG' ? -120 : 150) * sign, y: p.target.y + (u.role === 'MORTAR' ? 420 : 180) * sign })
      }
    }
    log(p.side, `${p.side === 'BLU' ? 'SABER' : 'VIPER'} elements, ${p.action.toLowerCase()} objective ${p.target.id}. ${assault} maneuver groups committed. OUT.`)
    const role = nextPurchase(state, p.side, deliveries.filter(d=>!d.unitId))
    if (role === 'AIRFIELD_UPGRADE') { if (startAirfieldUpgrade(state, p.side)) log(p.side, f.purchase, 'logistics') }
    else if (role === 'MOB_UPGRADE') { if(startMobUpgrade(state,p.side))log(p.side,f.purchase,'logistics') }
    else if (role) { const cost=requisitionCost(state,p.side,role),delay=requisitionDelay(state,p.side,role,Math.ceil((state.time+1)/60)*60+35-state.time); f.sp -= cost; f.queue++; f.purchase = `${role.replaceAll('_', ' ')} · ${cost} SP · ${Math.ceil(delay)}s`; deliveries.push({ side: p.side, role, due: state.time+delay }); log(p.side, `${role.replaceAll('_', ' ')} requisition approved. Assembly queued.`, 'logistics') }
  }
}
function spawn(side: Side, role: Role) {
  const base = isAir(role) ? AIRBASES[side] : BASES[side]
  const staging=INFANTRY_STAGING_Y[side].flatMap(y=>INFANTRY_STAGING_X.map(x=>mobWorld(side,{x,y})))
  const p = isAir(role) ? base : nav.nearest(staging.find(candidate=>!state.units.some(u=>u.hp>0&&!isVehicle(u.role)&&distance(u,candidate)<14))||staging[serial%staging.length])
  state.units.push(createUnit(side, role, `${side}-${serial++}`, p))
  log(side, `${role.replaceAll('_', ' ')} assembled at ${isAir(role) ? 'airfield' : 'MOB'}.${isVehicle(role) ? ' Awaiting fuel and ammunition from depot stock.' : ' Ready for orders.'}`, 'logistics')
}
function startGarageDeployment(delivery: typeof deliveries[number]) {
  state.mobs ??= { BLU: { tier: 1 }, RED: { tier: 1 } }
  const mob=state.mobs[delivery.side]
  if(mob.garage)return false
  let serial=mob.garageSerial||0
  const staging=[...MOB_GARAGE_STAGING.slice(serial%MOB_GARAGE_STAGING.length),...MOB_GARAGE_STAGING.slice(0,serial%MOB_GARAGE_STAGING.length)].find(p=>{
    const world=mobWorld(delivery.side,p);return !state.units.some(u=>u.hp>0&&isVehicle(u.role)&&distance(u,world)<12)
  })
  if(!staging)return false
  const inside=mobWorld(delivery.side,{x:MOB_GARAGE.x,y:MOB_GARAGE.insideY}),unit=createUnit(delivery.side,delivery.role,`${delivery.side}-garage-${serial++}`,inside)
  mob.garageSerial=serial;delivery.unitId=unit.id;unit.heading=0;unit.fuel=5;unit.ammo=0;unit.servicing=false;unit.deployment='garage';unit.mission='GARAGE DOOR OPENING';unit.subcommand='MOB COMMISSIONING';unit.path=[]
  state.units.push(unit);mob.garage={unitId:unit.id,phase:'opening',since:state.time,staging:mobWorld(delivery.side,staging)}
  return true
}
function updateGarageDeployments() {
  for(const side of sides){
    state.mobs ??= { BLU: { tier: 1 }, RED: { tier: 1 } }
    const mob=state.mobs[side],garage=mob.garage
    if(!garage){const due=deliveries.filter(d=>d.side===side&&!d.unitId&&d.due<=state.time&&isVehicle(d.role)&&!isAir(d.role)).sort((a,b)=>a.due-b.due||a.role.localeCompare(b.role))[0];if(due)startGarageDeployment(due);continue}
    const unit=state.units.find(u=>u.id===garage.unitId),phase=(name:'opening'|'rollout'|'closing')=>{garage.phase=name;garage.since=state.time}
    if(!unit||unit.hp<=0||unit.crewBailed||unit.emergency){if(unit)unit.deployment=undefined;const request=deliveries.find(d=>d.unitId===garage.unitId);if(request){deliveries.splice(deliveries.indexOf(request),1);state.forces[side].queue=Math.max(0,state.forces[side].queue-1);log(side,`${request.role.replaceAll('_',' ')} lost during MOB commissioning.`,'logistics')}if(garage.phase!=='closing')phase('closing');if(state.time-garage.since>=MOB_GARAGE.closeSeconds)mob.garage=undefined;continue}
    unit.path=[]
    if(garage.phase==='opening'){unit.engine=false;unit.mission='GARAGE DOOR OPENING';if(state.time-garage.since>=MOB_GARAGE.openSeconds)phase('rollout')}
    else if(garage.phase==='rollout'){
      unit.mission='ROLLING OUT OF MOB GARAGE';unit.engine=true
      if(travel(unit,garage.staging,nav,state.time,5,0,2)){unit.deployment=undefined;unit.servicing=true;unit.engine=false;phase('closing');const request=deliveries.find(d=>d.unitId===unit.id);if(request){deliveries.splice(deliveries.indexOf(request),1);state.forces[side].queue=Math.max(0,state.forces[side].queue-1);state.forces[side].delivered++;log(side,`${unit.role.replaceAll('_',' ')} cleared the MOB garage and entered service.`,'logistics')}}
    }else if(state.time-garage.since>=MOB_GARAGE.closeSeconds)mob.garage=undefined
  }
}
function sense() {
  const living = state.units.filter(u => u.hp > 0 && !u.carrier)
  for (const u of living) {
    const detected = visibility.ready && living.some(v => v.side !== u.side && canSee(v, u, visibility, state))
    u.spotted = detected
    if (detected && !seen.has(u.id)) { seen.add(u.id); log(u.side === 'BLU' ? 'RED' : 'BLU', `Contact report: enemy ${u.role.toLowerCase().replace('_', ' ')} observed near ${[...state.objectives].sort((a, b) => distance(u, a) - distance(u, b))[0].id}.`, 'combat') }
  }
}
function combat() {
  if (visibility.ready) resolveCombat(state, visibility, random, nextShot)
  const commandersLost = sides.filter(s => state.units.some(u => u.side === s && u.role === 'COMMAND' && u.hp === 0))
  if (commandersLost.length) state.winner = commandersLost.length === 2 ? 'DRAW' : commandersLost[0] === 'BLU' ? 'RED' : 'BLU'
}
function capture() {
  for (const o of state.objectives) {
    const bodies = captureBodies(state, o)
    o.contested = bodies.BLU > 0 && bodies.RED > 0
    const side: Side | null = !o.contested && bodies.BLU >= 6 ? 'BLU' : !o.contested && bodies.RED >= 6 ? 'RED' : null
    if (!side || side === o.owner) { o.progress = 0; o.capturing = null; continue }
    if (o.capturing !== side) o.progress = 0
    o.capturing = side; o.progress += .05 / 8
    if (o.progress >= 1) { o.owner = side; o.progress = 0; o.capturing = null; log(side, `Objective ${o.id} secured. ${o.name} is under friendly control. OUT.`) }
  }
  for (const side of sides) {
    const f = state.forces[side]
    f.hold = state.objectives.every(o => o.owner === side && !o.contested) ? f.hold + .05 : 0
    if (f.hold >= 60) { state.winner = side; log(side, `All ${state.objectives.length} objectives secured for 60 seconds. Territorial victory.`, 'system') }
  }
}
function logistics() {
  for (const side of sides) {
    const f = state.forces[side]; f.sp += AIRFIELD_TIERS[state.airfields[side].tier].income; f.manpower = Math.min(250, f.manpower + .3)
  }
  for (const u of state.units.filter(u => u.hp > 0)) {
    const f = state.forces[u.side]
    if (!isVehicle(u.role) && distance(u, BASES[u.side]) < 110) { const stock = state.depots[u.side].mob; const amount = Math.min(4, 100 - u.ammo, stock.ammo); u.ammo += amount; stock.ammo -= amount }
    if (u.role === 'MEDIC') for (const friend of state.units) if (!isVehicle(friend.role) && friend.side === u.side && friend.hp > 0 && distance(u, friend) < 80) friend.hp = Math.min(100, friend.hp + 1)
  }
}
function deliverRequisitions() {
  for (let i = deliveries.length - 1; i >= 0; i--) if (deliveries[i].due <= state.time && (!isVehicle(deliveries[i].role)||isAir(deliveries[i].role))) { const d = deliveries[i]; state.forces[d.side].queue--; state.forces[d.side].delivered++; spawn(d.side, d.role); deliveries.splice(i, 1) }
  updateGarageDeployments()
}
function tick() {
  state.tick++; state.time = state.tick * .05
  beginTraffic(state,nav)
  deliverRequisitions()
  updateVehicleService(state, nav)
  if (state.tick % 600 === 1) commanders()
  if (state.tick % 20 === 1) assignTransports(state,nav)
  updateJammers(state,nav)
  updateTransports(state,nav)
  updateSupplyMissions(state,nav)
  for (const u of state.units) {
    if (u.hp <= 0 || u.crewBailed || u.servicing || u.emergency || u.deployment || u.external || u.carrier || u.attachedSquad || (troopSeats(u.role)>0&&u.transport&&u.transport.phase!=='available') || missionAsset(u.role) || u.mission==='WAITING FOR TRANSPORT') continue
    if (isAir(u.role)) {
      if (u.fuel <= 0 || (u.serviceStatus === 'INSUFFICIENT MISSION FUEL RESERVE' && (u.altitude || 0) <= .5)) continue
      const target=u.path[0]||state.objectives[Math.floor(state.objectives.length / 2)];u.mission=u.role==='RECON_UAV'?'RECON':'CAS';const angle=Math.atan2(target.x-u.x,target.y-u.y),delta=Math.atan2(Math.sin(angle-u.heading),Math.cos(angle-u.heading));u.heading+=Math.max(-.035,Math.min(.035,delta));
      const speed=CATALOG[u.role].speed*(u.role==='ATTACK_HELI'&&distance(u,target)<350?.15:1);u.engine=true;const altitude=Math.min(u.role==='JET'?230:u.role==='CAS_FIGHTER'?140:95,(u.altitude||0)+.5);if(moveWithTraffic(u,{x:u.x+Math.sin(u.heading)*speed*.05,y:u.y+Math.cos(u.heading)*speed*.05},nav,altitude)){u.altitude=altitude;u.travelStatus=undefined}else u.travelStatus='YIELDING TO AIR TRAFFIC'
      if(Math.abs(u.x)>18000||Math.abs(u.y)>35000)u.path=[AIRBASES[u.side]];continue
    }
    if (u.path.length) travel(u,u.path.at(-1)!,nav,state.time,CATALOG[u.role].speed*(u.hp<30?.65:1),0)
  }
  if (visibility.ready) updateSoldiers(state, visibility, nav, nextShot)
  if (state.tick % 10 === 0) sense()
  if (state.tick % 4 === 0) combat()
  if (state.tick % 100 === 0) logistics()
  consumeFuel(state)
  syncDepotTotals(state)
  recordCasualties(state,nav,visibility,random)
  capture()
}
self.onmessage = (event: MessageEvent) => {
  const msg = event.data
  if (msg.type === 'init' || msg.type === 'restart') { state = initialState(msg.seed || 3701); seed = state.seed; nav = new Navigation(); nav.strict=true; visibility=new Visibility(); serial = 100; eventId = 1; shotId = 0; seen.clear(); deliveries.length = 0; ready = true; for(const packet of geometry.values()) applyGeometry({...packet,evict:undefined}); publish() }
  if (msg.type === 'deploy-jammer' && !state.winner && (msg.side==='BLU'||msg.side==='RED')) { const error=deployJammer(state,nav,String(msg.builder),msg.side); log(msg.side,error||'UAV jammer construction started. Coverage online in 15 seconds.',error?'system':'logistics');publish() }
  if(msg.type==='upgrade-mob'&&!state.winner&&(msg.side==='BLU'||msg.side==='RED')){const side=msg.side as Side;if(startMobUpgrade(state,side))log(side,state.forces[side].purchase,'logistics');publish()}
  if(msg.type==='transport-action'&&!state.winner&&(msg.side==='BLU'||msg.side==='RED')&&typeof msg.unitId==='string'&&['get-in','dismount','dismount-all'].includes(msg.action)){
    const side=msg.side as Side,ok=msg.action==='get-in'?manualGetIn(state,side,msg.unitId,typeof msg.carrierId==='string'?msg.carrierId:undefined):requestDismount(state,nav,side,msg.unitId,msg.action==='dismount-all')
    if(ok)log(side,msg.action==='get-in'?'Manual vehicle pickup ordered.':msg.action==='dismount-all'?'Passenger and crew dismount ordered.':'Passenger dismount ordered.','command');publish()
  }
  if (msg.type === 'pause') { state.paused = Boolean(msg.value); publish() }
  if (msg.type === 'speed') { state.speed = [1, 2, 4, 8, 16].includes(msg.value) ? msg.value : 1; publish() }
  if (msg.type === 'step' && state.paused && !state.winner) { tick(); publish() }
  if (msg.type === 'geometry') {
    applyGeometry(msg.packet); publish()
  }
}
function applyGeometry(packet: GeometryPacket) {
  if(packet.evict)geometry.delete(packet.evict);geometry.set(packet.sector||'legacy',packet);visibility.import(packet);nav.packet(packet);state.geometryReady=visibility.ready;state.navCells=nav.count;state.buildings=visibility.buildings.size
  for(const o of state.objectives)if(nav.covered(o))Object.assign(o,nav.nearest(o))
  for(const u of state.units){if(isAir(u.role)||u.carrier||u.hp<=0||!nav.covered(u))continue;Object.assign(u,nav.nearest(u));for(const s of u.soldiers||[])if(s.status==='active'&&nav.covered(s))Object.assign(s,nav.nearest(s))}
}
function publish() { self.postMessage(state) }
setInterval(() => {
  if (!ready || state.paused || state.winner) return
  const start = performance.now()
  for (let i = 0; i < state.speed; i++) { tick(); if (state.winner || performance.now() - start > 12) break }
  state.workerMs = Math.round((performance.now() - start) * 100) / 100
  publish()
}, 50)
export type { BattleState }

