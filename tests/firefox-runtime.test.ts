import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { BabylonRuntime, sanitizeFirefoxWGSL } from '../lib/game/babylon-runtime'
import * as D from '../lib/game/scene-data'

test('Firefox WGSL removes only Chromium diagnostics and unused front-facing input',()=>{
 const directive='diagnostic(off, chromium.unreachable_code);\n'
 for(const stage of ['@vertex','@fragment']){
  const source=directive+'diagnostic(off, derivative_uniformity);\n'+stage+' fn main() {}'
  const result=sanitizeFirefoxWGSL(source);assert.ok(!result.includes('chromium.unreachable_code'));assert.ok(result.includes('derivative_uniformity'));assert.ok(result.includes(stage));assert.equal(sanitizeFirefoxWGSL(result),result)
 }
 const inputs='struct FragmentInputs { @builtin(position) position: vec4<f32>, @builtin(front_facing) frontFacing : bool, };'
 assert.ok(!sanitizeFirefoxWGSL(inputs).includes('front_facing'))
 assert.ok(sanitizeFirefoxWGSL(inputs+' fn normal() { let front=fragmentInputs.frontFacing; }').includes('front_facing'))
})

test('a reused preview runtime prunes lights and geometry across model scenes',()=>{
 const engine=new NullEngine(),runtime=new (BabylonRuntime as unknown as new(canvas:HTMLCanvasElement,engine:NullEngine)=>BabylonRuntime)({dataset:{}} as HTMLCanvasElement,engine)
 try{
  for(let i=0;i<5;i++){
   const root=new D.Scene(),sky=new D.HemisphereLight('#ffffff','#222222',.65),sun=new D.DirectionalLight('#ffffff',1.1),fill=new D.DirectionalLight('#ffffff',.35)
   sky.name='sky-'+i;sun.name='sun-'+i;fill.name='fill-'+i;sun.position.set(3,4,5);fill.position.set(-3,4,5);root.add(sky,sun,fill)
   const mesh=new D.Mesh(new D.BoxGeometry(1,1,1),new D.MeshStandardMaterial());mesh.name='model-'+i;root.add(mesh)
   runtime.sync(root)
   assert.equal(runtime.engine,engine);assert.equal(runtime.scene.lights.filter(l=>/^(sky|sun|fill)-/.test(l.name)).length,3)
   assert.ok(runtime.scene.meshes.some(m=>m.name==='model-'+i));if(i)assert.ok(!runtime.scene.meshes.some(m=>m.name==='model-'+(i-1)))
   for(const material of runtime.scene.materials)if('maxSimultaneousLights' in material)assert.equal(material.maxSimultaneousLights,4)
  }
  runtime.sync(new D.Scene());assert.equal(runtime.scene.lights.filter(l=>/^(sky|sun|fill)-/.test(l.name)).length,0)
 }finally{runtime.dispose()}
})
