import supplied from '../../public/grid-command_sfx.json'
export interface OscillatorPreset { enabled:boolean;wave:OscillatorType;freq:number;ratio:number;gain:number;detune:number;endRatio:number }
export interface SoundPreset {name:string;loop:boolean;vehicle:boolean;duration:number;attack:number;decay:number;sustain:number;release:number;filterType:BiquadFilterType;filterFreq:number;filterQ:number;noiseGain:number;noiseFreq:number;distortion:number;output:number;speedPitchMax:number;speedFilterMax:number;repeatHz:number;repeatSpeedMax:number;repeatDepth:number;oscillators:OscillatorPreset[]}
export type SoundBank=Record<string,SoundPreset>
export const DEFAULT_BANK=supplied as SoundBank
export const MAX_BANK_BYTES=256*1024
const ranges:Record<string,[number,number]>={duration:[.01,30],attack:[0,10],decay:[0,10],sustain:[0,1],release:[0,10],filterFreq:[10,24000],filterQ:[0,40],noiseGain:[0,4],noiseFreq:[10,24000],distortion:[0,100],output:[0,4],speedPitchMax:[.05,8],speedFilterMax:[.05,8],repeatHz:[0,100],repeatSpeedMax:[.05,8],repeatDepth:[0,1]}
function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)}
function number(v:unknown,min:number,max:number,label:string){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`${label} must be between ${min} and ${max}.`)}
export function parseSoundBank(text:string,base:SoundBank=DEFAULT_BANK){if(new TextEncoder().encode(text).length>MAX_BANK_BYTES)throw new Error('Sound bank exceeds 256 KB.');let data:unknown;try{data=JSON.parse(text)}catch{throw new Error('Invalid JSON. The active sound bank was not changed.')}if(!object(data)||!Object.keys(data).length)throw new Error('Expected a non-empty sound preset object.')
  for(const [key,p]of Object.entries(data)){if(!Object.hasOwn(DEFAULT_BANK,key))throw new Error(`Unknown sound preset: ${key}`);if(!object(p))throw new Error(`${key} is not a preset object.`);if(Object.keys(p).some(k=>!Object.hasOwn(DEFAULT_BANK[key],k)))throw new Error(`Unknown field in ${key}.`)
    if(typeof p.name!=='string'||p.name.length>100||typeof p.loop!=='boolean'||typeof p.vehicle!=='boolean')throw new Error(`Invalid name or flags in ${key}.`)
    if(!['lowpass','highpass','bandpass','notch','allpass','peaking','lowshelf','highshelf'].includes(String(p.filterType)))throw new Error(`Invalid filter in ${key}.`)
    for(const [field,[min,max]]of Object.entries(ranges))number(p[field],min,max,`${key}.${field}`)
    if(!Array.isArray(p.oscillators)||p.oscillators.length>8)throw new Error(`${key} must contain at most 8 oscillators.`)
    for(const o of p.oscillators){if(!object(o)||typeof o.enabled!=='boolean'||!['sine','square','triangle','sawtooth'].includes(String(o.wave))||Object.keys(o).some(k=>!['enabled','wave','freq','ratio','gain','detune','endRatio'].includes(k)))throw new Error(`Invalid oscillator in ${key}.`);for(const [f,min,max]of [['freq',1,24000],['ratio',.01,20],['gain',0,4],['detune',-4800,4800],['endRatio',.01,20]] as const)number(o[f],min,max,`${key}.${f}`)}
  }
  const replaced=Object.keys(data).length;return {bank:{...base,...data} as SoundBank,replaced,retained:Object.keys(base).length-replaced}
}
