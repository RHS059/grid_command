'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, Building2, ChevronLeft, ChevronRight, CircleHelp, Crosshair, Flag, Layers, LocateFixed, Menu, Maximize2, Minus, Pause, Play, Plus, RotateCcw, Settings2, Shield, SkipForward, VolumeX, X, Navigation2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Battlefield, type MapAPI } from './battlefield'
import { CommandPanel, UnitIcon } from './command-panel'
import { GameDialogs } from './game-dialogs'
import { BASES, clock, DEFAULT_GRAPHICS, initialState, type BattleState, type Graphics, type Perspective, type Unit } from '@/lib/game/types'
import { cn } from '@/lib/utils'
import { BattlefieldAudio } from '@/lib/game/audio'
import { UnitLab } from './unit-lab'
import { SoundSettings } from './sound-settings'
import { BuildingEditor } from './building-editor'
import { eligibleBuilder } from '@/lib/game/electronic-warfare'
import { troopSeats, isVehicle, isAir, CATALOG } from '@/lib/game/types'
import { nearestPersonnelCarrier, transportSquad } from '@/lib/game/transport'
import styles from './game-hud.module.css'

type GameView = 'battlefield' | 'models' | 'buildings' | 'sfx'
const WORKSPACES: { id: GameView; label: string; hint: string; icon: typeof Crosshair }[] = [
  { id: 'battlefield', label: 'Battlefield', hint: 'F1', icon: Crosshair },
  { id: 'models', label: 'Model Preview', hint: 'F2', icon: Layers },
  { id: 'buildings', label: 'Building Designer', hint: 'F3', icon: Building2 },
  { id: 'sfx', label: 'SFX Designer', hint: 'F4', icon: AudioLines },
]

function IconButton({ label, onClick, children, active = false }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return <Tooltip><TooltipTrigger render={<Button variant={active ? 'secondary' : 'ghost'} size="icon" aria-label={label} onClick={onClick} />}>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}

function WorkspaceMenu({ view, open, setOpen, setView, openCommand, openHelp, openSettings, restart }: { view: GameView; open: boolean; setOpen: (open: boolean) => void; setView: (view: GameView) => void; openCommand: () => void; openHelp: () => void; openSettings: () => void; restart: () => void }) {
  const subtitle = view === 'battlefield' ? 'San Diego · City theater' : view === 'models' ? 'Unit catalog · 3D preview' : view === 'buildings' ? 'Modular preset generator' : 'Three-layer tone generator'
  return <div className={styles.workspaceNav}>
    <button className={styles.workspaceButton} aria-haspopup="menu" aria-expanded={open} aria-controls="workspace-menu" onClick={() => setOpen(!open)}>
      <span className={styles.brandOrb}><Crosshair size={17} /></span><span><strong>GRID COMMAND</strong><small>{subtitle}</small></span><Menu className={styles.menuIcon} size={20} />
    </button>
    {open && <><button className={styles.menuDismiss} aria-label="Close workspace menu" onClick={() => setOpen(false)} /><div id="workspace-menu" role="menu" className={styles.workspaceDropdown}>
      {WORKSPACES.map(item => <button key={item.id} role="menuitem" className={cn(styles.workspaceItem, item.id === view && styles.active)} onClick={() => { setView(item.id); setOpen(false) }}><item.icon size={16} /><span>{item.label}</span><kbd>{item.hint}</kbd></button>)}
      <div className={styles.menuDivider} />
      {view === 'battlefield' && <button role="menuitem" className={styles.workspaceItem} onClick={() => { openCommand(); setOpen(false) }}><Shield size={16} /><span>Command center</span></button>}
      <button role="menuitem" className={styles.workspaceItem} onClick={() => { openSettings(); setOpen(false) }}><Settings2 size={16} /><span>Graphics &amp; settings</span></button>
      <button role="menuitem" className={styles.workspaceItem} onClick={() => { openHelp(); setOpen(false) }}><CircleHelp size={16} /><span>Controls &amp; help</span></button>
      <button role="menuitem" className={styles.workspaceItem} onClick={() => { restart(); setOpen(false) }}><RotateCcw size={16} /><span>New operation</span></button>
    </div></>}
  </div>
}

