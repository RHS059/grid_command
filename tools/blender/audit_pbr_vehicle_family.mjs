import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(process.argv[2]||'E:/Grid Command Dev Branch/upload')
const modelDir=path.join(root,'public/models/vehicles')
const ids=[
 'hemtt_base_pbr','hemtt_ammo_pbr','hemtt_fob_pbr','hemtt_fuel_pbr','hemtt_medical_pbr','hemtt_repair_pbr','hemtt_supply_pbr','hemtt_troop_pbr',
 'apc_base_pbr','apc_30mm_pbr','apc_aa_pbr','apc_mg_pbr','apc_tankkiller_pbr',
]
const moduleRoles=['ammo','fob','fuel','medical','repair','supply','troop']

function readGlb(file){
 const raw=fs.readFileSync(file)
 if(raw.readUInt32LE(0)!==0x46546c67)throw new Error(`${file}: not GLB`)
 const jsonLength=raw.readUInt32LE(12)
 return JSON.parse(raw.subarray(20,20+jsonLength).toString('utf8').trim())
}

function triangles(doc){
 let total=0
 for(const node of doc.nodes||[]){
  if(node.mesh===undefined)continue
  for(const prim of doc.meshes[node.mesh].primitives||[]){
   if(prim.mode!==undefined&&prim.mode!==4)continue
   const count=prim.indices!==undefined?doc.accessors[prim.indices].count:doc.accessors[prim.attributes.POSITION].count
   total+=Math.floor(count/3)
  }
 }
 return total
}

