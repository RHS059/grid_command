'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Box, RotateCcw, Plane, Building2, Users, Truck, Volume2, VolumeX } from 'lucide-react'
import { ModelViewport } from './model-viewport'
import { MODEL_CATALOG, MODEL_NAMES, MODEL_NOTES, modelCategory, type ModelId } from '@/lib/game/model-catalog'
import { CATALOG, isVehicle, type Role, type Side, type SoldierAction, type Stance, type Soldier } from '@/lib/game/types'
import { BattlefieldAudio } from '@/lib/game/audio'

export function UnitLab({ embedded = false, active = true, simulationPaused = false, soundEngine }: { embedded?: boolean; active?: boolean; simulationPaused?: boolean; soundEngine?:BattlefieldAudio }) {
  const [localSoundEngine]=useState(()=>new BattlefieldAudio()),engine=soundEngine||localSoundEngine
  const [model, setModel] = useState<ModelId>('ATTACK_HELI'), [category, setCategory] = useState('All models'), [side, setSide] = useState<Side>('BLU')
  const [action, setAction] = useState<SoldierAction>('idle'), [stance, setStance] = useState<Stance>('stand'), [condition, setCondition] = useState<Soldier['status']>('active')
  const [animate, setAnimate] = useState(true), [rotate, setRotate] = useState(false), [reset, setReset] = useState(0)
  const [soundPlaying,setSoundPlaying]=useState(false),[soundSpeed,setSoundSpeed]=useState(.35),[soundDistance,setSoundDistance]=useState(30),[soundAngle,setSoundAngle]=useState(0)
  const role:Role|undefined=model==='MOB'||model==='AIRFIELD'?undefined:model,vehicleRole=role&&isVehicle(role)?role:undefined
  const personnel = modelCategory(model) === 'Personnel', info = role ? CATALOG[role] : null
  useEffect(()=>{if(!soundEngine)localSoundEngine.restore();return()=>{if(!soundEngine)localSoundEngine.dispose()}},[localSoundEngine,soundEngine])
  useEffect(()=>{if(!active||!vehicleRole){engine.stopVehiclePreview();setSoundPlaying(false)}return()=>engine.stopVehiclePreview()},[active,engine,vehicleRole])
  useEffect(()=>{if(soundPlaying)engine.updateVehiclePreview(soundSpeed,soundDistance,soundAngle)},[engine,soundAngle,soundDistance,soundPlaying,soundSpeed])
  return <section className={`model-browser font-sans${embedded ? '' : ' standalone'}`} aria-label="Model Preview" hidden={!active}>
    <header className="model-browser-header"><div><div className="eyebrow">EQUIPMENT REFERENCE</div><h1>Model Preview</h1><p>Every unit. Every compound. The same models used on the battlefield.</p></div>{embedded ? <span className="model-session-status">{simulationPaused ? 'Battle simulation paused' : 'Battle simulation continues'}</span> : <Link href="/" className="text-sm text-primary underline">Return to battlefield</Link>}</header>
    <div className="model-browser-body">
      <aside className="model-library" aria-label="Model catalog"><label className="model-filter">Category<select className="settings-select" value={category} onChange={e => setCategory(e.target.value)}>{['All models', 'Aircraft', 'Vehicles', 'Personnel', 'Structures'].map(c => <option key={c}>{c}</option>)}</select></label>
        <div className="model-list">{MODEL_CATALOG.filter(id => category === 'All models' || modelCategory(id) === category).map(id => { const group = modelCategory(id), Icon = group === 'Aircraft' ? Plane : group === 'Structures' ? Building2 : group === 'Personnel' ? Users : Truck; return <button key={id} data-model={id} className="model-list-item" aria-pressed={model === id} onClick={() => setModel(id)}><Icon size={20} /><span><strong>{MODEL_NAMES[id]}</strong><small>{group} · {id.replaceAll('_', ' ')}</small></span></button> })}</div><div className="model-library-footer"><Box size={16} />{MODEL_CATALOG.length} production models</div>
      </aside>
      <div className="model-stage"><div className="model-stage-heading"><div><span className="eyebrow">{modelCategory(model)}</span><h2>{MODEL_NAMES[model]}</h2></div><label className="flex items-center gap-2 text-sm">Livery<select aria-label="Model livery" className="settings-select" value={side} onChange={e => setSide(e.target.value as Side)}><option value="BLU">BLU</option><option value="RED">RED</option></select></label></div>
        <ModelViewport model={model} side={side} active={active} animate={animate} rotate={rotate} action={action} stance={stance} condition={condition} reset={reset} />
        <div className="model-controls"><label><input type="checkbox" checked={animate} onChange={e => setAnimate(e.target.checked)} />Animate parts</label><label><input type="checkbox" checked={rotate} onChange={e => setRotate(e.target.checked)} />Auto-rotate</label><button className="map-control" onClick={() => setReset(n => n + 1)}><RotateCcw size={16} />Reset view</button><span>Drag to orbit · scroll / pinch to zoom</span></div>
        {vehicleRole&&<div className="model-controls"><button className="map-control" aria-pressed={soundPlaying} onClick={async()=>{if(soundPlaying){engine.stopVehiclePreview();setSoundPlaying(false);return}try{await engine.startVehiclePreview(vehicleRole,soundSpeed,soundDistance,soundAngle);setSoundPlaying(true)}catch{setSoundPlaying(false)}}}>{soundPlaying?<VolumeX size={16}/>:<Volume2 size={16}/>} {soundPlaying?'Stop sound':'Play sound'}</button><label>Speed<input aria-label="Preview vehicle speed" type="range" min="0" max="1" step="0.01" value={soundSpeed} onChange={e=>setSoundSpeed(Number(e.target.value))}/><span className="font-mono">{Math.round(soundSpeed*100)}%</span></label><label>Distance<input aria-label="Preview listener distance" type="range" min="0" max="300" step="5" value={soundDistance} onChange={e=>setSoundDistance(Number(e.target.value))}/><span className="font-mono">{soundDistance} m</span></label><label>Angle<input aria-label="Preview relative angle" type="range" min="-180" max="180" step="5" value={soundAngle} onChange={e=>setSoundAngle(Number(e.target.value))}/><span className="font-mono">{soundAngle}°</span></label></div>}
        {personnel && <div className="model-controls">{[{ label: 'Animation', value: action, change: (v: string) => setAction(v as SoldierAction), options: ['idle', 'walk', 'fire', 'cover', 'peek', 'throw', 'drag'] }, { label: 'Stance', value: stance, change: (v: string) => setStance(v as Stance), options: ['stand', 'crouch', 'prone'] }, { label: 'Condition', value: condition, change: (v: string) => setCondition(v as Soldier['status']), options: ['active', 'downed', 'dead'] }].map(c => <label key={c.label}>{c.label}<select className="settings-select" value={c.value} onChange={e => c.change(e.target.value)}>{c.options.map(o => <option key={o}>{o}</option>)}</select></label>)}</div>}
        <div className="model-description"><p>{MODEL_NOTES[model] || (personnel ? 'Articulated production personnel with role-specific equipment. Inspect movement, aiming, stance and casualty animations.' : 'Production armored vehicle with independently aimed turret, tracked chassis and team markings.')}</p>{info && <span className="font-mono">{info.members} {personnel ? 'personnel / team' : 'crew'} · {info.range} m effective range</span>}</div>
      </div>
    </div>
  </section>
}
