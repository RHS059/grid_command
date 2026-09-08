'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Download, Plus, RotateCcw, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { assetPath } from '@/lib/asset-path'
import { BUILDING_MODULE, BUILDING_TYPES, SEED_FIELDS, normalizeBuildingPreset, normalizeBuildingSeed, parseBuildingPresets, type BuildingPreset, type BuildingType, type FootprintPoint } from '@/lib/game/building-system'
import { BuildingViewport } from './building-viewport'
import styles from './building-editor.module.css'

const randomSeed = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('')
const empty: BuildingPreset = { id: 'custom-building', name: 'Custom building', type: 'residential-house', width: 4, depth: 3, floors: 2, seed: '2417330848621957', roof: 'auto', footprintMode: 'rectangle', slopedWalls: false }
const download = (presets: BuildingPreset[]) => { const url = URL.createObjectURL(new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = '_buildings.json'; link.click(); URL.revokeObjectURL(url) }
const simplify = (points: FootprintPoint[]) => { const result: FootprintPoint[] = []; for (const point of points) { const previous = result[result.length - 1]; if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= .55) result.push(point) } return result.slice(0, 64) }

function FootprintEditor({ value, onChange }: { value: BuildingPreset; onChange: (next: BuildingPreset) => void }) {
  const host = useRef<SVGSVGElement>(null), rectangleStart = useRef<FootprintPoint | null>(null), drawing = useRef<FootprintPoint[]>([])
  const point = (event: PointerEvent<SVGSVGElement>) => { const rect = host.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(16, (event.clientX - rect.left) / rect.width * 16)), y: Math.max(0, Math.min(16, 16 - (event.clientY - rect.top) / rect.height * 16)) } }
  const commitShape = (points: FootprintPoint[]) => { const next = simplify(points); if (next.length < 3) return; const minX = Math.min(...next.map(p => p.x)), maxX = Math.max(...next.map(p => p.x)), minY = Math.min(...next.map(p => p.y)), maxY = Math.max(...next.map(p => p.y)); onChange({ ...value, footprint: next, width: Math.max(1, Math.ceil(maxX - minX)), depth: Math.max(1, Math.ceil(maxY - minY)) }) }
  const move = (event: PointerEvent<SVGSVGElement>) => { const current = point(event); if (value.footprintMode === 'shape') { if (!drawing.current.length) return; drawing.current.push(current); commitShape(drawing.current) } else if (rectangleStart.current) { const start = rectangleStart.current; onChange({ ...value, width: Math.max(1, Math.ceil(Math.abs(current.x - start.x))), depth: Math.max(1, Math.ceil(Math.abs(current.y - start.y))), footprint: undefined }) } }
  const shown = value.footprintMode === 'shape' ? value.footprint || [] : [{ x: 1, y: 1 }, { x: 1 + value.width, y: 1 }, { x: 1 + value.width, y: 1 + value.depth }, { x: 1, y: 1 + value.depth }]
  const points = shown.map(p => `${p.x * 20},${(16 - p.y) * 20}`).join(' ')
  return <svg ref={host} viewBox="0 0 320 320" className="aspect-square w-full touch-none rounded-md border border-border bg-[#101c2a]" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); const start = point(event); if (value.footprintMode === 'shape') { drawing.current = [start]; onChange({ ...value, footprint: [start] }) } else rectangleStart.current = start }} onPointerMove={move} onPointerUp={event => { move(event); rectangleStart.current = null; if (drawing.current.length) commitShape(drawing.current); drawing.current = [] }} aria-label={value.footprintMode === 'shape' ? 'Draw a freeform building outline' : 'Drag to set a rectangular building footprint'}>
    <defs><pattern id="building-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#32465a" strokeWidth="1" /></pattern></defs><rect width="320" height="320" fill="url(#building-grid)" />
    {points && <polygon points={points} fill="#54b7ff22" stroke="#54b7ff" strokeWidth="2" strokeLinejoin="round" />}
    <text x="10" y="310" fill="#91a6b8" fontSize="12">{value.width * BUILDING_MODULE} × {value.depth * BUILDING_MODULE} m · {value.footprintMode === 'shape' ? 'freeform outline' : 'rectangle'}</text>
  </svg>
}

function SeedEditor({ value, onChange }: { value: string; onChange: (seed: string) => void }) {
  const seed = normalizeBuildingSeed(value), update = (index: number, pair: string) => { const digits = pair.replace(/\D/g, '').slice(0, 2).padStart(2, '0'); onChange(`${seed.slice(0, index * 2)}${digits}${seed.slice(index * 2 + 2)}`) }
  return <div className={styles.seedEditor}><div className={styles.seedHeader}><span>Structured seed</span><span>{seed.match(/.{2}/g)?.join(' ')}</span></div><div className={styles.seedGrid}>{SEED_FIELDS.map((label, index) => <label key={label}>{label}<input inputMode="numeric" value={seed.slice(index * 2, index * 2 + 2)} onChange={event => update(index, event.target.value)} /></label>)}</div></div>
}

