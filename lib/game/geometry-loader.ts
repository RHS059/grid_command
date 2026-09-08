import maplibregl from 'maplibre-gl'
import { tacticalStyle } from './map-style'
import { lngLat, local, BASES, AIRBASES, type BattleState, type GeometryFeature, type GeometryPacket } from './types'
import { MOB_YARD } from './mob'
import { BUILDING_RENDER_CENTER, BUILDING_RENDER_RADIUS, sectorOrigin, SECTOR_SIZE } from './theater'
import { consolidateBuildingFeatures, type BuildingAssessmentProgress } from './building-consolidation'
import { assetPath } from '../asset-path'
import type { PlacedBuilding } from './building-system'

export function loadBattleGeometry(done:(packet:GeometryPacket)=>void,status:(text:string)=>void,_getState?:()=>BattleState,progress?:(value:BuildingAssessmentProgress)=>void,buildingsReady?:(features:GeometryFeature[])=>void,catalogReady?:(records:PlacedBuilding[])=>void){
  const host=document.createElement('div');Object.assign(host.style,{position:'fixed',left:'-2000px',top:'0',width:'1024px',height:'1024px',pointerEvents:'none',opacity:'0'});host.setAttribute('aria-hidden','true');document.body.append(host)
  const style=tacticalStyle();style.layers=style.layers.filter(l=>['background','building-footprints','water'].includes(l.id))
  const map=new maplibregl.Map({container:host,style,center:lngLat(BASES.BLU),zoom:14.8,pitch:0,interactive:false,attributionControl:false,pixelRatio:.5,fadeDuration:0})
  const cache=new Map<string,GeometryPacket>(),failed=new Map<string,number>();let disposed=false,loading='',version=0,started=0,loaded=false,finalizing=false
  fetch(assetPath('/san-diego-buildings.json')).then(response=>{if(!response.ok)throw new Error('catalog unavailable');return response.json()}).then(value=>{const records=Array.isArray(value?.records)?value.records:[];if(value?.schema!==1||value?.region!=='san-diego-theater'||value?.complete!==true||!records.length||records.some((record:PlacedBuilding)=>typeof record?.key!=='string'||!Number.isFinite(record?.x)||!Number.isFinite(record?.y)||record?.preset?.seed?.length!==16))throw new Error('catalog invalid');if(disposed)return;progress?.({done:records.length,total:records.length,phase:'ready'});catalogReady?.(records);status(`${records.length.toLocaleString()} cached buildings ready`)}).catch(()=>status('Building catalog unavailable · rebuilding from map data'))
  const minX=Math.floor((BUILDING_RENDER_CENTER.x-BUILDING_RENDER_RADIUS)/SECTOR_SIZE),maxX=Math.floor((BUILDING_RENDER_CENTER.x+BUILDING_RENDER_RADIUS)/SECTOR_SIZE),minY=Math.floor((BUILDING_RENDER_CENTER.y-BUILDING_RENDER_RADIUS)/SECTOR_SIZE),maxY=Math.floor((BUILDING_RENDER_CENTER.y+BUILDING_RENDER_RADIUS)/SECTOR_SIZE)
  const keys:string[]=[]
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){const nearestX=Math.max(x*SECTOR_SIZE,Math.min(BUILDING_RENDER_CENTER.x,(x+1)*SECTOR_SIZE)),nearestY=Math.max(y*SECTOR_SIZE,Math.min(BUILDING_RENDER_CENTER.y,(y+1)*SECTOR_SIZE));if(Math.hypot(nearestX-BUILDING_RENDER_CENTER.x,nearestY-BUILDING_RENDER_CENTER.y)<=BUILDING_RENDER_RADIUS)keys.push(`${x},${y}`)}
  const finish=async()=>{if(finalizing||disposed||cache.size<keys.length)return;finalizing=true;const features=[...cache.values()].flatMap(packet=>packet.features).filter(feature=>!feature.water);status(`Assessing ${features.length.toLocaleString()} building footprints`);const consolidated=await consolidateBuildingFeatures(features,progress);if(disposed)return;buildingsReady?.(consolidated);status(`${consolidated.length.toLocaleString()} consolidated buildings ready`)}
  const pump=()=>{if(disposed||!loaded||finalizing)return;if(loading){if(Date.now()-started<20000)return;failed.set(loading,Date.now());status('Sector unavailable · retrying San Diego coverage');loading=''}
    const key=keys.find(k=>!cache.has(k)&&Date.now()-(failed.get(k)||0)>30000);if(!key){void finish();return}loading=key;started=Date.now();const p=sectorOrigin(key)
    progress?.({done:cache.size,total:keys.length,phase:'discovering'})
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
    const packet={features,terrain,version:++version,complete:true,sector:key};cache.set(key,packet);loading='';done(packet);status(`${cache.size} / ${keys.length} San Diego sectors scanned`);setTimeout(pump,0)
  })
  const interval=setInterval(pump,1000)
  return()=>{disposed=true;clearInterval(interval);map.remove();host.remove()}
}

