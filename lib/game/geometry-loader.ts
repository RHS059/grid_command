import maplibregl from 'maplibre-gl'
import { tacticalStyle } from './map-style'
import { lngLat, local, BASES, AIRBASES, type BattleState, type GeometryFeature, type GeometryPacket } from './types'
import { MOB_YARD } from './mob'
import { CITY_OBJECTIVES, CORRIDOR, sectorKey, sectorOrigin, SECTOR_SIZE } from './theater'

export function loadBattleGeometry(done:(packet:GeometryPacket)=>void,status:(text:string)=>void,getState?:()=>BattleState){
  const host=document.createElement('div');Object.assign(host.style,{position:'fixed',left:'-2000px',top:'0',width:'1024px',height:'1024px',pointerEvents:'none',opacity:'0'});host.setAttribute('aria-hidden','true');document.body.append(host)
  const style=tacticalStyle();style.layers=style.layers.filter(l=>['background','building-footprints','water'].includes(l.id))
  const map=new maplibregl.Map({container:host,style,center:lngLat(BASES.BLU),zoom:14.8,pitch:0,interactive:false,attributionControl:false,pixelRatio:.5,fadeDuration:0})
  const cache=new Map<string,GeometryPacket>(),failed=new Map<string,number>();let disposed=false,loading='',version=0,started=0,loaded=false
  // Keep the strategic spine resident. Evicting an objective or corridor sector while
  // it was still desired caused an endless load/evict loop during long accelerated runs.
  const anchors=[...Object.values(BASES),...Object.values(AIRBASES),...CITY_OBJECTIVES,...CORRIDOR]
  const desired=()=>{const units=getState?.().units.filter(u=>u.hp>0&&!u.carrier)||[];const points=units.flatMap(u=>{const targets=[...u.path,u.transport?.destination].filter((p):p is {x:number;y:number}=>!!p),points:{x:number;y:number}[]=[u];for(const target of targets){const d=Math.hypot(target.x-u.x,target.y-u.y);for(let s=400;s<=Math.min(d,2600);s+=400)points.push({x:u.x+(target.x-u.x)*s/d,y:u.y+(target.y-u.y)*s/d});points.push(target)}return points});return [...new Set([...anchors,...points].map(sectorKey))]}
  const pump=()=>{if(disposed||!loaded)return;if(loading){if(Date.now()-started<20000)return;failed.set(loading,Date.now());status('Sector unavailable · affected ground units hold and retry');loading=''}
    const keys=desired(),key=keys.find(k=>!cache.has(k)&&Date.now()-(failed.get(k)||0)>30000);if(!key)return;loading=key;started=Date.now();const p=sectorOrigin(key)
    map.fitBounds([lngLat({x:p.x-80,y:p.y-80}),lngLat({x:p.x+SECTOR_SIZE+80,y:p.y+SECTOR_SIZE+80})],{padding:16,duration:0})
  }
  map.on('load',()=>{loaded=true;map.setTerrain({source:'elevation',exaggeration:1});pump()})
  map.on('idle',()=>{
    if(disposed||!loading||!map.getTerrain()||!map.isSourceLoaded('openmaptiles')||!map.isSourceLoaded('elevation'))return
    const key=loading,p=sectorOrigin(key),features:GeometryFeature[]=[],seen=new Set<string>()
    for(const layer of ['building','water'])for(const f of map.querySourceFeatures('openmaptiles',{sourceLayer:layer})){const g=f.geometry,polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];polys.forEach((rings,i)=>{const id=`${layer}-${f.id}-${JSON.stringify(rings[0]?.[0])}-${i}`;if(seen.has(id))return;seen.add(id);const r=rings[0]?.map(local);if(!r?.length||Math.min(...r.map(q=>q.x))>p.x+SECTOR_SIZE||Math.max(...r.map(q=>q.x))<p.x||Math.min(...r.map(q=>q.y))>p.y+SECTOR_SIZE||Math.max(...r.map(q=>q.y))<p.y)return
      const facilities=[...Object.values(BASES).map(b=>({...b,y:b.y+(MOB_YARD.maxY+MOB_YARD.minY)/2,w:MOB_YARD.halfWidth+4,h:(MOB_YARD.maxY-MOB_YARD.minY)/2+4})),...Object.values(AIRBASES).map(b=>({...b,w:88,h:610}))]
      if(layer==='building'&&facilities.some(b=>Math.max(...r.map(q=>q.x))>=b.x-b.w&&Math.min(...r.map(q=>q.x))<=b.x+b.w&&Math.max(...r.map(q=>q.y))>=b.y-b.h&&Math.min(...r.map(q=>q.y))<=b.y+b.h))return
      features.push({key:id,water:layer==='water',rings,base:Number(f.properties?.render_min_height)||0,roof:Number(f.properties?.render_height)||6,elevation:map.queryTerrainElevation(lngLat(r[0]))??0})})}
    const terrain={...p,step:50,width:41,height:41,values:[] as number[]};let missing=false
    for(let y=0;y<41;y++)for(let x=0;x<41;x++){const z=map.queryTerrainElevation(lngLat({x:p.x+x*50,y:p.y+y*50}));if(z===null||!Number.isFinite(z))missing=true;terrain.values.push(z??0)}if(missing)return
    const wanted=new Set(desired()),evict=cache.size>=96?[...cache.keys()].find(k=>!wanted.has(k)):undefined;if(cache.size>=96&&!evict){loading='';status('Terrain cache occupied · holding additional sector requests');return}if(evict)cache.delete(evict)
    const packet={features,terrain,version:++version,complete:true,sector:key,evict};cache.set(key,packet);loading='';done(packet);status(`${cache.size} terrain sectors ready · city-wide streaming`);setTimeout(pump,0)
  })
  const interval=setInterval(pump,1000)
  return()=>{disposed=true;clearInterval(interval);map.remove();host.remove()}
}

