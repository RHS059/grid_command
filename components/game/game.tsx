'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, AudioLines, Building2, ChevronDown, CircleHelp, Crosshair, Expand, Eye, Flag, Layers, LocateFixed, MapPin, Maximize2, Minus, Pause, Play, Plus, Radio, RotateCcw, Settings2, Shield, SkipForward, Volume2, VolumeX, X, PanelLeft, Navigation2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Battlefield, type MapAPI } from './battlefield'
import { CommandPanel, UnitIcon } from './command-panel'
import { GameDialogs } from './game-dialogs'
import { clock, DEFAULT_GRAPHICS, initialState, type BattleState, type Graphics, type Perspective, type Unit } from '@/lib/game/types'
import { cn } from '@/lib/utils'
import { BattlefieldAudio } from '@/lib/game/audio'
import { UnitLab } from './unit-lab'
import { SoundSettings } from './sound-settings'
import { BuildingEditor } from './building-editor'
import { eligibleBuilder } from '@/lib/game/electronic-warfare'
import { troopSeats, isVehicle, isAir, CATALOG } from '@/lib/game/types'
import { nearestPersonnelCarrier, transportSquad } from '@/lib/game/transport'

function IconButton({ label, onClick, children, active = false }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return <Tooltip><TooltipTrigger render={<Button variant={active ? 'secondary' : 'ghost'} size="icon" aria-label={label} onClick={onClick} />}>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}
export function Game() {
  const [view, setView] = useState<'battlefield' | 'models' | 'buildings' | 'sfx'>('battlefield')
  const [state, setState] = useState<BattleState>(() => initialState()), stateRef = useRef(state)
  const worker = useRef<Worker | null>(null), mapAPI = useRef<MapAPI | null>(null), lastUI = useRef(0)
  const [perspective, setPerspective] = useState<Perspective>('OBS'), [selected, setSelected] = useState<string | null>(null)
  const [graphics, setGraphics] = useState<Graphics>(DEFAULT_GRAPHICS), [fps, setFps] = useState<number | null>(null)
  const [modal, setModal] = useState<string | null>(null), [audio, setAudio] = useState(false), [radioFilter, setRadioFilter] = useState('all')
  const setStatus = useCallback((_message: string) => {}, []), [mobileOpen, setMobileOpen] = useState(false)
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
      if (view !== 'battlefield' || modal || (e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)))) return
      if (e.code === 'Space') { e.preventDefault(); pause() }
      if (['1', '2', '4', '8'].includes(e.key)) speed(Number(e.key))
      if (e.key.toLowerCase() === 'o') mapAPI.current?.overview()
      if (e.key.toLowerCase() === 'g') setGraphics(g => ({ ...g, grid: !g.grid }))
      if (e.key === 'F9') { e.preventDefault(); setGraphics(g => ({ ...g, routes: !g.routes })) }
      if (e.key === 'Escape') setSelected(null)
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
  const owned = (side: 'BLU' | 'RED') => state.objectives.filter(o => o.owner === side).length
  return <main className="game-shell font-sans">
    <header className="game-header">
      <div className="flex items-center gap-3"><div className="brand-icon"><Crosshair size={25} strokeWidth={1.4} /></div><div><div className="wordmark">GRID COMMAND</div><div className="brand-subtitle font-mono">AUTONOMOUS WARFARE SIMULATOR</div></div><div className="header-divider header-location" /><div className="header-location flex flex-col gap-1"><span className="text-sm font-medium">Operation Pacific Shield</span><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={12} />San Diego, California</span></div><span className="scenario-tag header-secondary">BUILD 0.9.11</span></div>
      <div className="flex items-center gap-2"><IconButton label="How to observe · controls" onClick={() => setModal('help')}><CircleHelp /></IconButton><span className="desktop-only"><IconButton label={audio ? 'Mute radio voice' : 'Enable radio voice'} onClick={toggleAudio} active={audio}>{audio ? <Volume2 /> : <VolumeX />}</IconButton></span><IconButton label="Graphics & settings" onClick={() => setModal('settings')}><Settings2 /></IconButton><span className="desktop-only"><IconButton label="New operation" onClick={() => setModal('restart')}><RotateCcw /></IconButton></span></div>
    </header>
    <div className="game-view-tabs" role="tablist" aria-label="Game view" onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const views=['battlefield','models','buildings','sfx'] as const,index=views.indexOf(view),next=views[(index+(e.key==='ArrowRight'?1:views.length-1))%views.length];setView(next);document.getElementById(`tab-${next}`)?.focus() } }}>{(['battlefield', 'models', 'buildings', 'sfx'] as const).map(id => <button key={id} role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={view === id} tabIndex={view === id ? 0 : -1} onClick={() => setView(id)}>{id === 'battlefield' ? <Crosshair size={16} /> : id === 'models' ? <Layers size={16} /> : id === 'buildings' ? <Building2 size={16} /> : <AudioLines size={16} />}{id === 'battlefield' ? 'Battlefield' : id === 'models' ? 'Model Preview' : id === 'buildings' ? 'Building Designer' : 'SFX Designer'}</button>)}</div>
    <div className="game-toolbar">
      <div className="flex items-center gap-4"><div className="flex flex-col"><span className="font-mono text-[10px] tracking-widest text-muted-foreground">MISSION ELAPSED</span><span className="timer">{clock(state.time)}</span></div><div className="flex items-center gap-1"><IconButton label={state.paused ? 'Resume simulation (Space)' : 'Pause simulation (Space)'} onClick={pause}>{state.paused ? <Play /> : <Pause />}</IconButton><span className="desktop-only"><IconButton label="Advance one simulation tick" onClick={() => { worker.current?.postMessage({ type: 'pause', value: true }); worker.current?.postMessage({ type: 'step' }) }}><SkipForward /></IconButton></span></div><ToggleGroup aria-label="Simulation speed" spacing={0} value={[String(state.speed)]} onValueChange={v => v.length && speed(Number(v[0]))}>{[1, 2, 4, 8, 16].map(n => <ToggleGroupItem key={n} value={String(n)}>{n}×</ToggleGroupItem>)}</ToggleGroup></div>
      <div className="objective-strip"><span className="toolbar-label eyebrow pr-2">OBJECTIVES</span><span className="font-mono text-sm text-primary pr-1">{owned('BLU')}</span>{state.objectives.map(o => <button key={o.id} className={cn('objective-button', o.owner === 'BLU' && 'blu', o.owner === 'RED' && 'red', o.contested && 'contested')} aria-label={`Focus objective ${o.id}: ${o.name}, ${o.owner || 'neutral'}`} onClick={() => focus(o)}>{o.id}</button>)}<span className="font-mono text-sm text-destructive pl-1">{owned('RED')}</span></div>
      <div className="flex items-center gap-2"><Eye size={15} className="desktop-only text-muted-foreground" /><ToggleGroup aria-label="Observer perspective" spacing={0} value={[perspective]} onValueChange={v => { if (v.length) { setPerspective(v[0] as Perspective); setSelected(null) } }}><ToggleGroupItem value="OBS">Observer</ToggleGroupItem><ToggleGroupItem value="BLU">BLU</ToggleGroupItem><ToggleGroupItem value="RED">RED</ToggleGroupItem></ToggleGroup></div>
    </div>
    <div className="battle-workspace" id="panel-battlefield" role="tabpanel" aria-labelledby="tab-battlefield" style={view !== 'battlefield' ? { display: 'none' } : undefined}>
      <CommandPanel state={state} perspective={perspective} selected={selected} onSelect={selectUnit} focus={focus} mobileOpen={mobileOpen} onUpgradeMob={upgradeMob} onBuildObjective={buildObjectiveFacility} />
      <div className="battle-main">
        <section className="map-area" aria-label="Live battlefield">
          <Battlefield active={view === 'battlefield'} stateRef={stateRef} graphics={graphics} perspective={perspective} selected={selected} onSelect={setSelected} onReady={onReady} onFPS={setFps} onStatus={setStatus} onGeometry={onGeometry} />
          <div className="map-title"><span className="eyebrow">AREA OF OPERATIONS</span><h1>San Diego <span className="text-muted-foreground">/</span> City theater</h1><div className="map-coordinate">SAN PASQUAL ↔ SAN YSIDRO · 10 OBJECTIVES</div></div>
          <div className="map-actions"><button className="map-control mobile-only" aria-label="Toggle force panel" onClick={() => setMobileOpen(v => !v)}><PanelLeft /></button><button className="map-control" onClick={() => mapAPI.current?.overview()} title="Overview (O)"><LocateFixed /><span className="desktop-only">Overview</span></button><button className="map-control desktop-only" aria-label="Toggle top-down and 3D camera" onClick={() => mapAPI.current?.tilt()}><Layers /><span>3D</span></button><button className="map-control desktop-only" aria-label="Toggle fullscreen" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() } catch { setStatus('Fullscreen blocked by browser · open the standalone preview') } }}><Maximize2 /></button></div>
          <div className="map-zoom"><button className="map-control" aria-label="Reset bearing to north" onClick={() => mapAPI.current?.rotate()}><Navigation2 /></button><button className="map-control" aria-label="Zoom in" onClick={() => mapAPI.current?.zoom(1)}><Plus /></button><button className="map-control" aria-label="Zoom out" onClick={() => mapAPI.current?.zoom(-1)}><Minus /></button></div>
          {state.paused && !state.winner && <div className="paused-label">SIMULATION PAUSED</div>}
          {selectedUnit && <div className="selected-card" role="region" aria-label="Selected unit details" tabIndex={0}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className={cn('unit-symbol', selectedUnit.side === 'RED' && 'red')}><UnitIcon role={selectedUnit.role} /></div><span className="unit-name">{selectedUnit.name}</span></div><Button variant="ghost" size="icon-sm" aria-label="Clear selected unit" onClick={() => setSelected(null)}><X /></Button></div><p className="pt-3 text-sm text-muted-foreground">{selectedUnit.hp > 0 ? `${selectedUnit.mission} · ${selectedUnit.target}` : 'ELEMENT LOST'}<span> · {selectedUnit.subcommand}</span></p><div className="selected-stats"><div>{Math.round(selectedUnit.hp)}%<small>CONDITION</small></div><div>{Math.round(selectedUnit.ammo)}%<small>AMMUNITION</small></div><div>{selectedUnit.members}/{selectedUnit.maxMembers}<small>PERSONNEL</small></div></div>{isVehicle(selectedUnit.role) && <div className="flex flex-col gap-2 pt-3 text-sm"><p className="text-primary">Fuel {Math.round(selectedUnit.fuel)}% · {selectedUnit.engine ? 'Engine running' : 'Engine off'}</p><p className="text-muted-foreground">{selectedUnit.serviceStatus || (selectedUnit.servicing ? `Returning to ${isAir(selectedUnit.role) ? 'airfield' : 'MOB'} for service` : `Service at ${isAir(selectedUnit.role) ? 'airfield' : 'MOB'} only`)} · {CATALOG[selectedUnit.role].cost.toLocaleString()} SP acquisition</p></div>}{selectedUnit.carrier&&<p className="pt-3 text-sm text-primary">Embarked on {state.units.find(u=>u.id===selectedUnit.carrier)?.name}</p>}{attachedVehicles.length>0&&<p className="pt-3 text-sm text-primary">Attached vehicles: {attachedVehicles.map(u=>u.name).join(', ')}</p>}{selectedUnit.attachedSquad&&<p className="pt-3 text-sm text-primary">Attached to {state.units.find(u=>u.id===selectedUnit.attachedSquad)?.name||'squad'}</p>}{selectedUnit.construction&&<p className="pt-3 text-sm text-primary">Coverage online in {Math.max(0,Math.ceil(selectedUnit.construction.due-state.time))}s</p>}{selectedUnit.lock&&<p className="pt-3 text-sm text-primary">Acquiring aircraft · {Math.max(0,2.5-(state.time-selectedUnit.lock.since)).toFixed(1)}s</p>}{!!selectedUnit.transport?.passengers?.length&&<p className="pt-3 text-sm text-muted-foreground">Manifest: {state.units.filter(u=>selectedUnit.transport?.passengers?.includes(u.id)).map(u=>u.name).join(', ')}</p>}{selectedUnit.travelStatus && <p className="pt-3 text-sm text-muted-foreground">{selectedUnit.travelStatus}</p>}{selectedUnit.transport && <p className="pt-3 text-sm text-muted-foreground">{selectedUnit.transport.phase.replaceAll('-',' ')} · Fuel {Math.round(selectedUnit.fuel)}%{troopSeats(selectedUnit.role)>0 ? ` · ${state.units.filter(u=>selectedUnit.transport?.passengers?.includes(u.id)).reduce((n,u)=>n+u.members,0)}/${troopSeats(selectedUnit.role)} seats` : ` · ${selectedUnit.transport.cargo||0} supplies`}</p>}{canControlSelected&&(getInTarget||dismountCarrier||crewDismountCarrier)&&<div className="flex flex-wrap gap-2 pt-3">{getInTarget&&<Button size="sm" variant="outline" onClick={()=>transportAction('get-in',selectedUnit,getInTarget.id)}>Get in · {getInTarget.name} ({Math.round(Math.hypot(getInTarget.x-selectedUnit.x,getInTarget.y-selectedUnit.y))} m)</Button>}{dismountCarrier&&<Button size="sm" variant="outline" onClick={()=>transportAction('dismount',selectedUnit)}>Dismount passengers · {dismountCarrier.name}</Button>}{crewDismountCarrier&&!isAir(crewDismountCarrier.role)&&<Button size="sm" variant="destructive" onClick={()=>transportAction('dismount-all',selectedUnit)}>Dismount all incl. crew · {crewDismountCarrier.name}</Button>}</div>}{eligibleBuilder(selectedUnit)&&(perspective==='OBS'||selectedUnit.side===perspective)&&<div className="pt-3"><Button size="sm" variant="outline" onClick={()=>worker.current?.postMessage({type:'deploy-jammer',builder:selectedUnit.id,side:selectedUnit.side})}>Deploy UAV jammer · 200 SP</Button></div>}<div className="flex items-center gap-2 pt-4 text-xs text-primary"><LocateFixed size={13} />{selectedUnit.hp > 0 ? 'Camera following unit' : 'Last known position'}</div></div>}
          {state.winner && <div className="winner-banner" role="status"><Flag className="mx-auto mb-3 text-primary" size={28} /><h2 className="text-xl font-medium">{state.winner === 'DRAW' ? 'Mutual command loss' : `${state.winner} force victorious`}</h2><p className="py-3 text-sm text-muted-foreground">Operation ended at {clock(state.time)}.</p><Button onClick={restart}>New operation</Button></div>}
          {workerError && <div className="winner-banner" role="alert"><p className="pb-4 text-sm">{workerError}</p><Button onClick={() => window.location.reload()}>Reload simulation</Button></div>}
          <div className="map-legend"><span><i className="legend-dot" />BLU forces</span><span><i className="legend-dot red" />RED forces</span><span><i className="legend-dot neutral" />Neutral objective</span><span className="desktop-only flex items-center gap-1.5 border-l border-border pl-4"><Eye size={12} />{perspective === 'OBS' ? 'All forces visible' : `${perspective} intelligence`}</span></div>
        </section>
        <section className="radio-panel" aria-label="Live radio traffic"><div className="radio-header"><div className="flex items-center gap-2"><Radio size={15} className="text-primary" /><h2 className="eyebrow">RADIO TRAFFIC</h2><span className="live-dot ml-2" /><span className="font-mono text-[10px] text-primary">LIVE</span></div><div className="flex items-center gap-3"><label className="sr-only" htmlFor="radio-channel">Radio channel filter</label><select id="radio-channel" value={radioFilter} onChange={e => setRadioFilter(e.target.value)} className="border-0 bg-transparent text-xs text-muted-foreground outline-none"><option value="all">All channels</option><option value="command">Command</option><option value="combat">Contact reports</option><option value="logistics">Logistics</option></select><button aria-label={audio ? 'Mute radio' : 'Enable radio audio'} onClick={toggleAudio} className="text-muted-foreground hover:text-primary">{audio ? <AudioLines size={16} /> : <VolumeX size={16} />}</button></div></div><div className="radio-feed" role="log" aria-live="off">{events.length ? events.slice(0, 30).map(e => <div className="radio-line" key={e.id}><time className="radio-time">{clock(e.time)}</time><span className={cn('radio-side', e.side === 'RED' && 'red', e.side === 'SYS' && 'sys')}>{e.side}</span><span className="radio-message">{e.text}</span></div>) : <p className="text-sm text-muted-foreground">Listening. No reports on this channel yet.</p>}</div></section>
      </div>
    </div>
    <div id="panel-models" role="tabpanel" aria-labelledby="tab-models" className="model-tab-panel" hidden={view !== 'models'}><UnitLab embedded active={view === 'models'} simulationPaused={state.paused || !!state.winner} soundEngine={soundEngine} /></div>
    <div id="panel-buildings" role="tabpanel" aria-labelledby="tab-buildings" className="model-tab-panel" hidden={view !== 'buildings'}><BuildingEditor /></div>
    <div id="panel-sfx" role="tabpanel" aria-labelledby="tab-sfx" className="model-tab-panel overflow-y-auto p-6" hidden={view !== 'sfx'}><div className="mx-auto max-w-3xl"><SoundSettings engine={soundEngine} /></div></div>
    <footer className="game-status"><div className="flex items-center gap-4"><span className="flex items-center gap-1.5"><Activity size={11} /><span className="text-primary">{view === 'models' ? 'MODEL VIEW' : view === 'buildings' ? 'BUILDING DESIGNER' : view === 'sfx' ? 'SFX DESIGNER' : `${fps === null ? '—' : fps === 0 ? '<1' : fps} FPS`}</span></span></div><div className="flex items-center gap-4"><span className="desktop-only">NEXT COMMAND {Math.max(0, 30 - Math.floor(state.time % 30))}s</span><span>NO TIME LIMIT</span></div></footer>
    <GameDialogs modal={modal} onClose={() => setModal(null)} graphics={graphics} setGraphics={setGraphics} restart={restart} />
  </main>
}

