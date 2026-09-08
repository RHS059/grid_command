'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { vehicleClips } from '@/lib/game/vehicle-animation'
import { ModelViewport } from './model-viewport'
import { MODEL_CATALOG, MODEL_NAMES, MODEL_NOTES, modelCategory, type ModelId } from '@/lib/game/model-catalog'
import { CATALOG, isVehicle, type Role, type Side, type SoldierAction, type Stance, type Soldier } from '@/lib/game/types'
import { BattlefieldAudio } from '@/lib/game/audio'
import styles from './unit-lab.module.css'

const CATEGORIES = ['All', 'Personnel', 'Vehicles', 'Aircraft', 'Structures'] as const

export function UnitLab({ embedded = false, active = true, soundEngine }: { embedded?: boolean; active?: boolean; simulationPaused?: boolean; soundEngine?: BattlefieldAudio }) {
  const [localSoundEngine] = useState(() => new BattlefieldAudio())
  const engine = soundEngine || localSoundEngine
  const [model, setModel] = useState<ModelId>('ATTACK_HELI')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All')
  const [side, setSide] = useState<Side>('BLU')
  const [action, setAction] = useState<SoldierAction>('idle')
  const [stance, setStance] = useState<Stance>('stand')
  const [condition, setCondition] = useState<Soldier['status']>('active')
  const [animate, setAnimate] = useState(true)
  const [clipId,setClipId]=useState('idle'), [clipLoop,setClipLoop]=useState(true), [clipTime,setClipTime]=useState(0), [seek,setSeek]=useState({serial:0,time:0})
  const clips=vehicleClips(model), clip=clips.find(c=>c.id===clipId)||clips[0]
  const scrub=(time:number)=>{setClipTime(time);setSeek(s=>({serial:s.serial+1,time}))}
  const [rotate, setRotate] = useState(false)
  const [reset, setReset] = useState(0)
  const [soundPlaying, setSoundPlaying] = useState(false)
  const [soundSpeed, setSoundSpeed] = useState(.35)
  const [soundDistance, setSoundDistance] = useState(30)
  const [soundAngle, setSoundAngle] = useState(0)
  const role: Role | undefined = model === 'MOB' || model === 'AIRFIELD' ? undefined : model
  const vehicleRole = role && isVehicle(role) ? role : undefined
  const personnel = modelCategory(model) === 'Personnel'
  const info = role ? CATALOG[role] : null
  const visibleModels = useMemo(() => MODEL_CATALOG.filter(id => category === 'All' || modelCategory(id) === category), [category])

  useEffect(() => { if (!soundEngine) localSoundEngine.restore(); return () => { if (!soundEngine) localSoundEngine.dispose() } }, [localSoundEngine, soundEngine])
  useEffect(() => { if (!active || !vehicleRole) { engine.stopVehiclePreview(); setSoundPlaying(false) }; return () => engine.stopVehiclePreview() }, [active, engine, vehicleRole])
  useEffect(() => { if (soundPlaying) engine.updateVehiclePreview(soundSpeed, soundDistance, soundAngle) }, [engine, soundAngle, soundDistance, soundPlaying, soundSpeed])

  const toggleSound = async () => {
    if (!vehicleRole) return
    if (soundPlaying) { engine.stopVehiclePreview(); setSoundPlaying(false); return }
    try { await engine.startVehiclePreview(vehicleRole, soundSpeed, soundDistance, soundAngle); setSoundPlaying(true) } catch { setSoundPlaying(false) }
  }

  return <section className={`${styles.root}${embedded ? '' : ` ${styles.standalone}`}`} aria-label="Model Preview" hidden={!active}>
    {!embedded && <Link href="/" className={styles.returnLink}>GRID COMMAND <span>Return to battlefield</span></Link>}
    <div className={styles.viewport}><ModelViewport model={model} side={side} active={active} animate={animate} rotate={rotate} action={action} stance={stance} condition={condition} reset={reset} clip={clip?.id} loop={clipLoop} seek={seek} onTime={setClipTime} /></div>

    <aside className={`${styles.card} ${styles.catalog}`} aria-label="Model catalog">
      <div className={styles.catalogHeader}><span>CATALOG</span><span>{MODEL_CATALOG.length} MODELS</span></div>
      <div className={styles.pills} role="group" aria-label="Model category">{CATEGORIES.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className={styles.modelList}>{visibleModels.map(id => <button key={id} type="button" data-model={id} className={styles.modelRow} aria-pressed={model === id} onClick={() => {setModel(id);setClipId('idle');setClipLoop(true);scrub(0)}}><strong>{MODEL_NAMES[id]}</strong><small>{modelCategory(id).toUpperCase()} · {id.replaceAll('_', ' ')}</small></button>)}</div>
    </aside>

    <aside className={`${styles.card} ${styles.information}`} aria-label="Selected model information">
      <header><span>{modelCategory(model).toUpperCase()} · {model.replaceAll('_', ' ')}</span><h2>{MODEL_NAMES[model]}</h2></header>
      <div className={styles.infoBody}>
        <div className={styles.livery}><span>Livery</span><div role="group" aria-label="Model livery"><button type="button" aria-pressed={side === 'BLU'} onClick={() => setSide('BLU')}>BLU</button><button type="button" aria-pressed={side === 'RED'} onClick={() => setSide('RED')}>RED</button></div></div>
        {info && <div className={styles.metrics}><div><strong>{info.members}</strong><span>{personnel ? 'Personnel' : 'Crew'}</span></div><div><strong>{info.range.toLocaleString()} m</strong><span>Effective range</span></div></div>}
        <p>{MODEL_NOTES[model] || (personnel ? 'Articulated production personnel with role-specific equipment.' : 'Production vehicle with team markings and animated components.')}</p>
      </div>
    </aside>

    <aside className={`${styles.card} ${styles.controls}`} aria-label="Model preview controls">
      <div className={styles.controlButtons}>
        <label className={styles.toggle}><input type="checkbox" checked={animate} onChange={event => setAnimate(event.target.checked)} /><span>Animate parts</span></label>
        <label className={styles.toggle}><input type="checkbox" checked={rotate} onChange={event => setRotate(event.target.checked)} /><span>Auto-rotate</span></label>
        <button type="button" onClick={() => setReset(value => value + 1)}><RotateCcw size={13} /> Reset view</button>
      </div>
      {clip && <div className={styles.controlGroup} aria-label="Vehicle animations">
        <label className={styles.select}><span>Animation</span><select aria-label="Vehicle animation" value={clip.id} onChange={e=>{const selected=clips.find(c=>c.id===e.target.value)!;setClipId(selected.id);setClipLoop(selected.loop);scrub(0)}}>{clips.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <button type="button" onClick={()=>setAnimate(v=>!v)}>{animate?'Pause':'Play'}</button>
        <button type="button" onClick={()=>scrub(0)}>Restart animation</button>
        <label className={styles.toggle}><input type="checkbox" checked={clipLoop} onChange={e=>setClipLoop(e.target.checked)} />Loop</label>
        <RangeControl label="Animation progress" value={`${clipTime.toFixed(2)} / ${clip.duration.toFixed(2)} s`} min={0} max={clip.duration} step={.01} current={Math.min(clipTime,clip.duration)} onChange={v=>{setAnimate(false);scrub(v)}} />
      </div>}
      {vehicleRole && <div className={styles.controlGroup}>
        <button type="button" className={styles.soundButton} aria-pressed={soundPlaying} onClick={toggleSound}>{soundPlaying ? <VolumeX size={14} /> : <Volume2 size={14} />}{soundPlaying ? 'Stop sound' : 'Play engine'}</button>
        <RangeControl label="Vehicle speed" value={`${Math.round(soundSpeed * 100)}%`} min={0} max={1} step={.01} current={soundSpeed} onChange={setSoundSpeed} />
        <RangeControl label="Listener distance" value={`${soundDistance} m`} min={0} max={300} step={5} current={soundDistance} onChange={setSoundDistance} />
        <RangeControl label="Relative angle" value={`${soundAngle}°`} min={-180} max={180} step={5} current={soundAngle} onChange={setSoundAngle} />
      </div>}
      {personnel && <div className={styles.personnelControls}>
        <SelectControl label="Animation" value={action} options={['idle', 'walk', 'fire', 'cover', 'peek', 'throw', 'drag']} onChange={value => setAction(value as SoldierAction)} />
        <SelectControl label="Stance" value={stance} options={['stand', 'crouch', 'prone']} onChange={value => setStance(value as Stance)} />
        <SelectControl label="Condition" value={condition} options={['active', 'downed', 'dead']} onChange={value => setCondition(value as Soldier['status'])} />
      </div>}
    </aside>
  </section>
}

function RangeControl({ label, value, current, min, max, step, onChange }: { label: string; value: string; current: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className={styles.range}><span>{label}<b>{value}</b></span><input aria-label={label} type="range" min={min} max={max} step={step} value={current} onChange={event => onChange(Number(event.target.value))} /></label>
}

function SelectControl({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className={styles.select}><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>
}