const audit={revision:'approved-pbr-rig-v1',root,passed:true,assets:[],errors:[]}
for(const id of ids){
 try{
  const reviewOnly=id.startsWith('hemtt_')&&id!=='hemtt_base_pbr'
  const payloadDir=reviewOnly?path.join(root,'assets/vehicles/rigged/review_full_variants'):modelDir
  const rigPath=path.join(payloadDir,`${id}.rig.json`)
  const glbPath=path.join(payloadDir,`${id}.glb`)
  const blendPath=path.join(root,'assets/vehicles/rigged',`${id}_rigged.blend`)
  const previews=['front3q','rear3q'].map(v=>path.join(root,'assets/vehicles/rigged/previews',`${id}_${v}.png`))
  for(const file of [rigPath,glbPath,blendPath,...previews])if(!fs.existsSync(file))throw new Error(`missing ${file}`)
  const rig=JSON.parse(fs.readFileSync(rigPath,'utf8'))
  const doc=readGlb(glbPath)
  const clips=(doc.animations||[]).map(a=>a.name).sort()
  const expected=(id.startsWith('hemtt_')?['idle','drive','steer']:id==='apc_base_pbr'?['idle','drive','steer','open','close']:['idle','drive','steer','open','close','aim','shoot']).sort()
  if(JSON.stringify(clips)!==JSON.stringify(expected))throw new Error(`clips ${clips} != ${expected}`)
  const names=(doc.nodes||[]).map(n=>n.name||'')
  if(!names.includes('GC_ASSET'))throw new Error('missing GC_ASSET')
  if(id==='hemtt_base_pbr'&&!names.includes('Mount_rear_module'))throw new Error('base HEMTT missing Mount_rear_module')
  const wheelNodes=names.filter(n=>/^Wheel_[LR]_[0-3]$/.test(n))
  if(wheelNodes.length!==8)throw new Error(`expected 8 wheel meshes, got ${wheelNodes.length}`)
  const wheelMeshIndices=(doc.nodes||[]).filter(n=>/^Wheel_[LR]_[0-3]$/.test(n.name||'')).map(n=>n.mesh)
  if(new Set(wheelMeshIndices).size!==1)throw new Error('wheel instances do not share one GLB mesh')
  const animationByName=new Map((doc.animations||[]).map(a=>[a.name,a]))
  const targets=name=>[...new Set((animationByName.get(name)?.channels||[]).map(c=>doc.nodes[c.target.node]?.name||''))].sort()
  const driveTargets=targets('drive').filter(n=>n.startsWith('Assembly_wheel_'))
  if(driveTargets.length!==8)throw new Error(`drive targets ${driveTargets.length} wheels`)
  const steerTargets=targets('steer').filter(n=>n.startsWith('Assembly_wheel_'))
  if(steerTargets.length!==4||steerTargets.some(n=>!n.endsWith('_0')&&!n.endsWith('_1')))throw new Error(`steer targets ${steerTargets}`)
  if(id.startsWith('apc_')){
   for(const clip of ['open','close'])if(!targets(clip).includes('Assembly_ramp'))throw new Error(`${clip} does not target ramp`)
  }
  if(id.startsWith('apc_')&&id!=='apc_base_pbr'){
   const aimTargets=targets('aim')
   if(!aimTargets.includes('Assembly_turret')||!aimTargets.includes('Assembly_gun'))throw new Error(`aim targets ${aimTargets}`)
   if(!targets('shoot').includes('Assembly_gun'))throw new Error('shoot does not target gun')
  }
  const assemblies=names.filter(n=>n.startsWith('Assembly_')).length
  const mounts=names.filter(n=>n.startsWith('Mount_')).length
  if(assemblies<9||mounts<9)throw new Error(`hierarchy too small: ${assemblies} assemblies, ${mounts} mounts`)
  const mats=doc.materials||[]
  if(!mats.length)throw new Error('no GLB materials')
  if(!mats.some(m=>m.pbrMetallicRoughness?.baseColorTexture))throw new Error('no embedded PBR base color texture')
  if(!mats.some(m=>m.normalTexture))throw new Error('no embedded PBR normal texture')
  if((doc.images||[]).length<3)throw new Error(`expected embedded images, got ${(doc.images||[]).length}`)
  if(!rig.allWheelInstancesLinked)throw new Error('rig manifest reports unlinked wheels')
  if(Math.abs(rig.bounds.min[2])>1e-5)throw new Error(`ground datum ${rig.bounds.min[2]}`)
  const tri=triangles(doc)
  if(tri!==rig.triangles)throw new Error(`GLB/evaluated triangle mismatch ${tri}/${rig.triangles}`)
  const classification=id==='hemtt_base_pbr'||id.startsWith('apc_')?'runtime-vehicle':'review-extraction-source'
  audit.assets.push({id,classification,triangles:tri,clips,bounds:rig.bounds,dimensions:rig.dimensions,materials:mats.map(m=>m.name),images:(doc.images||[]).length,assemblies,mounts,linkedWheelMesh:wheelMeshIndices[0],animationTargets:Object.fromEntries(clips.map(name=>[name,targets(name)]))})
 }catch(error){
  audit.passed=false
  audit.errors.push({id,message:String(error.message||error)})
 }
}
audit.modules=[]
for(const role of moduleRoles){
 const id=`hemtt_${role}_module_pbr`
 try{
  const rigPath=path.join(modelDir,`${id}.rig.json`)
  const glbPath=path.join(modelDir,`${id}.glb`)
  const blendPath=path.join(root,'assets/vehicles/rigged/modules',`${id}.blend`)
  for(const file of [rigPath,glbPath,blendPath])if(!fs.existsSync(file))throw new Error(`missing ${file}`)
  const rig=JSON.parse(fs.readFileSync(rigPath,'utf8'))
  const doc=readGlb(glbPath)
  const names=(doc.nodes||[]).map(n=>n.name||'')
  if(!names.includes('GC_MODULE')||!names.includes('Assembly_module')||!names.includes('Mount_module_payload_0'))throw new Error(`invalid module hierarchy ${names}`)
  if(names.some(n=>/Wheel_[LR]_|_body$|_hull$/i.test(n)))throw new Error('module GLB contains base truck geometry')
  if((doc.animations||[]).length)throw new Error('static module unexpectedly has animations')
  const mats=doc.materials||[]
  if(!mats.some(m=>m.pbrMetallicRoughness?.baseColorTexture)||!mats.some(m=>m.normalTexture))throw new Error('module lacks embedded base color or normal texture')
  const tri=triangles(doc)
  if(tri!==rig.triangles)throw new Error(`triangle mismatch ${tri}/${rig.triangles}`)
  if(rig.containsBaseTruck!==false||rig.attachMount!=='Mount_rear_module')throw new Error('module manifest attachment contract mismatch')
  audit.modules.push({id,classification:'runtime-rear-module',triangles:tri,bounds:rig.bounds,composedBounds:rig.composedBounds,materials:mats.map(m=>m.name),images:(doc.images||[]).length})
 }catch(error){audit.passed=false;audit.errors.push({id,message:String(error.message||error)})}
}
const base=audit.assets.find(a=>a.id==='hemtt_base_pbr')
const composed=module=>({
 min:base.bounds.min.map((v,i)=>Math.min(v,module.composedBounds.min[i])),
 max:base.bounds.max.map((v,i)=>Math.max(v,module.composedBounds.max[i])),
})
const runtimeManifest={
 revision:'approved-pbr-modular-runtime-v1',axisConvention:'+Y forward, +Z up',units:'meters',
 hemtt:{base:'public/models/vehicles/hemtt_base_pbr.glb',mountNode:'Mount_rear_module',mountTransform:{position:[0,-1.5,1.396894],rotationQuaternion:[0,0,0,1],scale:[1,1,1]},modules:Object.fromEntries(audit.modules.map(m=>[m.id.replace(/^hemtt_|_module_pbr$/g,''),{glb:`public/models/vehicles/${m.id}.glb`,rig:`public/models/vehicles/${m.id}.rig.json`,triangles:m.triangles,composedBounds:composed(m)}]))},
 apcs:audit.assets.filter(a=>a.id.startsWith('apc_')).map(a=>({id:a.id,glb:`public/models/vehicles/${a.id}.glb`,rig:`public/models/vehicles/${a.id}.rig.json`,triangles:a.triangles,bounds:a.bounds})),
 reviewOnlyFullHemttVariants:audit.assets.filter(a=>a.classification==='review-extraction-source').map(a=>a.id),
}
const proofDir=path.join(root,'assets/vehicles/rigged/previews')
const proofNames=[
 'proof_hemtt_steer_t0p5','proof_hemtt_drive_t0p3125','proof_apc_30mm_aim_t1p0',
 'proof_apc_30mm_shoot_t0p12','proof_apc_30mm_open_t2p0',
 'proof_hemtt_base_plus_supply_module','proof_hemtt_base_plus_fob_module',
]
const proofManifest={revision:'approved-pbr-animation-and-module-proof-v1',proofs:[]}
for(const name of proofNames){
 const png=path.join(proofDir,`${name}.png`),jsonPath=path.join(proofDir,`${name}.proof.json`)
 if(!fs.existsSync(png)||!fs.existsSync(jsonPath)){audit.passed=false;audit.errors.push({id:name,message:'missing proof PNG or JSON'});continue}
 const proof=JSON.parse(fs.readFileSync(jsonPath,'utf8'))
 if(proof.clip&&!proof.usesSavedActionTracks){audit.passed=false;audit.errors.push({id:name,message:'animation proof did not use saved action tracks'})}
 if(proof.module&&!proof.usesStagedModuleGlb){audit.passed=false;audit.errors.push({id:name,message:'module proof did not import staged module GLB'})}
 proofManifest.proofs.push(proof)
}
audit.proofs='assets/vehicles/rigged/previews/animation_pose_proof.json'
audit.runtimeManifest='assets/vehicles/rigged/vehicle_runtime_manifest.json'
const out=path.join(root,'assets/vehicles/rigged/vehicle_rig_audit.json')
fs.writeFileSync(out,JSON.stringify(audit,null,2)+'\n')
fs.writeFileSync(path.join(root,'assets/vehicles/rigged/vehicle_runtime_manifest.json'),JSON.stringify(runtimeManifest,null,2)+'\n')
fs.writeFileSync(path.join(proofDir,'animation_pose_proof.json'),JSON.stringify(proofManifest,null,2)+'\n')
console.log(JSON.stringify({passed:audit.passed,vehicles:audit.assets.length,modules:audit.modules.length,errors:audit.errors},null,2))
if(!audit.passed)process.exitCode=1
