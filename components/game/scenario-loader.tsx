'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { buildScenario, type ScenarioConfig } from '@/lib/game/ai/scenario'

export function ScenarioLoader({ onLoad }: { onLoad: (scenario: ScenarioConfig) => void }) {
  const [scenario,setScenario]=useState<ScenarioConfig|null>(null),[error,setError]=useState('')
  return <div className="rounded-md border border-border p-4 text-sm">
    <label htmlFor="scenario-file" className="font-medium">Load an authored operation</label>
    <p className="py-2 text-muted-foreground">Choose a scenario file to review its force and objectives before replacing the current operation.</p>
    <input id="scenario-file" type="file" accept=".json,application/json" onChange={async event=>{
      setScenario(null);setError('');const file=event.target.files?.[0];if(!file)return
      try {if(file.size>2_000_000)throw Error('Choose a scenario smaller than 2 MB.');const value=JSON.parse(await file.text()) as ScenarioConfig;buildScenario(value);setScenario(value)}
      catch(cause){setError(cause instanceof Error?cause.message:'Could not read this scenario.')}
    }}/>
    {error&&<p role="alert" className="pt-2 text-destructive">{error}</p>}
    {scenario&&<div className="pt-3"><p>{scenario.name} · {scenario.units.length} units · {scenario.objectives?.length??10} objectives</p><Button className="mt-3" onClick={()=>onLoad(scenario)}>Start loaded operation</Button></div>}
  </div>
}
