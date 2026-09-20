import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine'
import { WebGPUShaderProcessorWGSL } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL'
import { Engine } from '@babylonjs/core/Engines/engine'
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Material } from '@babylonjs/core/Materials/material'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { ClusteredLightContainer } from '@babylonjs/core/Lights/Clustered/clusteredLightContainer'
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator'
import { Animation } from '@babylonjs/core/Animations/animation'
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import '@babylonjs/core/Animations/animatable'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import '@babylonjs/loaders/glTF'
import * as D from './scene-data'
import { BattlefieldEffects } from './babylon-effects'
import { InteriorRoomPlugin } from './babylon-interior'
import { applyVehiclePbrMaps, createDestroyedMaterial, FURY_PBR_MAPS, hasDestroyedAppearance, type VehicleDamageState } from './babylon-destroyed'
import type { Graphics } from './types'
import { StartupDeadlineError, withStartupDeadline } from './startup-deadline'
import { configureShadowNormalBias, fitStudioShadowDepth } from './shadow-shading'
import { ensureLodDither } from './babylon-lod-dither'
import { lodDitherRange, type LodDitherRange, type ModelLodState } from './lod-transition'

type DrawRecord={mesh:Mesh;geometry:D.BufferGeometry;version:string;instanceVersion:string;castShadow:boolean;ownedGeometry?:boolean;sectors?:Map<string,number[]>;sectorVersion?:string;instanceCount?:number;instanceBuffers?:Map<string,Float32Array>;instanceBoundsDirty?:boolean;world?:Matrix;worldValues?:number[]}
const WEBGPU_STARTUP_TIMEOUT_MS=10000
const disposeWebGPUCandidate=(candidate:WebGPUEngine)=>{
  try{candidate.dispose()}
  catch{
    // Babylon disposal assumes initAsync finished constructing its resources.
    try{(candidate as WebGPUEngine&{_device?:{destroy:()=>void}})._device?.destroy()}catch{}
  }
}
/** scene-data colors are authored as CSS/sRGB values, while Babylon PBR inputs are linear. */
export const srgbChannelToLinear=(value:number)=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4
const color=(c:D.Color)=>new Color3(srgbChannelToLinear(c.r),srgbChannelToLinear(c.g),srgbChannelToLinear(c.b))
const linearTint=(target:Float32Array,offset:number,r:number,g:number,b:number)=>target.set([srgbChannelToLinear(r),srgbChannelToLinear(g),srgbChannelToLinear(b),1],offset)
const damageState=(object:D.Object3D):Partial<VehicleDamageState>|undefined=>{for(let node:D.Object3D|null=object;node;node=node.parent){if(node.userData.vehicleDamage)return node.userData.vehicleDamage as Partial<VehicleDamageState>;if(node.userData.destroyed===true)return{damage:1,destruction:.42,heat:.32}}}
const colliderState=(object:D.Object3D):{enabled:boolean;halfExtents:{x:number;y:number;z:number};phase:string}|undefined=>{for(let node:D.Object3D|null=object;node;node=node.parent)if(node.userData.vehicleCollider)return node.userData.vehicleCollider}
/** Babylon 9.25 injects a Chromium-only rule and an unused fragment builtin. */
export function sanitizeFirefoxWGSL(code:string){
  let result=code.replace(/diagnostic\s*\(\s*off\s*,\s*chromium\.unreachable_code\s*\)\s*;[ \t]*\r?\n?/g,'')
  const withoutFacing=result.replace(/@builtin\(front_facing\)\s+frontFacing\s*:\s*bool\s*,?/g,'')
  // Retain the builtin whenever two-sided lighting (or another shader) actually reads it.
  if(!/\bfrontFacing\b/.test(withoutFacing.replace(/\/\/[^\n]*/g,'')))result=withoutFacing
  return result
}
let firefoxWGSLPatched=false
export const prepareFirefoxWGSL=()=>{
  // Remove unused inputs on every backend to keep shadow shaders within device limits.
  if(firefoxWGSLPatched)return
  firefoxWGSLPatched=true
  const prototype=WebGPUShaderProcessorWGSL.prototype,finalize=prototype.finalizeShaders
  prototype.finalizeShaders=function(vertexCode:string,fragmentCode:string){
    const result=finalize.call(this,vertexCode,fragmentCode)
    return{vertexCode:sanitizeFirefoxWGSL(result.vertexCode),fragmentCode:sanitizeFirefoxWGSL(result.fragmentCode)}
  }
}
export class BabylonRuntime {
  readonly scene:Scene
  readonly camera:FreeCamera
  readonly backend:'webgpu'|'webgl'
  readonly effects:BattlefieldEffects
  private readonly draws=new Map<number,DrawRecord>()
  private readonly materials=new Map<D.Material,PBRMaterial>()
  private readonly refreshedMaterials=new Set<D.Material>()
  private readonly textures=new Map<string,Texture>()
  private readonly destroyedMaterials=new Map<PBRMaterial,PBRMaterial>()
  private readonly nativeOriginalMaterials=new Map<Mesh,PBRMaterial>()
  private readonly lights=new Map<number,DirectionalLight|HemisphericLight|PointLight>()
  private readonly native=new Map<number,{pivot:TransformNode;entries?:InstantiatedEntries;source:D.Object3D;destroyed?:boolean}>()
  private readonly casters=new Set<number>()
  private readonly nativeNodes=new Map<number,TransformNode>()
  private readonly assets=new Map<string,Promise<AssetContainer>>()
  private clustered:ClusteredLightContainer
  private shadows:CascadedShadowGenerator|null=null
  private disposed=false
  private settings:Graphics|null=null
  private sun:DirectionalLight|null=null
  private profile:D.SceneProfile='legacy'

