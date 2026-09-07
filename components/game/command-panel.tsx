'use client'

import { memo, useState } from 'react'
import { ChevronRight, Crosshair, Flag, Shield, Radio, Users, Truck, ShieldPlus, Navigation, Boxes, Plane, Target, ChevronDown, Fuel, Package, HeartPulse, ArrowUpRight } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AIRFIELD_TIERS, BASES, stockTotal, type BattleState, type Perspective, type Role, type Side, type Unit } from '@/lib/game/types'
import { MOB_TIERS, mobTier, type MobTier } from '@/lib/game/mob'
import { OBJECTIVE_FACILITIES, OBJECTIVE_STOCK_CAP } from '@/lib/game/objective-logistics'
import { fuelEconomy } from '@/lib/game/sustainment'
import type { SubcommanderId } from '@/lib/game/types'

export function UnitIcon({ role }: { role: Role }) {
  const Icon = ['TANK', 'APC', 'CANNON_APC', 'IFV'].includes(role) ? Shield : ['TRUCK','LOGISTICS','FORKLIFT','TROOP_TRUCK'].includes(role) ? Truck : role === 'MEDIC' ? ShieldPlus : ['RECON_UAV', 'PILOT', 'CAS_FIGHTER','JET', 'ATTACK_HELI', 'CARGO_PLANE', 'TRANSPORT_HELI', 'HEAVY_LIFT_HELI'].includes(role) ? Plane : role === 'COMMAND' ? Flag : role === 'UAV_JAMMER' ? Radio : ['MORTAR','AT','AA_TEAM'].includes(role) ? Target : role === 'SCOUT' ? Navigation : Users
  return <Icon size={16} strokeWidth={1.6} />
}
function ForceCard({ side, state, focus }: { side: Side; state: BattleState; focus: (p: { x: number; y: number }) => void }) {
  const force = state.forces[side], units = state.units.filter(u => u.side === side && u.hp > 0 && !u.external), people = units.reduce((n, u) => n + u.members, 0), owned = state.objectives.filter(o => o.owner === side).length
  return <section className={cn('force-card', side === 'RED' && 'red')} aria-label={`${side} force status`}>
    <div className="force-heading"><div className="flex items-center gap-3"><div className="insignia"><Shield size={20} strokeWidth={1.5} /></div><div><div className="force-name force-color">{side} FORCE</div><div className="force-callsign">{side === 'BLU' ? 'Saber Command' : 'Viper Command'}</div></div></div><Button variant="ghost" size="icon-sm" aria-label={`Focus ${side} headquarters`} onClick={() => focus(BASES[side])}><Crosshair /></Button></div>
    <div className="force-metrics"><div><div className="metric-value">{people}<span className="text-sm text-muted-foreground"> / {units.length}</span></div><div className="metric-caption">Personnel / groups</div></div><div><div className="metric-value">{Math.floor(force.sp).toLocaleString()}</div><div className="metric-caption">Supply points</div></div></div>
    <div className="pressure-row"><span>Operational tempo</span><span className="font-mono force-color">{Math.round(force.tempo)}<span className="text-muted-foreground"> / 100</span></span></div>
    <div className="pressure-track" role="meter" aria-label={`${side} operational tempo`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(force.tempo)}>{Array.from({ length: 24 }, (_, i) => <i key={i} className={i < force.tempo / 100 * 24 ? 'filled' : ''} />)}</div>
    <div className="strategy"><span className="flex items-center gap-2 force-color"><Navigation size={14} /><span className="font-mono">{force.action}</span></span><span className="flex items-center gap-1 text-muted-foreground">OBJ {force.target}<ChevronRight size={14} /></span></div>
    <div className="strategy-description">{owned} of {state.objectives.length} objectives held<span className="text-muted-foreground/50"> · </span>{force.casualties} casualties</div>
    {force.hold > 0 && <div className="text-sm text-primary">Secure hold: {Math.floor(force.hold)} / 60s</div>}
  </section>
}
function LogisticsPanel({ state, side, focus, onUpgradeMob, onBuildObjective }: { state: BattleState; side: Side; focus: (p: {x:number;y:number})=>void; onUpgradeMob?: (side: Side) => void; onBuildObjective?: (side: Side, objectiveId: string, kind: 'helipad'|'vehicleBay') => void }) {
  const f = state.forces[side], field = state.airfields[side], tier = AIRFIELD_TIERS[field.tier]
  const economy = fuelEconomy(state, side)
  const level = mobTier(state, side), mob = state.mobs?.[side], mobSpec = MOB_TIERS[level]
  const nextLevel = Math.min(3, level + 1) as MobTier, nextMob = MOB_TIERS[nextLevel]
  const upgradeBlocked = level === 3 || !!mob?.upgrade || f.sp < nextMob.cost + 200
  const reservedCranes = state.units.filter(u => u.side === side && u.hp > 0 && u.role === 'TRUCK' && u.transport?.mobDock !== undefined && ['mob-approach', 'mob-docking', 'mob-unloading', 'mob-exit'].includes(u.transport.phase)).length
  const upgradeProgress = mob?.upgrade ? Math.max(0, Math.min(100, Math.round((1 - (mob.upgrade.due - state.time) / MOB_TIERS[mob.upgrade.tier].buildSeconds) * 100))) : 0
  const mobBonuses = level === 1
    ? 'Baseline troop requisition and unloading speed'
    : level === 2
      ? '50% faster troop requisitions and cargo unloading'
      : '50% faster troop requisitions and cargo unloading · selected vehicles and helicopters cost 25% less and arrive 25% faster'
  return <section className={cn('force-card', side === 'RED' && 'red')}>
    <div className="force-heading"><span className="force-name force-color">{side} SUSTAINMENT</span><Boxes size={18} className="force-color" /></div>
    <div className="flex flex-col gap-2 pt-4">
      <span className="force-color font-mono">AIRFIELD TIER {field.tier} · {tier.supplyMultiplier}× SUPPLY</span>
      <p className="text-sm leading-relaxed text-muted-foreground">{tier.runways} landing {tier.runways === 1 ? 'strip' : 'strips'} · {tier.forklifts} {tier.forklifts === 1 ? 'forklift' : 'forklifts'}<br />{tier.trucks} delivery {tier.trucks === 1 ? 'truck' : 'trucks'}{tier.trailers > 0 && ` · ${tier.trailers} trailers each`}</p>
      <p className="text-sm leading-relaxed">{field.upgrade ? `Upgrading to tier ${field.upgrade.tier} · ${Math.max(0, Math.ceil(field.upgrade.due - state.time))}s remaining` : field.tier === 3 ? 'Maximum infrastructure capacity' : 'Commander prioritizes upgrades after initial infantry and transport.'}</p>
      <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Tier capacities and costs</summary><div className="flex flex-col gap-2 pt-2">{([1, 2, 3] as const).map(fieldLevel => { const spec = AIRFIELD_TIERS[fieldLevel]; return <p key={fieldLevel}>T{fieldLevel}: {spec.runways} strip / {spec.forklifts} forklifts / {spec.trucks} trucks{spec.trailers ? ' + 2 trailers each' : ''} · {spec.supplyMultiplier}× supplies · {spec.cost ? `${spec.cost} SP / ${spec.buildSeconds}s upgrade` : 'Starting tier'}</p> })}</div></details>
    </div>
    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4"><span className="force-color font-mono">FORWARD OBJECTIVE LOGISTICS</span>{state.objectives.filter(o=>o.owner===side).map(o=><div key={o.id} className="rounded-md border border-border p-3"><div className="flex items-center justify-between"><button className="text-sm font-medium hover:text-primary" onClick={()=>focus(o)}>Objective {o.id}</button><span className="font-mono text-xs text-muted-foreground">{Math.floor(stockTotal(o.stock))} / {OBJECTIVE_STOCK_CAP*3}</span></div><p className="pt-1 text-xs text-muted-foreground">Fuel {Math.floor(o.stock.fuel)} · Repair {Math.floor(o.stock.repair)} · Ammo {Math.floor(o.stock.ammo)}{o.restock?` · convoy ${o.restock.side}`:''}</p>{(['helipad','vehicleBay'] as const).map(kind=>{const facility=o.facilities[kind],spec=OBJECTIVE_FACILITIES[kind],label=kind==='helipad'?'Helipad':'Vehicle repair bay';return <div key={kind} className="flex items-center justify-between gap-2 pt-2"><span className="text-xs">{label}: {facility?.construction?`${Math.max(0,Math.ceil(facility.construction.due-state.time))}s`:facility?facility.hp>=40?`${Math.round(facility.hp)}% operational`:`disabled · ${Math.round(facility.hp)}%`:'not built'}</span>{(!facility||facility.hp<40)&&!facility?.construction&&!o.contested&&<Button size="sm" variant="outline" disabled={f.sp<spec.cost+200} onClick={()=>onBuildObjective?.(side,o.id,kind)}>{spec.cost} SP</Button>}</div>})}</div>)}{!state.objectives.some(o=>o.owner===side)&&<p className="text-sm text-muted-foreground">Capture an objective to establish forward service.</p>}</div>
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      <span className="force-color font-mono">MOB LEVEL {level} · {mobSpec.cranes} CRANE {mobSpec.cranes === 1 ? 'SLOT' : 'SLOTS'}</span>
      <p className="text-sm leading-relaxed text-muted-foreground">{reservedCranes} of {mobSpec.cranes} crane slots reserved · {mobSpec.unloadSeconds}s per container</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{mobBonuses}</p>
      <p className="text-sm leading-relaxed">{mob?.upgrade ? `Upgrading to level ${mob.upgrade.tier} · ${upgradeProgress}% · ${Math.max(0, Math.ceil(mob.upgrade.due - state.time))}s remaining` : level === 3 ? 'Maximum MOB infrastructure capacity' : `Level ${nextLevel}: ${nextMob.cost.toLocaleString()} SP · ${nextMob.buildSeconds}s`}</p>
      {level < 3 && <Button size="sm" variant="outline" disabled={upgradeBlocked} onClick={() => onUpgradeMob?.(side)}>{mob?.upgrade ? `Level ${mob.upgrade.tier} upgrade in progress` : f.sp < nextMob.cost + 200 ? `Requires ${nextMob.cost.toLocaleString()} SP + 200 reserve` : `Upgrade MOB to level ${nextLevel}`}</Button>}
      <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">MOB level benefits</summary><div className="flex flex-col gap-2 pt-2">{([1, 2, 3] as const).map(mobLevel => { const spec = MOB_TIERS[mobLevel]; return <p key={mobLevel}>L{mobLevel}: {spec.cranes} {spec.cranes === 1 ? 'crane' : 'cranes'} · {spec.unloadSeconds}s per container{mobLevel === 1 ? ' · starting level' : mobLevel === 2 ? ' · 50% faster troop requisitions · 4,000 SP / 90s' : ' · helipad and vehicle bay · selected vehicles and helicopters 25% cheaper and faster · 8,000 SP / 150s'}</p> })}</div></details>
    </div>
    <p className="strategy-description">Physical inventory · independent of SP</p>
    <div className="flex flex-col gap-4 pt-5">{[{name:'Airfield stock',value:Math.floor(stockTotal(state.depots[side].airfield)),icon:Package},{name:'Awaiting forklift',value:Math.floor(stockTotal(state.depots[side].pending)),icon:Boxes},{name:'MOB stock',value:Math.floor(stockTotal(state.depots[side].mob)),icon:Package},{name:'Fuel on hand',value:Math.floor(economy.onHand).toLocaleString(),icon:Fuel},{name:'Inbound fuel',value:Math.floor(economy.inbound).toLocaleString(),icon:Plane},{name:'Service commitments',value:Math.ceil(economy.committed).toLocaleString(),icon:Fuel},{name:'Protected fuel reserve',value:Math.ceil(economy.protectedFuel).toLocaleString(),icon:Shield},{ name: 'Ammunition', value: Math.floor(f.ammo).toLocaleString(), icon: Package }, { name: 'Manpower reserve', value: Math.floor(f.manpower), icon: Users }, { name: 'Requisition queue', value: f.queue, icon: Plane }].map(item => <div key={item.name} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><item.icon size={16} />{item.name}</span><span className="font-mono">{item.value}</span></div>)}</div>
    <p className={cn('pt-3 text-sm',economy.available>=0?'text-primary':'text-destructive')}>Fuel command: {economy.available>=0?`${Math.floor(economy.available)} fuel available above commitments`:`${Math.ceil(-economy.available)} fuel deficit; vehicle procurement held`}</p>
    <div className="strategy"><span className="text-muted-foreground">Airbase income</span><span className="force-color font-mono">+{tier.income} SP / 5s</span></div>
    <div className="flex flex-col gap-2 pt-4"><span className="eyebrow">LATEST REQUISITION</span><p className="text-sm leading-relaxed">{f.purchase}</p><span className="text-sm text-muted-foreground">{f.delivered} deliveries completed</span></div>
    <div className="flex flex-col gap-3 pt-4"><p className="text-sm text-primary">Next scheduled flight in {Math.max(0, Math.ceil(state.nextSupply[side] - state.time))}s</p>{(['airfield', 'mob'] as const).map(location => <p key={location} className="text-sm leading-relaxed text-muted-foreground">{location === 'mob' ? 'MOB · ground servicing' : 'Airfield · aircraft servicing'}<br />Fuel {Math.floor(state.depots[side][location].fuel)} · Ammo {Math.floor(state.depots[side][location].ammo)} · Repair {Math.floor(state.depots[side][location].repair)}</p>)}{state.units.filter(u => u.external && u.hp > 0 && u.side === side).map(u => <p key={u.id} className="text-sm leading-relaxed text-muted-foreground">{u.name}: {u.travelStatus || u.mission.toLowerCase()} · {Math.floor(u.transport?.cargo || 0)} cargo</p>)}</div>
  </section>
}
const STAFF_ORDER:SubcommanderId[]=['TROOPS','FUEL','MOTORCADE','AIR','LOGISTICS','FIRES']
function StaffPanel({state,side}:{state:BattleState;side:Side}){
  const council=state.subcommanders?.[side]
  return <section className={cn('force-card',side==='RED'&&'red')} aria-label={`${side} command staff`}><div className="force-heading"><div><div className="force-name force-color">{side} COMMAND STAFF</div><div className="force-callsign">Delegated authority and readiness</div></div><Radio size={18} className="force-color" /></div>{council?<><div className="strategy"><span className="font-mono force-color">{council.action}</span><span className="text-muted-foreground">OBJECTIVE {council.target} · REV {council.revision}</span></div><div className="flex flex-col gap-3 pt-4">{STAFF_ORDER.map(id=>{const report=council.reports[id];return <div key={id} className="rounded-md border border-border p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium">{report.name}</div><div className="text-xs text-muted-foreground">{report.responsibility}</div></div><span className={cn('font-mono text-xs',report.approved?'text-primary':report.required?'text-destructive':'text-muted-foreground')}>{report.status}</span></div><p className="pt-2 text-sm leading-relaxed">{report.reason}</p><p className="pt-2 text-xs text-muted-foreground">{report.metrics} · {report.required?'decision authority':'advisory'}</p></div>})}</div></>:<p className="pt-4 text-sm text-muted-foreground">Command staff will report at the first planning cycle.</p>}</section>
}
export const CommandPanel = memo(function CommandPanel({ state, perspective, selected, onSelect, focus, mobileOpen, onUpgradeMob, onBuildObjective }: { state: BattleState; perspective: Perspective; selected: string | null; onSelect: (u: Unit) => void; focus: (p: { x: number; y: number }) => void; mobileOpen: boolean; onUpgradeMob?: (side: Side) => void; onBuildObjective?: (side: Side, objectiveId: string, kind: 'helipad'|'vehicleBay') => void }) {
  const [tab, setTab] = useState('forces'), [rosterSide, setRosterSide] = useState<Side>('BLU'), [expanded, setExpanded] = useState(false)
  const visibleSides: Side[] = perspective === 'OBS' ? ['BLU', 'RED'] : [perspective]
  const activeSide = perspective === 'OBS' ? rosterSide : perspective
  const units = state.units.filter(u => u.side === activeSide && u.hp > 0 && !u.external)
  return <aside className={cn('command-sidebar', mobileOpen && 'mobile-open')} aria-label="Command overview">
    <div className="sidebar-tabs"><ToggleGroup value={[tab]} onValueChange={v => v.length && setTab(v[0] as string)} spacing={1} aria-label="Command panel"><ToggleGroupItem value="forces">Forces</ToggleGroupItem><ToggleGroupItem value="logistics">Logistics</ToggleGroupItem><ToggleGroupItem value="staff">Staff</ToggleGroupItem></ToggleGroup><span className="eyebrow"><Radio size={14} /></span></div>
    <div className="panel-scroll">
      {visibleSides.map(side => tab === 'forces' ? <ForceCard key={side} side={side} state={state} focus={focus} /> : tab==='logistics'?<LogisticsPanel key={side} side={side} state={state} focus={focus} onUpgradeMob={onUpgradeMob} onBuildObjective={onBuildObjective} />:<StaffPanel key={side} side={side} state={state}/>)}
      {perspective !== 'OBS' && <div className="p-5 text-sm leading-relaxed text-muted-foreground">Enemy positions appear only when detected by friendly units. Enemy force totals are hidden.</div>}
      <div className="section-heading"><span className="eyebrow">CURRENT FORCE <span className="text-foreground/70">{units.length}</span></span>{perspective === 'OBS' && <button className="flex items-center gap-1 font-mono text-sm text-muted-foreground" onClick={() => setRosterSide(s => s === 'BLU' ? 'RED' : 'BLU')}>{rosterSide}<ChevronDown size={13} /></button>}</div>
      {(expanded ? units : units.slice(0, 5)).map(u => <button key={u.id} className={cn('unit-row', selected === u.id && 'selected')} onClick={() => onSelect(u)}><div className={cn('unit-symbol', u.side === 'RED' && 'red')}><UnitIcon role={u.role} /></div><div className="flex min-w-0 flex-1 flex-col"><span className="unit-name">{u.name}</span><span className="unit-detail">{u.role.replaceAll('_', ' ').toLowerCase()} · {u.members}/{u.maxMembers}</span></div><ArrowUpRight size={15} className="text-muted-foreground" /></button>)}
      {units.length > 5 && <button className="flex w-full items-center justify-center gap-2 py-4 text-sm text-muted-foreground hover:text-foreground" onClick={() => setExpanded(v => !v)}>{expanded ? 'Collapse force list' : `View all ${units.length} groups`}<ChevronDown size={14} className={expanded ? 'rotate-180' : ''} /></button>}
    </div>
    <div className="sidebar-footer"><span className="live-dot" /><span>{tab==='staff'?'6 delegated subcommanders active':'Local commanders active'}</span><HeartPulse size={15} className="ml-auto" /></div>
  </aside>
}, (previous, next) => {
  const summary = (s: BattleState) => JSON.stringify([Math.floor(s.time), s.airfields, s.mobs, s.subcommanders, s.nextSupply, s.depots, s.forces, s.objectives.map(o => [o.owner,o.contested,o.stock,o.facilities,o.restock]), s.units.map(u => [u.id, u.members, u.hp > 0, u.transport?.phase, u.transport?.cargo, u.travelStatus])])
  return previous.perspective === next.perspective && previous.selected === next.selected && previous.mobileOpen === next.mobileOpen && previous.onSelect === next.onSelect && previous.focus === next.focus && previous.onUpgradeMob === next.onUpgradeMob && previous.onBuildObjective === next.onBuildObjective && summary(previous.state) === summary(next.state)
})

