import test from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_CATALOG } from '../lib/game/model-catalog'
import { HEMTT_REAR_MODULE_MOUNT, NATIVE_GAMEPLAY_VEHICLES, NATIVE_VEHICLE_ASSETS, NATIVE_VEHICLE_IDS, createNativeGameplayVehicle, createNativeVehicle, nativeVehicleBounds, setNativeVehicleClip } from '../lib/game/native-vehicle-assets'
import { Mesh, Vector3 } from '../lib/game/scene-data'

const HEMTT=['HEMTT_BASE','HEMTT_AMMO','HEMTT_FOB','HEMTT_FUEL','HEMTT_MEDICAL','HEMTT_REPAIR','HEMTT_SUPPLY','HEMTT_TROOP']
const APC=['APC_BASE','APC_30MM','APC_AA','APC_MG','APC_TANKKILLER']

test('native PBR registry is complete and exposed in Model Preview',()=>{
  assert.deepEqual(NATIVE_VEHICLE_IDS,[...HEMTT,...APC])
  assert.equal(Object.keys(NATIVE_VEHICLE_ASSETS).length,13)
  for(const id of NATIVE_VEHICLE_IDS){const asset=NATIVE_VEHICLE_ASSETS[id];assert.equal(asset.id,id);assert.ok(MODEL_CATALOG.includes(id));assert.match(asset.url,/^\/models\/vehicles\/(hemtt|apc)_.+_pbr\.glb$/);assert.equal(asset.rigUrl,asset.url.replace(/\.glb$/,'.rig.json'));assert.equal(asset.moduleRigUrl,asset.moduleUrl?.replace(/\.glb$/,'.rig.json'));assert.equal(asset.materialPolicy,'preserve-gltf-pbr')}
})

test('native vehicles use the Babylon GLB path without compact vertex-color geometry',()=>{
  for(const id of NATIVE_VEHICLE_IDS){const root=createNativeVehicle(id,'BLU'),urls:string[]=[];root.traverse(node=>{assert.ok(!(node instanceof Mesh));if(node.userData.nativeAssetURL)urls.push(node.userData.nativeAssetURL)});assert.ok(urls.every(url=>url.endsWith('.glb')));assert.equal(root.userData.nativeMaterialPolicy,'preserve-gltf-pbr');assert.equal(root.userData.nativeVehicle,true)}
})

test('HEMTT variants compose one shared animated base with one mount-relative module',()=>{
  for(const id of HEMTT){const asset=NATIVE_VEHICLE_ASSETS[id as keyof typeof NATIVE_VEHICLE_ASSETS],root=createNativeVehicle(id as keyof typeof NATIVE_VEHICLE_ASSETS,'BLU'),base=root.getObjectByName('GC_ASSET')!,mount=root.getObjectByName(HEMTT_REAR_MODULE_MOUNT.node)!,module=root.getObjectByName('GC_MODULE'),urls:string[]=[];root.traverse(node=>{if(node.userData.nativeAssetURL)urls.push(node.userData.nativeAssetURL)});assert.deepEqual(mount.position.toArray(),[...HEMTT_REAR_MODULE_MOUNT.position]);assert.ok(urls[0].endsWith('/models/vehicles/hemtt_base_pbr.glb'));assert.equal(module!==undefined,id!=='HEMTT_BASE');assert.equal(urls.length,id==='HEMTT_BASE'?1:2);if(asset.moduleUrl)assert.ok(urls[1].endsWith(asset.moduleUrl));assert.ok(!urls.some(url=>url.endsWith(`/hemtt_${asset.variant}_pbr.glb`)&&asset.variant!=='base'))
    setNativeVehicleClip(root,'drive',.5);assert.equal(base.userData.animationState[0].name,'drive');assert.equal(root.userData.animationState,undefined)
  }
})

test('clip names match the rig/export contract',()=>{
  for(const id of HEMTT){assert.deepEqual(NATIVE_VEHICLE_ASSETS[id as keyof typeof NATIVE_VEHICLE_ASSETS].clips.map(c=>c.id),['idle','drive','steer'])}
  assert.deepEqual(NATIVE_VEHICLE_ASSETS.APC_BASE.clips.map(c=>c.id),['idle','drive','steer','open','close'])
  for(const id of APC.slice(1))assert.deepEqual(NATIVE_VEHICLE_ASSETS[id as keyof typeof NATIVE_VEHICLE_ASSETS].clips.map(c=>c.id),['idle','drive','steer','open','close','aim','shoot'])
  const root=createNativeVehicle('APC_30MM','RED');setNativeVehicleClip(root,'shoot',99);assert.equal(root.userData.animationState[0].name,'shoot');assert.equal(root.userData.animationState[0].time,1.2)
})

test('declared native bounds are finite, grounded and frame each family at vehicle scale',()=>{
  for(const id of NATIVE_VEHICLE_IDS){const box=nativeVehicleBounds(id),size=box.getSize(new Vector3());assert.ok(size.toArray().every(Number.isFinite));assert.ok(size.x>2&&size.y>6&&size.z>2);assert.equal(box.min.z,0)}
})

test('only unambiguous roles opt into native replacements',()=>{
  assert.deepEqual(NATIVE_GAMEPLAY_VEHICLES,{TRUCK:'HEMTT_SUPPLY',APC:'APC_BASE',CANNON_APC:'APC_30MM'})
  assert.equal(NATIVE_GAMEPLAY_VEHICLES.TROOP_TRUCK,undefined)
  assert.equal(NATIVE_GAMEPLAY_VEHICLES.IFV,undefined)
  assert.equal(createNativeGameplayVehicle('TRUCK','BLU')?.name,'TRUCK')
  assert.equal(createNativeGameplayVehicle('TROOP_TRUCK','BLU'),undefined)
})