export function BuildingEditor() {
  const [draft, setDraft] = useState<BuildingPreset>(empty), [presets, setPresets] = useState<BuildingPreset[]>([]), [error, setError] = useState('')
  useEffect(() => { let saved: BuildingPreset[] = []; const stored = localStorage.getItem('grid-command-buildings'); if (stored) try { saved = parseBuildingPresets(JSON.parse(stored)) } catch {} fetch(assetPath('/_buildings.json')).then(r => r.json()).then(value => { const defaults = parseBuildingPresets(value), savedIds = new Set(saved.map(item => item.id)), next = [...defaults.filter(item => !savedIds.has(item.id)), ...saved]; setPresets(next); if (next[0]) setDraft(next[0]) }).catch(() => { setPresets(saved); if (saved[0]) setDraft(saved[0]) }) }, [])
  const save = (next: BuildingPreset[]) => { setPresets(next); localStorage.setItem('grid-command-buildings', JSON.stringify(next)) }, select = (preset: BuildingPreset) => { setDraft({ ...preset }); setError('') }, exists = presets.some(p => p.id === draft.id)
  const persist = () => { const preset = normalizeBuildingPreset({ ...draft, id: exists ? draft.id : `${draft.type}-${Date.now()}`, name: draft.name || `${draft.type} building` }); save(exists ? presets.map(item => item.id === preset.id ? preset : item) : [...presets, preset]); select(preset) }
  const typeLabel = BUILDING_TYPES.find(type => type.value === draft.type)?.label || draft.type
  const importPresets = async (file?: File) => { if (!file) return; try { const next = parseBuildingPresets(JSON.parse(await file.text())); save(next); select(next[0] || empty); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invalid building preset file.') } }
  const remove = () => { const next = presets.filter(preset => preset.id !== draft.id); save(next); select(next[0] || empty) }
  return <div className={styles.workspace}>
    <main className={styles.viewport}><BuildingViewport preset={draft} /></main>

    <aside className={`${styles.panel} ${styles.catalog}`} aria-label="Building presets">
      <div className={styles.panelHeader}>
        <span className={styles.eyebrow}>PRESETS</span>
        <div className={styles.headerActions}>
          <label className={styles.smallButton}><Upload size={12} />Import<input className="sr-only" type="file" accept="application/json,.json" onChange={async event => { await importPresets(event.target.files?.[0]); event.target.value = '' }} /></label>
          <button className={styles.smallButton} onClick={() => download(presets)}><Download size={12} />Export</button>
          <button className={styles.iconButton} aria-label="New preset" onClick={() => setDraft({ ...empty, id: `draft-${Date.now()}`, seed: randomSeed() })}><Plus size={14} /></button>
        </div>
      </div>
      <div className={styles.presetList}>{presets.map(preset => <button key={preset.id} onClick={() => select(preset)} className={`${styles.preset} ${preset.id === draft.id ? styles.selectedPreset : ''}`}>
        <span>{preset.name}</span><small>{BUILDING_TYPES.find(type => type.value === preset.type)?.label} · {preset.width}×{preset.depth} · {preset.floors}F</small>
      </button>)}</div>
    </aside>

    <aside className={`${styles.panel} ${styles.inspector}`} aria-label="Building editor">
      <div className={styles.inspectorHeading}>
        <span className={styles.eyebrow}>{typeLabel} · {draft.width}×{draft.depth} · {draft.floors}F</span>
        <input aria-label="Building name" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
      </div>
      <div className={styles.inspectorScroll}>
        <label className={styles.field}>Building type<select value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as BuildingType })}>{BUILDING_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <section className={styles.controlSection}>
          <div className={styles.sectionLine}><span>Footprint</span><div className={styles.segmented}><button className={draft.footprintMode !== 'shape' ? styles.active : ''} onClick={() => setDraft({ ...draft, footprintMode: 'rectangle', footprint: undefined })}>Rectangle</button><button className={draft.footprintMode === 'shape' ? styles.active : ''} onClick={() => setDraft({ ...draft, footprintMode: 'shape', footprint: undefined })}>Shape</button></div></div>
          <div className={styles.footprintWrap}><FootprintEditor value={draft} onChange={setDraft} /></div>
          <label className={styles.checkLine}><span>Sloped walls<small>Follow diagonal lines in a drawn shape</small></span><input type="checkbox" checked={!!draft.slopedWalls} onChange={event => setDraft({ ...draft, slopedWalls: event.target.checked })} /></label>
        </section>
        <label className={styles.rangeField}><span>Floors</span><strong>{draft.floors}</strong><input type="range" min="1" max="40" value={draft.floors} onChange={event => setDraft({ ...draft, floors: Number(event.target.value) })} /></label>
        <section className={styles.controlSection}><div className={styles.sectionLine}><span>Roof</span></div><div className={styles.roofChoices}>{(['auto', 'flat', 'gable'] as const).map(roof => <button key={roof} className={draft.roof === roof ? styles.active : ''} onClick={() => setDraft({ ...draft, roof })}>{roof === 'auto' ? 'Auto' : roof === 'gable' ? 'Gable' : 'Flat'}</button>)}</div></section>
        <div className={styles.rerollLine}><span>Variation seed</span><button onClick={() => setDraft({ ...draft, seed: randomSeed() })}><RotateCcw size={13} />Reroll</button></div>
        <SeedEditor value={draft.seed} onChange={seed => setDraft({ ...draft, seed })} />
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <div className={styles.inspectorFooter}>
        <Button className={styles.saveButton} onClick={persist}>{exists ? 'Save preset' : 'Add preset'}</Button>
        {exists && <Button className={styles.deleteButton} variant="destructive" size="icon" aria-label="Delete preset" onClick={remove}><Trash2 size={15} /></Button>}
      </div>
    </aside>
  </div>
}