  static async create(canvas:HTMLCanvasElement,forceWebGL=false){
    let engine:AbstractEngine|undefined
    if(!forceWebGL&&window.isSecureContext&&'gpu'in navigator){
      let candidate:WebGPUEngine|undefined
      try{
        prepareFirefoxWGSL()
        candidate=new WebGPUEngine(canvas,{antialias:false,powerPreference:'high-performance'})
        const initialization=candidate.initAsync()
        await withStartupDeadline(initialization,WEBGPU_STARTUP_TIMEOUT_MS,'WebGPU startup',()=>disposeWebGPUCandidate(candidate!))
        engine=candidate
      }catch(error){console.warn('WebGPU startup failed; switching to Babylon compatibility rendering.',error);if(candidate&&!(error instanceof StartupDeadlineError))disposeWebGPUCandidate(candidate);const replacement=canvas.cloneNode(false)as HTMLCanvasElement;canvas.replaceWith(replacement);canvas=replacement}
    }
    engine??=new Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true,doNotHandleContextLost:false})
    return new BabylonRuntime(canvas,engine)
  }
  private constructor(readonly canvas:HTMLCanvasElement,readonly engine:AbstractEngine){
    this.backend=engine.isWebGPU?'webgpu':'webgl';canvas.dataset.graphicsBackend=this.backend
    this.scene=new Scene(engine);this.scene.useRightHandedSystem=true;this.scene.clearColor=new Color4(.035,.065,.095,1)
    this.camera=new FreeCamera('battlefield-camera',new Vector3(0,-1000,1000),this.scene)
    this.camera.upVector=new Vector3(0,0,1);this.camera.minZ=.1;this.camera.maxZ=200000;this.camera.setTarget(Vector3.Zero());this.scene.activeCamera=this.camera
    this.clustered=new ClusteredLightContainer('battlefield-clustered-lights',[],this.scene)
    this.clustered.horizontalTiles=16;this.clustered.verticalTiles=9;this.clustered.depthSlices=24;this.clustered.maxRange=250
    this.effects=new BattlefieldEffects(this.scene,this.camera)
  }
  configure(graphics:Graphics){this.settings=graphics;const low=!!graphics.performanceMode||graphics.quality==='performance'||!this.engine.getCaps().drawBuffersExtension||!this.engine.getCaps().textureHalfFloatRender;this.effects.configure(low?'performance':graphics.quality);if(this.shadows)this.shadows.getShadowMap()!.refreshRate=graphics.shadows&&!low?1:0;this.scene.shadowsEnabled=graphics.shadows&&!low}
  resize(width:number,height:number,ratio:number){const scale=1/ratio;if(this.engine.getHardwareScalingLevel()!==scale)this.engine.setHardwareScalingLevel(scale);this.engine.setSize(Math.max(2,Math.round(width*ratio)),Math.max(2,Math.round(height*ratio)))}
  setCamera(position:{x:number;y:number;z:number},target:{x:number;y:number;z:number},up:{x:number;y:number;z:number},fov:number,near:number,far:number){
    this.camera.position.copyFromFloats(position.x,position.y,position.z);this.camera.upVector.copyFromFloats(up.x,up.y,up.z);this.camera.fov=fov;this.camera.minZ=near;this.camera.maxZ=far;this.camera.setTarget(new Vector3(target.x,target.y,target.z));this.camera.getViewMatrix(true);this.camera.getProjectionMatrix(true);this.shadows?.splitFrustum()
  }
  getViewProjection(){return this.camera.getViewMatrix().multiply(this.camera.getProjectionMatrix())}
  private getMaterial(source:D.Material){
    const refreshed=this.materials.get(source)
    if(refreshed&&this.refreshedMaterials.has(source))return refreshed
    this.refreshedMaterials.add(source)
    let material=this.materials.get(source);if(!material){material=new PBRMaterial(source.name||`material-${source.id}`,this.scene);this.materials.set(source,material);if(source.name==='interior-window')new InteriorRoomPlugin(material);material.maxSimultaneousLights=4;material.backFaceCulling=source.side!==D.DoubleSide;material.twoSidedLighting=source.side===D.DoubleSide;material.unlit=source instanceof D.MeshBasicMaterial;material.wireframe=source.wireframe;material.disableDepthWrite=!source.depthWrite;material.depthFunction=source.depthTest?Engine.LEQUAL:Engine.ALWAYS;material.alphaMode=source.blending===D.AdditiveBlending?Engine.ALPHA_ADD:Engine.ALPHA_COMBINE;material.transparencyMode=source.transparent?PBRMaterial.PBRMATERIAL_ALPHABLEND:PBRMaterial.PBRMATERIAL_OPAQUE}
    if(source.map){let texture=this.textures.get(source.map);if(!texture){texture=new Texture(source.map,this.scene,false,false);texture.gammaSpace=true;this.textures.set(source.map,texture)}material.albedoTexture=texture}else material.albedoTexture=null
    material.disableDepthWrite=!source.depthWrite||!source.depthTest;material.depthFunction=source.depthTest?Engine.LEQUAL:Engine.ALWAYS
    material.albedoColor=color(source.color);material.emissiveColor=color(source.emissive).scale(source.emissiveIntensity);material.roughness=source.roughness;material.metallic=source.metalness;material.alpha=source.opacity;if(source.uniforms.wireColor)material.albedoColor=color(source.uniforms.wireColor.value)
    if(source.map?.endsWith('/models/fighter_albedo.png'))applyVehiclePbrMaps(material,FURY_PBR_MAPS)
    if(source.name==='interior-window'){material.albedoColor=color(source.uniforms.windowTint?.value||new D.Color('#35596b'));material.roughness=.2;material.metallic=.45;material.emissiveColor=new Color3(.025,.03,.035)}
    return material
  }
  private damagedMaterial(source:PBRMaterial,destroyed:boolean){
    if(!destroyed)return source
    let material=this.destroyedMaterials.get(source)
    if(!material){material=createDestroyedMaterial(source);this.destroyedMaterials.set(source,material)}
    return material
  }
  private updateWorld(record:DrawRecord,object:D.Object3D){
    const values=object.matrixWorld.elements,previous=record.worldValues
    let changed=!previous
    for(let index=0;!changed&&index<16;index++)if(values[index]!==previous![index])changed=true
    if(!changed)return
    record.worldValues??=new Array<number>(16)
    for(let index=0;index<16;index++)record.worldValues[index]=values[index]
    record.world??=Matrix.Identity()
    Matrix.FromArrayToRef(values,0,record.world)
    record.mesh.freezeWorldMatrix(record.world)
  }
  private updateGeometry(record:DrawRecord,source:D.Mesh,geometry=source.geometry){
    // Key on buffer identity as well as its version: swapping in a freshly built normal
    // buffer (which starts back at version 0) must still upload.
    const version=Object.entries(geometry.attributes).filter(([n])=>['position','normal','uv','color'].includes(n)).map(([n,a])=>`${n}:${a.id}:${a.version}`).join(':')
    if(record.geometry===geometry&&record.version===version)return
    record.geometry=geometry;record.version=version
    record.instanceBoundsDirty=true
    for(const [name,kind]of [['position',VertexBuffer.PositionKind],['normal',VertexBuffer.NormalKind],['uv',VertexBuffer.UVKind]]as const){const a=geometry.attributes[name];if(a)record.mesh.setVerticesData(kind,new Float32Array(a.array),true,a.itemSize)}
    const colors=geometry.attributes.color
    if(colors){const data=new Float32Array(colors.count*4);for(let i=0;i<colors.count;i++)linearTint(data,i*4,colors.getX(i),colors.getY(i),colors.getZ(i));record.mesh.setVerticesData(VertexBuffer.ColorKind,data,true,4)}
    const sourceMaterial=Array.isArray(source.material)?source.material[0]:source.material
    if(sourceMaterial.name==='interior-window'&&!(source instanceof D.InstancedMesh)){const room=sourceMaterial.uniforms.roomDataUniform.value as D.Vector4,rooms=new Float32Array(geometry.attributes.position.count*4);for(let i=0;i<geometry.attributes.position.count;i++)rooms.set([room.x,room.y,room.z,room.w],i*4);record.mesh.setVerticesData('roomData',rooms,false,4)}
    const position=geometry.attributes.position
    record.mesh.setIndices(geometry.index?Array.from(geometry.index.array):Array.from({length:position.count},(_,i)=>i))
  }
  private updateInstances(record:DrawRecord,source:D.InstancedMesh){
    const metadata=source.geometry.attributes,material=Array.isArray(source.material)?source.material[0]:source.material
    const focus=material.uniforms.buildingFocus?.value as D.Vector2|undefined
    const colors=metadata.buildingColor||source.instanceColor
    const detailFade=Math.max(0,Math.min(1,material.uniforms.buildingDetailFade?.value??1)),detailed=detailFade===0?0:detailFade===1?1:2
    const roomData=metadata.roomData
    const version=`${source.count}:${source.instanceMatrix.id}:${source.instanceMatrix.version}:${colors?.id}:${colors?.version}:${roomData?.id}:${roomData?.version}:${metadata.buildingOrigin?.id}:${metadata.buildingOrigin?.version}:${metadata.buildingLod?.id}:${metadata.buildingLod?.version}:${focus?`${Math.round(focus.x/8)}:${Math.round(focus.y/8)}:${detailed}`:''}`
    if(version===record.instanceVersion&&!record.instanceBoundsDirty){if(record.instanceCount===0)record.mesh.setEnabled(false);return}
    record.instanceVersion=version
    let selected:number[]|undefined
    if(focus&&metadata.buildingOrigin){
      const sectorVersion=`${source.count}:${metadata.buildingOrigin.id}:${metadata.buildingOrigin.version}`
      if(record.sectorVersion!==sectorVersion){const sectors=new Map<string,number[]>(),origins=metadata.buildingOrigin;for(let i=0;i<source.count;i++){const key=`${Math.floor(origins.getX(i)/200)}:${Math.floor(origins.getY(i)/200)}`,entries=sectors.get(key)||[];entries.push(i);sectors.set(key,entries)}record.sectors=sectors;record.sectorVersion=sectorVersion}
      selected=[];const x=Math.floor(focus.x/200),y=Math.floor(focus.y/200),origin=metadata.buildingOrigin,lod=metadata.buildingLod
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const index of record.sectors!.get(`${x+dx}:${y+dy}`)||[]){const detail=lod?.getX(index)||0;if(detail>.5&&detailed===0||detail<-.5&&detailed===1)continue;if(Math.hypot(origin.getX(index)-focus.x,origin.getY(index)-focus.y)<220)selected.push(index)}
    }
    const count=selected?.length??source.count,countChanged=record.instanceCount!==count;record.instanceCount=count
    if(count===0){record.mesh.thinInstanceCount=0;record.mesh.setEnabled(false);return}
    record.instanceBuffers??=new Map()
    // Keep dynamic GPU buffers. Replacing one with thinInstanceSetBuffer disposes
    // it and also performs an automatic bounds pass, even for color-only changes.
    const upload=(kind:string,stride:number,value:(index:number,component:number)=>number)=>{
      let buffer=record.instanceBuffers!.get(kind)
      const resized=!buffer||buffer.length<count*stride
      if(resized){buffer=new Float32Array(Math.max(count,buffer?buffer.length/stride*2:0)*stride);record.instanceBuffers!.set(kind,buffer)}
      let changed=resized
      for(let i=0;i<count;i++)for(let component=0;component<stride;component++){
        const offset=i*stride+component,next=Math.fround(value(selected?.[i]??i,component))
        if(buffer![offset]!==next){buffer![offset]=next;changed=true}
      }
      if(resized){const previous=record.mesh.doNotSyncBoundingInfo;record.mesh.doNotSyncBoundingInfo=true;record.mesh.thinInstanceSetBuffer(kind,buffer!,stride,false);record.mesh.doNotSyncBoundingInfo=previous}
      else if(changed)record.mesh.thinInstanceBufferUpdated(kind)
      return changed
    }
    const moved=upload('matrix',16,(index,component)=>source.instanceMatrix.array[index*16+component])
    if(colors)upload('color',4,(index,component)=>component===3?1:srgbChannelToLinear(colors.array[index*colors.itemSize+component]))
    else if(record.instanceBuffers.delete('color'))record.mesh.thinInstanceSetBuffer('color',null,4)
    if(roomData)upload('roomData',4,(index,component)=>roomData.array[index*4+component])
    else if(record.instanceBuffers.delete('roomData'))record.mesh.thinInstanceSetBuffer('roomData',null,4)
    if(metadata.buildingLod)upload('buildingLod',1,index=>metadata.buildingLod.getX(index))
    else if(record.instanceBuffers.delete('buildingLod'))record.mesh.thinInstanceSetBuffer('buildingLod',null,1)
    record.mesh.thinInstanceCount=count
    if(moved||countChanged||record.instanceBoundsDirty)record.mesh.thinInstanceRefreshBoundingInfo(!!record.instanceBoundsDirty)
    record.instanceBoundsDirty=false
  }
  private syncDraw(object:D.Mesh,root:D.Scene,visible:boolean,live:Set<number>,low=false){
    const key=low?-object.id:object.id,lod=object.userData.modelLod as ModelLodState|undefined
    const range:LodDitherRange=lod?lodDitherRange(lod.detail,!low):[0,1]
    let record=this.draws.get(key)
    // Defer low geometry until its first use. Keep it for later transitions.
    if(low&&!record&&(!visible||range[0]===range[1]))return
    live.add(key)
    if(!record){const mesh=new Mesh(`${object.name||`model-${object.id}`}${low?'-lod1':''}`,this.scene);mesh.sideOrientation=Material.CounterClockWiseSideOrientation;mesh.alwaysSelectAsActiveMesh=!object.frustumCulled;record={mesh,geometry:low?object.userData.createLodGeometry():object.geometry,version:'',instanceVersion:'',castShadow:false,ownedGeometry:low};this.draws.set(key,record)}
    const vehicleDamage=damageState(object),enabled=visible&&range[0]<range[1]&&(!(object instanceof D.InstancedMesh)||object.count>0)&&(vehicleDamage?.destruction??0)<1
    record.mesh.setEnabled(enabled)
    if(!enabled)return
    this.updateGeometry(record,object,low?record.geometry:object.geometry)
    const source=Array.isArray(object.material)?object.material[0]:object.material
    const material=this.damagedMaterial(this.getMaterial(source),hasDestroyedAppearance(object))
    record.mesh.material=material
    const collider=colliderState(object)
    record.mesh.metadata={...record.mesh.metadata,gridVehicleDamage:vehicleDamage,gridVehicleCollider:collider,gridLodRange:range,gridLodDetail:source.uniforms.buildingDetailFade?.value??1}
    record.mesh.isPickable=!low&&(!collider||collider.enabled)&&(vehicleDamage?.destruction??0)<1
    record.mesh.receiveShadows=!object.userData.vehicleEffect&&(root.profile==='studio'?object.receiveShadow:true)
    this.updateWorld(record,object)
    if(object instanceof D.InstancedMesh)this.updateInstances(record,object)
    if(lod||object.geometry.attributes.buildingLod)ensureLodDither(material)
    const wantsCaster=!object.userData.vehicleEffect&&!object.userData.disableShadow&&(root.profile==='studio'?object.castShadow:true)
    if(wantsCaster!==record.castShadow){record.castShadow=wantsCaster;if(this.shadows){if(wantsCaster&&!this.casters.has(key)){this.shadows.addShadowCaster(record.mesh);this.casters.add(key)}else if(!wantsCaster&&this.casters.has(key)){this.shadows.removeShadowCaster(record.mesh);this.casters.delete(key)}}}
  }
  private syncNative(source:D.Object3D){
    let record=this.native.get(source.id)
    if(!record){record={pivot:new TransformNode(`asset-${source.id}`,this.scene),source};this.native.set(source.id,record);const url=source.userData.nativeAssetURL as string;let asset=this.assets.get(url);if(!asset){asset=LoadAssetContainerAsync(url,this.scene);this.assets.set(url,asset)}const current=record
      asset.then(container=>{if(this.disposed||!this.native.has(source.id))return;const entries=container.instantiateModelsToScene(name=>name,true,{doNotInstantiate:true});current.entries=entries;for(const root of entries.rootNodes)root.parent=current.pivot
        if(source.userData.nativeNodeName){const selected=entries.rootNodes.flatMap(root=>[root,...root.getDescendants(false)]).find(node=>node.name===source.userData.nativeNodeName);if(selected instanceof TransformNode){selected.position.set(0,0,0);selected.rotationQuaternion=Quaternion.Identity();selected.scaling.set(1,1,1)}}
        const nodes=entries.rootNodes.flatMap(root=>[root,...root.getDescendants(false)])
        source.traverse(node=>{const native=nodes.find(value=>value.name===node.name);if(native instanceof TransformNode)this.nativeNodes.set(node.id,native)})
        for(const node of nodes)if(node instanceof Mesh){node.receiveShadows=true;this.shadows?.addShadowCaster(node);if(node.material instanceof PBRMaterial){node.material.maxSimultaneousLights=4;if(this.profile==='studio')node.material.roughness=Math.min(node.material.roughness??1,.58);if(!node.material.getActiveTextures().length){for(const kind of [VertexBuffer.UVKind,VertexBuffer.UV2Kind,VertexBuffer.UV3Kind,VertexBuffer.UV4Kind,VertexBuffer.UV5Kind,VertexBuffer.UV6Kind])node.removeVerticesData(kind);if(/\/(tank|troop_transport|apc|vtol_cargo|vtol_attack|cas|fighter)\.glb(?:[?#]|$)/.test(url)){node.material.backFaceCulling=true;node.material.twoSidedLighting=false}}}if(source.userData.teamColor&&node.material instanceof PBRMaterial&&node.material.name.includes('Team marking'))node.material.albedoColor=Color3.FromHexString(source.userData.teamColor).toLinearSpace()}
      }).catch(error=>console.warn('Model asset failed to load',url,error))
    }
    const parent=source.parent?this.nativeNodes.get(source.parent.id):undefined
    if(parent){record.pivot.parent=parent;record.pivot.position.copyFromFloats(source.position.x,source.position.y,source.position.z);record.pivot.rotationQuaternion=new Quaternion(source.quaternion.x,source.quaternion.y,source.quaternion.z,source.quaternion.w);record.pivot.scaling.copyFromFloats(source.scale.x,source.scale.y,source.scale.z)}else record.pivot.freezeWorldMatrix(Matrix.FromArray(source.matrixWorld.elements))
    record.pivot.setEnabled(source.visible)
    if(record.entries){
      const destroyed=hasDestroyedAppearance(source)
      if(record.destroyed!==destroyed){
      for(const root of record.entries.rootNodes)for(const node of [root,...root.getDescendants(false)])if(node instanceof Mesh&&node.material instanceof PBRMaterial){
        let original=this.nativeOriginalMaterials.get(node)
        if(!original){original=node.material;this.nativeOriginalMaterials.set(node,original)}
        node.material=this.damagedMaterial(original,destroyed)
      }
      record.destroyed=destroyed
      }
      const state=damageState(source)
      for(const root of record.entries.rootNodes)for(const node of [root,...root.getDescendants(false)])if(node instanceof Mesh)node.metadata={...node.metadata,gridVehicleDamage:state}
      const filter=source.userData.nativeNodeName as string|undefined
      if(filter)for(const root of record.entries.rootNodes)for(const node of root.getDescendants(false)){if(node instanceof TransformNode&&node.name.startsWith('Weapon_'))node.setEnabled(node.name===filter)}
      source.traverse(node=>{if(node.name.startsWith('Gear_')||node.name.startsWith('Weapon_'))this.nativeNodes.get(node.id)?.setEnabled(node.visible)})
      const actions=(source.userData.animationState||[])as{name:string;time:number;weight:number;clip:D.AnimationClip}[]
      for(const action of actions)if(action.name.startsWith('__')&&!record.entries.animationGroups.some(group=>group.name===action.name)){
        const group=new AnimationGroup(action.name,this.scene);group.isAdditive=action.clip.additive
        for(const track of action.clip.tracks){const dot=track.name.lastIndexOf('.'),nodeName=track.name.slice(0,dot),property=track.name.slice(dot+1),sourceNode=source.getObjectByName(nodeName),target=sourceNode?this.nativeNodes.get(sourceNode.id):undefined;if(!target)continue
          const quaternion=property==='quaternion',animation=new Animation(track.name,quaternion?'rotationQuaternion':property,30,quaternion?Animation.ANIMATIONTYPE_QUATERNION:Animation.ANIMATIONTYPE_VECTOR3,Animation.ANIMATIONLOOPMODE_CYCLE),size=quaternion?4:3
          animation.setKeys(track.times.map((time,index)=>({frame:time*30,value:quaternion?new Quaternion(...track.values.slice(index*size,index*size+size) as [number,number,number,number]):new Vector3(...track.values.slice(index*size,index*size+size) as [number,number,number])})));group.addTargetedAnimation(animation,target)
        }
        record.entries.animationGroups.push(group)
      }
      for(const group of record.entries.animationGroups){const action=actions.find(value=>value.name.toLowerCase()===group.name.toLowerCase());if(action){if(!group.isStarted){group.start(true);group.pause()}const fps=group.targetedAnimations[0]?.animation.framePerSecond||30;group.setWeightForAllAnimatables(action.weight);group.goToFrame(action.time*fps)}else if(group.isStarted)group.stop()}
    }
  }
  sync(root:D.Scene){
    if(this.disposed)return
    this.profile=root.profile
    this.refreshedMaterials.clear()
    root.updateMatrixWorld(true)
    const now=performance.now()
    const live=new Set<number>(),nativeLive=new Set<number>(),lightLive=new Set<number>()
    root.traverse(object=>{if(object instanceof D.HemisphereLight||object instanceof D.DirectionalLight||object instanceof D.PointLight)lightLive.add(object.id)})
    for(const[id,light]of this.lights)if(!lightLive.has(id)){if(light instanceof PointLight&&this.clustered.isSupported)this.clustered.removeLight(light);if(light===this.sun){this.shadows?.dispose();this.shadows=null;this.sun=null}light.dispose();this.lights.delete(id)}
    const visit=(object:D.Object3D,parentVisible:boolean)=>{
      const visible=parentVisible&&object.visible
      const modelLod=object.userData.modelLodRoot as ModelLodState|undefined
      if(modelLod){
        const world=object.matrixWorld.elements,distance=Math.max(.1,Math.hypot(world[12]-this.camera.position.x,world[13]-this.camera.position.y,world[14]-this.camera.position.z))
        const scale=Math.max(Math.hypot(world[0],world[1],world[2]),Math.hypot(world[4],world[5],world[6]),Math.hypot(world[8],world[9],world[10]))
        const pixels=modelLod.span*scale*this.engine.getRenderHeight()/(2*Math.tan(this.camera.fov/2)*distance)
        modelLod.detail=modelLod.transition.update(pixels,96,8,now)
      }
      if(object.userData.nativeAssetURL){nativeLive.add(object.id);this.syncNative(object);this.native.get(object.id)!.pivot.setEnabled(visible)}
      if(object instanceof D.Mesh&&object.geometry.attributes.position?.count){this.syncDraw(object,root,visible,live);if(object.userData.createLodGeometry)this.syncDraw(object,root,visible,live,true)}
      if(object instanceof D.HemisphereLight||object instanceof D.DirectionalLight||object instanceof D.PointLight){let light=this.lights.get(object.id);if(!light){if(object instanceof D.HemisphereLight)light=new HemisphericLight(object.name,new Vector3(0,0,1),this.scene);else if(object instanceof D.PointLight){light=new PointLight(object.name,Vector3.Zero(),this.scene);if(this.clustered.isSupported)this.clustered.addLight(light)}else{light=new DirectionalLight(object.name,new Vector3(.5,-.3,-1),this.scene)
        // The shadow owner is chosen explicitly by castShadow, never by traversal order,
        // so fill/rim (or any other non-shadow-owning directional) never displaces the key/sun.
        if(!this.sun&&object.castShadow&&CascadedShadowGenerator.IsSupported){this.sun=light;const studio=root.profile==='studio'
          this.shadows=new CascadedShadowGenerator(1024,light,true,this.camera);this.shadows.numCascades=studio?1:3;this.shadows.stabilizeCascades=!studio;this.shadows.lambda=.7;this.shadows.usePercentageCloserFiltering=true;this.shadows.bias=studio?.0005:.0002
          // Scale the normal offset with each cascade to prevent surface stripes.
          configureShadowNormalBias(this.shadows)
          if(!studio)this.shadows.shadowMaxZ=8000
          for(const[id,record]of this.draws)if(record.castShadow){this.shadows.addShadowCaster(record.mesh);this.casters.add(id)}
        }}this.lights.set(object.id,light)}light.intensity=visible?object.intensity:0;light.diffuse=color(object.color);if(light instanceof HemisphericLight&&object instanceof D.HemisphereLight)light.groundColor=color(object.groundColor);if(light instanceof PointLight&&object instanceof D.PointLight){light.position.copyFromFloats(object.position.x,object.position.y,object.position.z);light.range=object.distance||50}if(light instanceof DirectionalLight&&object instanceof D.DirectionalLight){
        light.position.copyFromFloats(object.position.x,object.position.y,object.position.z)
        // Aim at the target's actual world position (parented or detached-at-origin) instead
        // of assuming every sun points at the world origin from its own position.
        const targetWorld=object.target.getWorldPosition(new D.Vector3()),dx=targetWorld.x-object.position.x,dy=targetWorld.y-object.position.y,dz=targetWorld.z-object.position.z,len=Math.hypot(dx,dy,dz)
        if(len>1e-6)light.direction.copyFromFloats(dx/len,dy/len,dz/len)
      }}
      for(const child of object.children)visit(child,visible)
    }
    visit(root,true)
    for(const[id,record]of this.draws)if(!live.has(id)){record.mesh.dispose();if(record.ownedGeometry)record.geometry.dispose();this.draws.delete(id);this.casters.delete(id)}
    for(const[id,record]of this.native)if(!nativeLive.has(id)){record.source.traverse(node=>this.nativeNodes.delete(node.id));if(record.entries)for(const root of record.entries.rootNodes)for(const node of [root,...root.getDescendants(false)])if(node instanceof Mesh){const original=this.nativeOriginalMaterials.get(node);if(original){this.destroyedMaterials.get(original)?.dispose();this.destroyedMaterials.delete(original);this.nativeOriginalMaterials.delete(node)}}record.entries?.dispose();record.pivot.dispose();this.native.delete(id)}
    for(const[source,material]of this.materials)if(source.disposed){this.destroyedMaterials.get(material)?.dispose();this.destroyedMaterials.delete(material);material.dispose();this.materials.delete(source)}
    if(root.profile==='studio'&&this.shadows)fitStudioShadowDepth(this.shadows,this.camera)
    if(root.background){const background=color(root.background);this.scene.clearColor=new Color4(background.r,background.g,background.b,1)}
  }
  render(){if(this.disposed)return;this.engine.beginFrame();try{this.scene.render()}finally{this.engine.endFrame()}}
  dispose(){if(this.disposed)return;this.disposed=true;this.effects.dispose();this.scene.dispose();this.engine.dispose();for(const record of this.draws.values())if(record.ownedGeometry)record.geometry.dispose();this.draws.clear();this.materials.clear();this.refreshedMaterials.clear();this.textures.clear();this.destroyedMaterials.clear();this.nativeOriginalMaterials.clear();this.native.clear();this.nativeNodes.clear();this.casters.clear()}
}

