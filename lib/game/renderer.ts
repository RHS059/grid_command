import { animateMob } from './mob-models'
import { mobHelipadRise, mobTier, MOB_YARD, onMobHelipad } from './mob'
import * as T from './scene-data'
import type { GeoMap as GeographicMap } from './geo-map'
import { BASES, AIRBASES, CENTER, CATALOG, SIDE_COLOR, isNaval, isAir, isVehicle, lngLat, local, type BattleState, type Graphics, type Perspective, type Role, type Side } from './types'
import { addCarrierOccupants, updateCarrierOccupants } from './carrier-occupants'
import { carrierActorIds } from './carrier-transitions'
import { SoldierBatch, vehicleGeometry } from './unit-models'
import { createAircraft, animateAircraft, disposeModel } from './aircraft-models'
import { createSupportModel, isSupportModel, animateSupport } from './support-models'
import type { Unit } from './types'
import { airfieldPlatform, baseSurfaceElevation, createBase, conformBase, type BaseElevation } from './base-models'
import { createObjectiveFacilities, objectiveFacilitySignature } from './objective-models'
import { ModularBuildingRenderer } from './modular-building-renderer'
import type { GeometryPacket } from './types'
import { addBattlefieldLighting } from './scene-lighting'

export class BattlefieldRenderer {
  private frustum = new T.Frustum()
  private bounds = new T.Sphere()
  private visibleUnits = new Set<string>()
  private terrainChanged = (event: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (event.sourceId === 'elevation' && event.isSourceLoaded) {
      this.ground.clear()
    }
  }
  shouldAnimate(id: string) { return this.visibleUnits.has(id) }
  private inView(x: number, y: number, z: number, radius: number) {
    this.bounds.center.set(x, y, z)
    this.bounds.radius = radius
    return this.frustum.intersectsSphere(this.bounds)
  }
  corpseBatches: Record<Side,SoldierBatch[]> = {BLU:[],RED:[]};
  aircraft=new Map<string,T.Group>();objectiveFacilities=new Map<string,T.Group>();bases:{model:T.Group;point:{x:number;y:number;id:string};elevation?:BaseElevation}[]=[];buildings:ModularBuildingRenderer
  ready:Promise<void>;scene=new T.Scene();camera=new T.Camera();transform=new T.Matrix4();dummy=new T.Object3D();groups=new Map<string,T.InstancedMesh>();soldiers:Record<Side,SoldierBatch>;effects=new Map<string,T.InstancedMesh>();combatLights:T.PointLight[]=[];disposed=false;previous=0;report=0;frames:number[]=[];ground=new Map<string,{x:number;y:number;z:number;time:number}>();snapshotTime=-1;arrival=0
  constructor(public map:GeographicMap,_canvas:HTMLCanvasElement|null,public getState:()=>BattleState,public getSettings:()=>{graphics:Graphics;perspective:Perspective;selected:string|null;active?:boolean},public onFPS:(n:number)=>void){
    const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:.08,flatShading:false});this.soldiers={BLU:new SoldierBatch(this.scene,'BLU',material),RED:new SoldierBatch(this.scene,'RED',material)}
    addBattlefieldLighting(this.scene,1600)
    this.buildings=new ModularBuildingRenderer(this.scene)
    for(const side of ['BLU','RED'] as Side[])for(const role of Object.keys(CATALOG) as Role[]){if(!isVehicle(role)||isAir(role))continue;const mesh=new T.InstancedMesh(vehicleGeometry(role,side),material,64);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.groups.set(`${side}-${role}`,mesh);this.scene.add(mesh);if(['TANK','APC','IFV','CANNON_APC','ATTACK_HELI'].includes(role)){const turret=new T.InstancedMesh(vehicleGeometry(role,side,true),material,64);turret.count=0;turret.frustumCulled=false;this.groups.set(`${side}-${role}-attachment`,turret);this.scene.add(turret)}}
    for(const side of ['BLU','RED'] as Side[])for(const kind of ['MOB','AIRFIELD'] as const){const model=createBase(kind,side),point={...(kind==='MOB'?BASES[side]:AIRBASES[side]),id:`${side}-${kind}`};model.position.set(point.x,point.y,0);this.scene.add(model);this.bases.push({model,point})}
    for(const side of ['BLU','RED'] as Side[])for(const type of ['core','glow','blast']){const mesh=new T.InstancedMesh(new T.IcosahedronGeometry(1,type==='blast'?1:0),new T.MeshBasicMaterial({color:SIDE_COLOR[side],transparent:type!=='core',opacity:type==='core'?1:type==='blast'?.32:.2,blending:type==='core'?T.NormalBlending:T.AdditiveBlending,depthWrite:type==='core',depthTest:true}),512);mesh.count=0;mesh.frustumCulled=false;this.effects.set(`${side}-${type}`,mesh);this.scene.add(mesh)}
    const tracerCore=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshBasicMaterial({color:'#fff4bf',toneMapped:false}),512);tracerCore.count=0;tracerCore.frustumCulled=false;this.effects.set('tracer-core',tracerCore);this.scene.add(tracerCore)
    const tracerGlow=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshBasicMaterial({color:'#ff7a18',transparent:true,opacity:.38,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}),512);tracerGlow.count=0;tracerGlow.frustumCulled=false;this.effects.set('tracer-glow',tracerGlow);this.scene.add(tracerGlow)
    const muzzle=new T.InstancedMesh(new T.OctahedronGeometry(1,0),new T.MeshBasicMaterial({color:'#ffd26a',transparent:true,opacity:.92,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}),128);muzzle.count=0;muzzle.frustumCulled=false;this.effects.set('muzzle',muzzle);this.scene.add(muzzle)
    const rocketFlameGeometry=new T.ConeGeometry(1,2,6);rocketFlameGeometry.rotateX(Math.PI/2);const rocketFlame=new T.InstancedMesh(rocketFlameGeometry,new T.MeshBasicMaterial({color:'#ff9b28',transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}),64);rocketFlame.count=0;rocketFlame.frustumCulled=false;this.effects.set('rocket-flame',rocketFlame);this.scene.add(rocketFlame)
    const smoke=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({color:'#89959a',transparent:true,opacity:.55,roughness:1,depthWrite:false,flatShading:false}),192);smoke.count=0;smoke.frustumCulled=false;this.effects.set('smoke',smoke);this.scene.add(smoke)
    const rocketSmoke=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({color:'#697278',transparent:true,opacity:.42,roughness:1,depthWrite:false,flatShading:true}),256);rocketSmoke.count=0;rocketSmoke.frustumCulled=false;this.effects.set('rocket-smoke',rocketSmoke);this.scene.add(rocketSmoke)
    const shadow=new T.InstancedMesh(new T.CircleGeometry(1,12),new T.MeshBasicMaterial({color:'#0b1119',transparent:true,opacity:.3,depthWrite:false}),256);shadow.count=0;shadow.frustumCulled=false;this.effects.set('shadow',shadow);this.scene.add(shadow)
    for(let i=0;i<12;i++){const light=new T.PointLight('#ff9a35',0,24,2);light.visible=false;this.combatLights.push(light);this.scene.add(light)}
    this.ready=map.ready;map.attachBattlefield(this.scene,matrix=>this.render(matrix))
    map.on('sourcedata', this.terrainChanged)
    if(process.env.NODE_ENV==='development') (window as unknown as {gridDebug:BattlefieldRenderer}).gridDebug=this
  }
  resize(){this.map.triggerRepaint()}
  importBuildings(packet:GeometryPacket){this.buildings.import(packet);this.map.triggerRepaint()}
  altitude(p:{x:number;y:number;id:string},now:number){const terrain=!!this.map.getTerrain();for(const {model,point,elevation}of this.bases){const x=p.x-point.x,y=p.y-point.y,platform=airfieldPlatform(model.userData.tier),inside=model.name==='MOB'?Math.abs(x)<MOB_YARD.halfWidth&&y>MOB_YARD.minY&&y<MOB_YARD.maxY:Math.abs(x-platform.x)<platform.width/2&&Math.abs(y)<platform.depth/2;if(inside&&(!terrain||elevation)){const datum=terrain?baseSurfaceElevation(model.name as 'MOB'|'AIRFIELD',elevation!):baseSurfaceElevation(model.name as 'MOB'|'AIRFIELD',{high:0,low:0});return datum+.02+(model.name==='MOB'&&onMobHelipad(point.id.startsWith('BLU')?'BLU':'RED',p)?mobHelipadRise(model.userData.tier):0)}}if(!terrain)return 0;const old=this.ground.get(p.id);if(old&&now-old.time<600&&Math.hypot(old.x-p.x,old.y-p.y)<5)return old.z;const sampled=this.map.queryTerrainElevation(lngLat(p)),z=sampled!==null&&Number.isFinite(sampled)?sampled:old?.z??0;this.ground.set(p.id,{x:p.x,y:p.y,z,time:now});return z}
  render(matrix:number[]){if(this.disposed||this.getSettings().active===false){this.previous=0;return;}const now=performance.now(),state=this.getState(),{graphics,perspective,selected}=this.getSettings();if(this.previous)this.frames.push(now-this.previous);this.previous=now;if(now-this.report>1500&&this.frames.length){this.onFPS(Math.round(1000/(this.frames.reduce((a,b)=>a+b,0)/this.frames.length)));this.frames=[];this.report=now}
    if(state.time!==this.snapshotTime){this.snapshotTime=state.time;this.arrival=now}const time=state.time+(state.paused?0:Math.min(.1,(now-this.arrival)/1000)*state.speed)
    // Terrain queries, locked bases, and simulation models all use sea-level
    // absolute elevations. Keep this transform camera-independent.
    this.transform.elements[14]=0
    this.camera.projectionMatrix.fromArray(matrix).multiply(this.transform);this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();const counts=new Map<string,number>(),ec=new Map<string,number>(),center=this.map.getCenter(),zoom=this.map.getZoom();this.soldiers.BLU.begin();this.soldiers.RED.begin()
    const performanceMode = !!graphics.performanceMode
    const viewCenter = local([center.lng, center.lat])
    this.buildings.update(viewCenter,zoom,this.map.getPitch(),graphics,!!this.map.getTerrain())
    const nearby = (x: number, y: number, radius = 0) => Math.hypot(x - viewCenter.x, y - viewCenter.y) <= 1000 + radius
    this.frustum.setFromProjectionMatrix(this.camera.projectionMatrix)
    this.visibleUnits.clear()
    for(const base of this.bases){
      const side = base.point.id.startsWith('BLU') ? 'BLU' : 'RED'
      const kind=base.model.name as 'MOB'|'AIRFIELD',tier=kind==='MOB'?mobTier(state,side):state.airfields[side].tier
      if (base.model.userData.tier !== tier) {
        this.scene.remove(base.model); disposeModel(base.model)
        base.model = createBase(kind, side, tier); base.model.position.set(base.point.x, base.point.y, 0); this.scene.add(base.model)
      }
      const { model, point } = base
      const terrain=!!this.map.getTerrain()
      // Source events and camera target elevation can change repeatedly; accept one complete footprint sample only.
      if(terrain&&!base.elevation&&this.map.isSourceLoaded('elevation')){
        // Lock the complete planned airfield footprint once, so a later tier-three
        // runway expansion inherits the same grade without moving an active base.
        const platform=airfieldPlatform(kind==='AIRFIELD'?3:model.userData.tier),width=kind==='MOB'?MOB_YARD.halfWidth*2:platform.width,depth=kind==='MOB'?MOB_YARD.maxY-MOB_YARD.minY:platform.depth,offsetX=kind==='AIRFIELD'?platform.x:0,offsetY=kind==='MOB'?(MOB_YARD.maxY+MOB_YARD.minY)/2:0
        const range=this.map.queryTerrainRange({minX:point.x+offsetX-width/2,maxX:point.x+offsetX+width/2,minY:point.y+offsetY-depth/2,maxY:point.y+offsetY+depth/2})
        const sampled=range&&conformBase(model,undefined,range)
        if(sampled){base.elevation=sampled;model.userData.elevationMode='locked'}
      }
      if(terrain&&base.elevation&&model.userData.elevationMode!=='locked'){conformBase(model,undefined,base.elevation);model.userData.elevationMode='locked'}
      else if(!terrain&&model.userData.elevationMode!=='flat'){conformBase(model,undefined,{high:0,low:0});model.userData.elevationMode='flat'}
      model.visible=graphics.models&&zoom>12&&(!terrain||!!base.elevation)&&(!performanceMode||nearby(point.x,point.y,model.name==='AIRFIELD'?650:Math.hypot(MOB_YARD.halfWidth,Math.max(Math.abs(MOB_YARD.minY),Math.abs(MOB_YARD.maxY)))))&&Math.hypot((lngLat(point)[0]-center.lng)*93650,(lngLat(point)[1]-center.lat)*111320)<3000;model.position.z=0;if(model.visible&&model.name==='MOB')animateMob(model,state,side,time)}
    const liveFacilities=new Set<string>()
    for(const objective of state.objectives){if(!Object.keys(objective.facilities||{}).length)continue;liveFacilities.add(objective.id);const signature=objectiveFacilitySignature(objective);let model=this.objectiveFacilities.get(objective.id);if(!model||model.userData.signature!==signature){if(model){this.scene.remove(model);disposeModel(model)}model=createObjectiveFacilities(objective);this.objectiveFacilities.set(objective.id,model);this.scene.add(model)}model.position.set(objective.x,objective.y,this.altitude({...objective,id:`objective-facility-${objective.id}`},now)+.08);model.visible=graphics.models&&zoom>12&&(!performanceMode||nearby(objective.x,objective.y,60))}for(const[id,model]of this.objectiveFacilities)if(!liveFacilities.has(id)){this.scene.remove(model);disposeModel(model);this.objectiveFacilities.delete(id)}
    const liveAircraft=new Set([...state.units.filter(u=>isAir(u.role)||isSupportModel(u.role)).map(u=>u.id),...state.casualties.map(c=>`wreck-${c.id}`)]);for(const[id,model]of this.aircraft){if(!liveAircraft.has(id)){this.scene.remove(model);disposeModel(model);this.aircraft.delete(id)}else model.visible=false}
    for(const batches of Object.values(this.corpseBatches))for(const batch of batches)batch.begin()
    const corpseCounts={BLU:0,RED:0}
    const visibleCasualties=!graphics.models?[]:state.casualties.filter(c=>(!performanceMode||zoom>12&&nearby(c.x,c.y))&&(perspective==='OBS'||c.observed.includes(perspective))).map(c=>({...c,id:`wreck-${c.id}`,hp:0,members:0,maxMembers:0,ammo:0,fuel:0,path:[],mission:'DESTROYED',target:'',name:'Wreck',kills:0,subcommand:'',firing:false,spotted:true,soldiers:c.soldier?[c.soldier]:[]} as Unit))
    const mountedActors = carrierActorIds(state)
    for(const u of !graphics.models?[]:[...state.units.filter(u=>(!u.carrier||u.soldiers?.some(s=>s.disembarked))&&(u.hp>0||u.soldiers?.some(s=>s.status==='downed'))),...visibleCasualties]){if(perspective!=='OBS'&&u.side!==perspective&&!u.spotted)continue;const ll=lngLat(u),dist=Math.hypot((ll[0]-center.lng)*93650,(ll[1]-center.lat)*111320);if((dist>(performanceMode?1000:1700)||performanceMode&&zoom<=12)&&u.id!==selected)continue;const z=isNaval(u.role)&&u.role!=='AMPHIBIOUS_APC'?0:this.altitude(u,now)
      // Culling affects presentation only; the worker retains every unit and casualty.
      if(performanceMode&&u.id!==selected&&!this.inView(u.x,u.y,z+(u.altitude||0),isVehicle(u.role)?100:Math.max(80,...(u.soldiers||[]).map(s=>Math.hypot(s.x-u.x,s.y-u.y)+20))))continue
      this.visibleUnits.add(u.id)
      if(isAir(u.role)||isSupportModel(u.role)){let model=this.aircraft.get(u.id);if(!model){model=isAir(u.role)?createAircraft(u.role,u.side):createSupportModel(u.role,u.side);if(u.role==='TROOP_TRUCK')addCarrierOccupants(model,u.side);
        // Derivative flat normals lose precision at map-scale view positions.
        // Geometry already carries face normals; use those for stable lighting.
        model.traverse(o=>{if(o instanceof T.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof T.MeshStandardMaterial){m.flatShading=false;m.needsUpdate=true}}});if(u.hp<=0)model.traverse(o=>{if(o instanceof T.Mesh)(o.material as T.MeshStandardMaterial).color.multiplyScalar(.35)});this.aircraft.set(u.id,model);this.scene.add(model)}model.visible=graphics.models;model.position.set(u.x,u.y,z+(u.altitude||0)+.1);model.rotation.set(u.hp<=0?.18:0,(u.role==='JET'||u.role==='CAS_FIGHTER')?Math.sin(time)*.06:0,-u.heading);animateAircraft(model,u.hp>0&&u.engine?time:0,{x:u.x,y:u.y,heading:u.heading,aim:u.aim,time:state.time,active:u.hp>0&&!!u.engine});animateSupport(model,time,u.transport||{phase:'waiting',since:state.time,containerState:'empty'});if(u.role==='TROOP_TRUCK')updateCarrierOccupants(model,u,state);const chin=model.getObjectByName('chin-turret');if(chin)chin.rotation.z=u.heading-(u.aim??u.heading);const sling=model.getObjectByName('sling-cargo');if(sling)sling.visible=!!u.transport?.cargo&&(u.altitude||0)>8;const ramp=model.getObjectByName('cargo-ramp');if(ramp)ramp.rotation.x=u.transport?.phase==='unloading'?1.2:0;if(u.transport?.phase==='departed'||u.transport?.phase==='waiting'&&u.role==='CARGO_PLANE')model.visible=false}
      else if(isVehicle(u.role)){const key=`${u.side}-${u.role}`,mesh=this.groups.get(key)!,n=counts.get(key)||0;if(n>=64)continue;this.dummy.position.set(u.x,u.y,z+(u.altitude||0)+.1);this.dummy.rotation.set(u.hp<=0?.18:0,(u.role==='JET'||u.role==='CAS_FIGHTER')?Math.sin(time)*.06:0,-u.heading);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();mesh.setMatrixAt(n,this.dummy.matrix);mesh.setColorAt(n,new T.Color(u.hp<=0?.3:1,u.hp<=0?.3:1,u.hp<=0?.3:1));if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;counts.set(key,n+1);const attachment=this.groups.get(`${key}-attachment`);if(attachment){this.dummy.rotation.z=u.role==='ATTACK_HELI'?time*35:-(u.aim??u.heading);this.dummy.updateMatrix();attachment.setMatrixAt(n,this.dummy.matrix);counts.set(`${key}-attachment`,n+1)}}
      else for(const s of u.soldiers||[]){if(u.carrier&&!s.disembarked||mountedActors.has(s.id))continue;const ground=this.altitude(s,now);if(performanceMode&&u.id!==selected&&!this.inView(s.x,s.y,ground+1,4))continue;const detailedSoldier=zoom>17&&dist<(performanceMode?200:400);if(u.id.startsWith('wreck-')){const index=Math.floor(corpseCounts[u.side]++/400);if(!this.corpseBatches[u.side][index])this.corpseBatches[u.side][index]=new SoldierBatch(this.scene,u.side,new T.MeshStandardMaterial({vertexColors:true,roughness:.9}));this.corpseBatches[u.side][index].pose(s,u.role,time,ground+.05,detailedSoldier)}else this.soldiers[u.side].pose(s,u.role,time,ground+.05,detailedSoldier||u.id===selected);const n=ec.get('shadow')||0;if(graphics.shadows&&n<256){this.dummy.position.set(s.x,s.y,ground+.025);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(.65,.45,1);this.dummy.updateMatrix();this.effects.get('shadow')!.setMatrixAt(n,this.dummy.matrix);ec.set('shadow',n+1)}}
    }
    let combatLightCount=0
    const effectVisible=(x:number,y:number,z:number,radius:number)=>!performanceMode||nearby(x,y,radius)&&this.inView(x,y,z,radius)
    const place=(key:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,dir?:T.Vector3)=>{if(!effectVisible(x,y,z,Math.max(sx,sy,sz)))return;const mesh=this.effects.get(key)!,n=ec.get(key)||0;if(n>=mesh.instanceMatrix.count)return;this.dummy.position.set(x,y,z);this.dummy.rotation.set(0,0,0);if(dir)this.dummy.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),dir);this.dummy.scale.set(sx,sy,sz);this.dummy.updateMatrix();mesh.setMatrixAt(n,this.dummy.matrix);ec.set(key,n+1)}
    const illuminate=(x:number,y:number,z:number,intensity:number,distance:number)=>{const limit=performanceMode?4:this.combatLights.length;if(combatLightCount>=limit||!effectVisible(x,y,z,distance))return;const light=this.combatLights[combatLightCount++];light.position.set(x,y,z);light.intensity=intensity;light.distance=distance;light.visible=true}
    for(const e of state.shots){if(perspective!=='OBS'&&e.side!==perspective&&!e.spotted)continue;const age=time-e.time;if(age<0)continue;const start=new T.Vector3(e.start.x,e.start.y,e.start.z),end=new T.Vector3(e.end.x,e.end.y,e.end.z);if(!graphics.terrain){start.z-=this.altitude({...e.start,id:`s${e.id}`},now);end.z-=this.altitude({...e.end,id:`e${e.id}`},now)}const length=start.distanceTo(end),duration=length/e.speed,p=Math.min(1,age/Math.max(.03,duration)),pos=start.clone().lerp(end,p),direction=end.clone().sub(start).normalize();if(e.weapon==='mortar')pos.z+=Math.sin(p*Math.PI)*length*.22
      const rocket=['at','aa','missile'].includes(e.weapon)
      if(age<.11){const fade=1-age/.11,flash=start.clone().addScaledVector(direction,.35);place('muzzle',flash.x,flash.y,flash.z,.18+e.size*1.5,.18+e.size*1.5,(1+e.size*4)*fade,direction);illuminate(flash.x,flash.y,flash.z,55*fade,14+e.size*24)}
      if(age<duration){const size=Math.max(e.size,zoom<17?.18:.055),streak=rocket?1.1:Math.min(3.5,Math.max(.7,e.speed*.004));place('tracer-core',pos.x,pos.y,pos.z,size,size,streak,direction);place('tracer-glow',pos.x,pos.y,pos.z,size*3.5,size*3.5,streak*1.25,direction);illuminate(pos.x,pos.y,pos.z,rocket?38:18,rocket?20:10)
        if(rocket)place('rocket-flame',pos.x-direction.x*.65,pos.y-direction.y*.65,pos.z-direction.z*.65,size*2.4,size*2.4,1.1,direction)
      }else{const impact=age-duration,life=e.blast?1.3:.16;if(impact<life){const r=e.blast?Math.max(.3,e.blast*Math.sin(impact/life*Math.PI/2)):.35;place(`${e.side}-blast`,end.x,end.y,end.z,r,r,r);if(e.blast)illuminate(end.x,end.y,end.z,70*(1-impact/life),Math.max(16,e.blast*2))}}
      if(rocket){const smokeLife=2.4,step=performanceMode?.24:.12,maxTrail=performanceMode?12:24;for(let i=1;i<=maxTrail;i++){const emitted=Math.min(age,duration)-i*step;if(emitted<0)continue;const puffAge=age-emitted;if(puffAge>smokeLife)continue;const q=emitted/Math.max(.03,duration),trail=start.clone().lerp(end,q),fade=1-puffAge/smokeLife,r=(.28+e.size*.8+puffAge*.42)*Math.max(.2,fade);trail.z+=puffAge*.32;place('rocket-smoke',trail.x,trail.y,trail.z,r,r,r)}}
    }
    for(let i=combatLightCount;i<this.combatLights.length;i++)this.combatLights[i].visible=false
    for(const c of state.casualties){const age=time-c.time;if(isVehicle(c.role)&&c.altitude===0&&age<24&&(perspective==='OBS'||c.observed.includes(perspective))){if(performanceMode&&!nearby(c.x,c.y,12))continue;const z=this.altitude(c,now);for(let i=0;i<3;i++)place('smoke',c.x+Math.sin(i)*2,c.y+Math.cos(i)*2,z+2+i*2,2+i,2+i,3+i)}}
    for(const s of state.smokes){if(performanceMode&&!nearby(s.x,s.y,16))continue;if(perspective!=='OBS'&&s.side!==perspective&&!state.units.some(u=>u.side===perspective&&Math.hypot(u.x-s.x,u.y-s.y)<600))continue;const age=time-s.time;if(age<1){const p=Math.max(0,age);place(`${s.side}-core`,s.from.x+(s.x-s.from.x)*p,s.from.y+(s.y-s.from.y)*p,s.from.z+(s.z-s.from.z)*p+Math.sin(p*Math.PI)*4,.12,.12,.12)}else{const r=Math.min(12,(age-1)*4)*Math.min(1,(s.expires-time)/4);for(let i=0;i<5;i++)place('smoke',s.x+Math.sin(i*2)*r*.4,s.y+Math.cos(i*2)*r*.4,s.z+3+i,r*.65,r*.65,r*.65)}}
    for(const batches of Object.values(this.corpseBatches))for(const batch of batches)batch.end(graphics.models)
    this.soldiers.BLU.end(graphics.models);this.soldiers.RED.end(graphics.models);for(const[key,mesh]of this.groups){mesh.count=graphics.models?counts.get(key)||0:0;mesh.visible=mesh.count>0;if(mesh.count)mesh.instanceMatrix.needsUpdate=true}for(const[key,mesh]of this.effects){mesh.count=ec.get(key)||0;mesh.visible=mesh.count>0;if(mesh.count)mesh.instanceMatrix.needsUpdate=true}
    this.map.configure(graphics);if(!state.paused&&!state.winner&&!document.hidden)this.map.triggerRepaint();if(this.ground.size>1500)this.ground.clear()
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.map.off('sourcedata',this.terrainChanged);if(process.env.NODE_ENV==='development'){const debug=window as unknown as {gridDebug?:BattlefieldRenderer};if(debug.gridDebug===this)delete debug.gridDebug}this.map.detachBattlefield();this.soldiers.BLU.dispose();this.soldiers.RED.dispose();for(const batches of Object.values(this.corpseBatches))for(const batch of batches)batch.dispose();this.buildings.dispose();disposeModel(this.scene);this.aircraft.clear();this.bases=[];this.ground.clear()}
}