function ForceOverview({ state, side, setSide, focus, openCommand }: { state: BattleState; side: 'BLU' | 'RED'; setSide: (side: 'BLU' | 'RED') => void; focus: (point: { x: number; y: number }) => void; openCommand: () => void }) {
  const force = state.forces[side], units = state.units.filter(unit => unit.side === side && unit.hp > 0 && !unit.external), people = units.reduce((total, unit) => total + unit.members, 0)
  return <section className={styles.forceOverview} aria-label={`${side} force summary`}>
    <div className={styles.forceSwitch} role="radiogroup" aria-label="Displayed force">{(['BLU', 'RED'] as const).map(value => <button key={value} role="radio" aria-checked={side === value} className={cn(side === value && styles.active, value === 'RED' && styles.red)} onClick={() => setSide(value)}><i />{value} FORCE</button>)}</div>
    <div className={styles.forceTitle}><button onClick={() => focus(BASES[side])}>{side === 'BLU' ? 'Saber Command' : 'Viper Command'}</button><span>{side} · TF {side === 'BLU' ? 'SABER' : 'VIPER'}</span></div>
    <div className={styles.forceMetrics}><div><strong>{people}<small> / {units.length}</small></strong><span>Personnel / groups</span></div><div><strong>{Math.floor(force.sp).toLocaleString()}</strong><span>Supply points</span></div></div>
    <div className={styles.tempoLabel}><span>Operational tempo</span><strong className={force.tempo >= 85 ? styles.warning : undefined}>{Math.round(force.tempo)} <small>/ 100</small></strong></div>
    <div className={styles.tempoTrack} role="meter" aria-label={`${side} operational tempo`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(force.tempo)}><i style={{ width: `${force.tempo}%` }} /></div>
    {force.tempo >= 85 && <p className={styles.tempoNote}>Near saturation — new orders will queue</p>}
    <div className={styles.currentOrder}><span><small>CURRENT ORDER</small><strong>{force.action} · OBJ {force.target}</strong></span><button onClick={openCommand}>Change</button></div>
  </section>
}
export function Game() {
  const [view, setView] = useState<GameView>('battlefield')
  const [state, setState] = useState<BattleState>(() => initialState()), stateRef = useRef(state)
  const worker = useRef<Worker | null>(null), mapAPI = useRef<MapAPI | null>(null), lastUI = useRef(0)
  const [perspective] = useState<Perspective>('OBS'), [selected, setSelected] = useState<string | null>(null)
  const [graphics, setGraphics] = useState<Graphics>(DEFAULT_GRAPHICS), [fps, setFps] = useState<number | null>(null)
  const [modal, setModal] = useState<string | null>(null), [audio, setAudio] = useState(false), [radioFilter, setRadioFilter] = useState('all')
  const setStatus = useCallback((_message: string) => {}, []), [mobileOpen, setMobileOpen] = useState(false), [workspaceOpen, setWorkspaceOpen] = useState(false), [activeSide, setActiveSide] = useState<'BLU' | 'RED'>('BLU')
  const elementRail = useRef<HTMLDivElement>(null)
  const spoken = useRef(1), [workerError, setWorkerError] = useState('')
  const [soundEngine] = useState(() => new BattlefieldAudio())
  const audioView = useRef({ perspective, selected }); audioView.current = { perspective, selected }
  useEffect(() => { soundEngine.restore(); const timer = setInterval(() => { const s=stateRef.current, view=audioView.current; soundEngine.update(s,view.perspective,s.units.find(u=>u.id===view.selected)||{x:0,y:0}) },100); const muteHidden=()=>{if(document.hidden)soundEngine.stop()};document.addEventListener('visibilitychange',muteHidden);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',muteHidden);soundEngine.dispose()} },[soundEngine])
  useEffect(() => {
    const w = new Worker(new URL('../../lib/game/simulation.worker.ts', import.meta.url), { type: 'module' }); worker.current = w
    w.onmessage = (e: MessageEvent<BattleState>) => { const previous = stateRef.current; stateRef.current = e.data; const now = performance.now(); if (now - lastUI.current > 240 || e.data.paused || previous.paused !== e.data.paused || previous.speed !== e.data.speed || e.data.tick === 0 || e.data.winner) { lastUI.current = now; setState(e.data) } }
    w.onerror = () => { setWorkerError('Simulation interrupted. Restart the operation or reload.'); setStatus('Simulation worker error') }
    w.postMessage({ type: 'init', seed: 3701 })
    return () => { w.terminate(); worker.current = null; if ('speechSynthesis' in window) window.speechSynthesis.cancel() }
  }, [])
  const pause = useCallback(() => { const next = !stateRef.current.paused; worker.current?.postMessage({ type: 'pause', value: next }); setState(s => ({ ...s, paused: next })); stateRef.current = { ...stateRef.current, paused: next } }, [])
  const speed = useCallback((n: number) => { worker.current?.postMessage({ type: 'speed', value: n }); setState(s => ({ ...s, speed: n })); stateRef.current = { ...stateRef.current, speed: n } }, [])
  const onGeometry = useCallback((packet: import('@/lib/game/types').GeometryPacket) => worker.current?.postMessage({ type: 'geometry', packet }), [])
  const onReady = useCallback((api: MapAPI) => { mapAPI.current = api }, [])
  const selectUnit = useCallback((unit: Unit) => { const live = stateRef.current.units.find(u => u.id === unit.id) || unit; setSelected(live.id); setMobileOpen(false) }, [])
  const focus = useCallback((point: { x: number; y: number }) => { setSelected(null); mapAPI.current?.focus(point); setMobileOpen(false) }, [])
  const upgradeMob = useCallback((side: 'BLU' | 'RED') => worker.current?.postMessage({ type: 'upgrade-mob', side }), [])
  const buildObjectiveFacility = useCallback((side: 'BLU'|'RED', objectiveId: string, kind: 'helipad'|'vehicleBay') => worker.current?.postMessage({type:'build-objective-facility',side,objectiveId,kind}),[])
  const restart = () => { setModal(null); setSelected(null); setWorkerError(''); const seed = crypto.getRandomValues(new Uint32Array(1))[0]; worker.current?.postMessage({ type: 'restart', seed }); mapAPI.current?.overview(); setTimeout(() => mapAPI.current?.reimport(), 1200) }
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const editing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName))
      if (!editing && ['F1', 'F2', 'F3', 'F4'].includes(e.key)) { e.preventDefault(); setView(WORKSPACES[Number(e.key.slice(1)) - 1].id); setWorkspaceOpen(false); return }
      if (e.key === 'Escape') { setWorkspaceOpen(false); setMobileOpen(false); if (view === 'battlefield') setSelected(null) }
      if (view !== 'battlefield' || modal || editing) return
      if (e.code === 'Space') { e.preventDefault(); pause() }
      if (['1', '2', '4', '8'].includes(e.key)) speed(Number(e.key))
      if (e.key.toLowerCase() === 'o') mapAPI.current?.overview()
      if (e.key.toLowerCase() === 'g') setGraphics(g => ({ ...g, grid: !g.grid }))
      if (e.key === 'F9') { e.preventDefault(); setGraphics(g => ({ ...g, routes: !g.routes })) }
    }
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle)
  }, [modal, pause, speed, view])
  useEffect(() => {
    const event = state.events[0]
    if (!event || event.id <= spoken.current) return
    spoken.current = event.id
    if (!audio || !('speechSynthesis' in window) || (perspective !== 'OBS' && event.side !== perspective && event.side !== 'SYS')) return
    if (window.speechSynthesis.speaking) return
    const utterance = new SpeechSynthesisUtterance(event.text); utterance.rate = 1.08; utterance.volume = .65; window.speechSynthesis.speak(utterance)
  }, [state.events, audio, perspective])
  const toggleAudio = () => { if (!('speechSynthesis' in window)) { setStatus('Speech synthesis unavailable in this browser'); return } setAudio(a => !a); window.speechSynthesis.cancel(); spoken.current = state.events[0]?.id || 0 }
  const selectedUnit = state.units.find(u => u.id === selected)
  const canControlSelected = !!selectedUnit && selectedUnit.hp > 0 && (perspective === 'OBS' || perspective === selectedUnit.side)
  const getInTarget = selectedUnit && canControlSelected && transportSquad(selectedUnit) && !selectedUnit.carrier ? nearestPersonnelCarrier(state, selectedUnit) : undefined
  const selectedPassengers = selectedUnit && troopSeats(selectedUnit.role) ? state.units.filter(u => u.carrier === selectedUnit.id && u.hp > 0) : []
  const dismountCarrier = selectedUnit?.carrier ? state.units.find(u => u.id === selectedUnit.carrier) : selectedPassengers.length ? selectedUnit : undefined
  const attachedVehicles = selectedUnit ? state.units.filter(u => selectedUnit.attachedVehicles?.includes(u.id) || u.attachedSquad === selectedUnit.id) : []
  const crewDismountCarrier = selectedUnit && !isVehicle(selectedUnit.role) ? dismountCarrier || attachedVehicles.find(u => !isAir(u.role) && u.hp > 0 && !u.crewBailed) : undefined
  const transportAction = useCallback((action: 'get-in' | 'dismount' | 'dismount-all', unit: Unit, carrierId?: string) => worker.current?.postMessage({ type: 'transport-action', action, unitId: unit.id, carrierId, side: unit.side }), [])
  const events = state.events.filter(e => (radioFilter === 'all' || e.type === radioFilter) && (perspective === 'OBS' || e.side === 'SYS' || e.side === perspective))
  const railUnits = state.units.filter(unit => unit.side === activeSide && unit.hp > 0 && !unit.external)
  return <main className={cn('game-shell font-sans', styles.shell)}>
    <WorkspaceMenu view={view} open={workspaceOpen} setOpen={setWorkspaceOpen} setView={setView} openCommand={() => setMobileOpen(true)} openHelp={() => setModal('help')} openSettings={() => setModal('settings')} restart={() => setModal('restart')} />
    <div className="battle-workspace" id="panel-battlefield" role="tabpanel" aria-label="Battlefield" hidden={view !== 'battlefield'}>
      <div className="battle-main"><section className="map-area" aria-label="Live battlefield">
        <Battlefield active={view === 'battlefield'} stateRef={stateRef} graphics={graphics} perspective={perspective} selected={selected} onSelect={setSelected} onReady={onReady} onFPS={setFps} onStatus={setStatus} onGeometry={onGeometry} />
        <div className={styles.leftHud}>
          <ForceOverview state={state} side={activeSide} setSide={setActiveSide} focus={focus} openCommand={() => setMobileOpen(true)} />
          <section className={styles.radioPanel} aria-label="Radio traffic"><div className={styles.radioHeader}><span>RADIO TRAFFIC</span><div><label className="sr-only" htmlFor="radio-channel">Radio channel filter</label><select id="radio-channel" value={radioFilter} onChange={event => setRadioFilter(event.target.value)}><option value="all">All</option><option value="command">Command</option><option value="combat">Contact</option><option value="logistics">Logistics</option></select><button aria-label={audio ? 'Mute radio' : 'Enable radio audio'} onClick={toggleAudio}>{audio ? <AudioLines size={14} /> : <VolumeX size={14} />}</button></div></div><div className={styles.radioFeed} role="log" aria-live="off">{events.length ? events.slice(0, 30).map(event => <div className={styles.radioLine} key={event.id}><span><time>{clock(event.time)}</time><i className={cn(event.side === 'RED' && styles.red, event.side === 'SYS' && styles.system)}>{event.side}</i></span><p>{event.text}</p></div>) : <p className={styles.emptyRadio}>No reports on this channel.</p>}</div></section>
        </div>
        <div className={styles.timeHud}><div className={styles.clockCard}><small>ELAPSED</small><strong>{clock(state.time)}</strong></div><div className={styles.timeControls}><IconButton label={state.paused ? 'Resume simulation (Space)' : 'Pause simulation (Space)'} onClick={pause}>{state.paused ? <Play /> : <Pause />}</IconButton><IconButton label="Advance one simulation tick" onClick={() => { worker.current?.postMessage({ type: 'pause', value: true }); worker.current?.postMessage({ type: 'step' }) }}><SkipForward /></IconButton><ToggleGroup aria-label="Simulation speed" spacing={0} value={[String(state.speed)]} onValueChange={value => value.length && speed(Number(value[0]))}>{[1, 2, 4, 8, 16].map(value => <ToggleGroupItem key={value} value={String(value)}>{value}×</ToggleGroupItem>)}</ToggleGroup></div><div className={cn('objective-strip', styles.objectives)}>{state.objectives.map(objective => <button key={objective.id} className={cn('objective-button', objective.owner === 'BLU' && 'blu', objective.owner === 'RED' && 'red', objective.contested && 'contested')} aria-label={`Focus objective ${objective.id}: ${objective.name}, ${objective.owner || 'neutral'}`} onClick={() => focus(objective)}>{objective.id}</button>)}</div></div>
        <div className={styles.mapTools}><button className="map-control" onClick={() => mapAPI.current?.overview()} title="Overview (O)"><LocateFixed /></button><button className="map-control" aria-label="Toggle top-down and 3D camera" onClick={() => mapAPI.current?.tilt()}><Layers /></button><button className="map-control" aria-label="Reset bearing to north" onClick={() => mapAPI.current?.rotate()}><Navigation2 /></button><button className="map-control" aria-label="Zoom in" onClick={() => mapAPI.current?.zoom(1)}><Plus /></button><button className="map-control" aria-label="Zoom out" onClick={() => mapAPI.current?.zoom(-1)}><Minus /></button><button className="map-control" aria-label="Toggle fullscreen" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() } catch { setStatus('Fullscreen blocked by browser') } }}><Maximize2 /></button></div>
        {state.paused && !state.winner && <div className={styles.paused}>SIMULATION PAUSED</div>}
        {selectedUnit && <aside className={styles.inspector} role="region" aria-label="Selected unit details" tabIndex={0}><header><div><small>{selectedUnit.side} · {selectedUnit.role.replaceAll('_', ' ')}</small><strong>{selectedUnit.name}</strong></div><button aria-label="Clear selected unit" onClick={() => setSelected(null)}><X size={16} /></button></header><div className={styles.inspectorBody}><p className={styles.phase}>{selectedUnit.hp > 0 ? selectedUnit.mission : 'ELEMENT LOST'} <span>{selectedUnit.target} · {selectedUnit.subcommand}</span></p><div className={styles.inspectorStats}><div><strong>{Math.round(selectedUnit.hp)}%</strong><small>Condition</small></div><div><strong>{Math.round(selectedUnit.ammo)}%</strong><small>Ammunition</small></div><div><strong>{selectedUnit.members}/{selectedUnit.maxMembers}</strong><small>Personnel</small></div></div>{isVehicle(selectedUnit.role) && <div className={cn(styles.vehicleStatus, selectedUnit.fuel <= 15 && styles.warning)}><strong>Fuel {Math.round(selectedUnit.fuel)}% — {selectedUnit.engine ? 'engine running' : 'engine off'}</strong></div>}<dl className={styles.inspectorDetails}>{isVehicle(selectedUnit.role) && <><dt>Servicing</dt><dd>{selectedUnit.serviceStatus || (selectedUnit.servicing ? `Returning to ${isAir(selectedUnit.role) ? 'airfield' : 'MOB'}` : `${isAir(selectedUnit.role) ? 'Airfield' : 'MOB'} only · ${CATALOG[selectedUnit.role].cost.toLocaleString()} SP`)}</dd></>}{selectedUnit.carrier && <><dt>Embarked</dt><dd>{state.units.find(unit => unit.id === selectedUnit.carrier)?.name}</dd></>}{attachedVehicles.length > 0 && <><dt>Attached</dt><dd>{attachedVehicles.map(unit => unit.name).join(', ')}</dd></>}{selectedUnit.attachedSquad && <><dt>Squad</dt><dd>{state.units.find(unit => unit.id === selectedUnit.attachedSquad)?.name || 'Squad'}</dd></>}{!!selectedUnit.transport?.passengers?.length && <><dt>Manifest</dt><dd>{state.units.filter(unit => selectedUnit.transport?.passengers?.includes(unit.id)).map(unit => unit.name).join(', ')}</dd></>}{selectedUnit.transport && <><dt>Seats</dt><dd>{troopSeats(selectedUnit.role) > 0 ? `${state.units.filter(unit => selectedUnit.transport?.passengers?.includes(unit.id)).reduce((total, unit) => total + unit.members, 0)} / ${troopSeats(selectedUnit.role)}` : `${selectedUnit.transport.cargo || 0} supplies`}</dd></>}{selectedUnit.travelStatus && <><dt>Status</dt><dd>{selectedUnit.travelStatus}</dd></>}</dl>{canControlSelected && (getInTarget || dismountCarrier || crewDismountCarrier) && <div className={styles.inspectorActions}>{getInTarget && <Button size="sm" variant="outline" onClick={() => transportAction('get-in', selectedUnit, getInTarget.id)}>Get in · {getInTarget.name}</Button>}{dismountCarrier && <Button size="sm" variant="outline" onClick={() => transportAction('dismount', selectedUnit)}>Dismount passengers</Button>}{crewDismountCarrier && !isAir(crewDismountCarrier.role) && <Button size="sm" variant="destructive" onClick={() => transportAction('dismount-all', selectedUnit)}>Dismount all incl. crew</Button>}</div>}{eligibleBuilder(selectedUnit) && canControlSelected && <Button size="sm" variant="outline" onClick={() => worker.current?.postMessage({ type: 'deploy-jammer', builder: selectedUnit.id, side: selectedUnit.side })}>Deploy UAV jammer · 200 SP</Button>}</div><footer><span><i />{selectedUnit.hp > 0 ? 'Camera following unit' : 'Last known position'}</span><button onClick={() => setSelected(null)}>Release</button></footer></aside>}
        <section className={cn(styles.elementRail, selectedUnit && styles.withInspector)} aria-label={`${activeSide} elements`}><div className={styles.railLabel}>{activeSide} ELEMENTS · {railUnits.length}<span>{state.forces[activeSide].casualties} LOST</span></div><div className={styles.railRow}><button className={styles.railArrow} aria-label="Previous elements" onClick={() => elementRail.current?.scrollBy({ left: -500, behavior: 'smooth' })}><ChevronLeft /></button><div className={styles.railCards} ref={elementRail}>{railUnits.map(unit => <button key={unit.id} className={cn(styles.elementCard, selected === unit.id && styles.selected, unit.side === 'RED' && styles.red)} aria-pressed={selected === unit.id} onClick={() => selectUnit(unit)}><span><i /><strong>{unit.name}</strong></span><small>{unit.role.replaceAll('_', ' ').toLowerCase()}</small><div><i style={{ width: `${Math.max(0, unit.hp)}%` }} /><span>{unit.members}/{unit.maxMembers}</span></div></button>)}</div><button className={styles.railArrow} aria-label="Next elements" onClick={() => elementRail.current?.scrollBy({ left: 500, behavior: 'smooth' })}><ChevronRight /></button></div></section>
        {state.winner && <div className="winner-banner" role="status"><Flag className="mx-auto mb-3 text-primary" size={28} /><h2 className="text-xl font-medium">{state.winner === 'DRAW' ? 'Mutual command loss' : `${state.winner} force victorious`}</h2><p className="py-3 text-sm text-muted-foreground">Operation ended at {clock(state.time)}.</p><Button onClick={restart}>New operation</Button></div>}
        {workerError && <div className="winner-banner" role="alert"><p className="pb-4 text-sm">{workerError}</p><Button onClick={() => window.location.reload()}>Reload simulation</Button></div>}
      </section></div>
      {mobileOpen && <button className={styles.drawerDismiss} aria-label="Close command center" onClick={() => setMobileOpen(false)} />}
      <div className={cn(styles.commandDrawer, mobileOpen && styles.open)}><button className={styles.drawerClose} aria-label="Close command center" onClick={() => setMobileOpen(false)}><X /></button><CommandPanel state={state} perspective={perspective} preferredSide={activeSide} selected={selected} onSelect={selectUnit} focus={focus} mobileOpen={mobileOpen} onUpgradeMob={upgradeMob} onBuildObjective={buildObjectiveFacility} /></div>
    </div>
    <div id="panel-models" role="tabpanel" aria-label="Model Preview" className={cn('model-tab-panel', styles.workspacePanel)} hidden={view !== 'models'}><UnitLab embedded active={view === 'models'} simulationPaused={state.paused || !!state.winner} soundEngine={soundEngine} /></div>
    <div id="panel-buildings" role="tabpanel" aria-label="Building Designer" className={cn('model-tab-panel', styles.workspacePanel)} hidden={view !== 'buildings'}><BuildingEditor /></div>
    <div id="panel-sfx" role="tabpanel" aria-label="SFX Designer" className={cn('model-tab-panel', styles.workspacePanel)} hidden={view !== 'sfx'}><SoundSettings engine={soundEngine} /></div>
    <div className={styles.diagnostics}>{view === 'battlefield' ? `${fps === null ? '—' : fps === 0 ? '<1' : fps} FPS · ` : ''}BUILD 0.9.14</div>
    <GameDialogs modal={modal} onClose={() => setModal(null)} graphics={graphics} setGraphics={setGraphics} restart={restart} />
  </main>
}

