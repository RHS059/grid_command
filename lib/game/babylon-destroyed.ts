import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { ShadowDepthWrapper } from '@babylonjs/core/Materials/shadowDepthWrapper'
import '@babylonjs/core/ShadersWGSL/ShadersInclude/shadowMapFragmentExtraDeclaration'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine'
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { Object3D } from './scene-data'
import { assetPath } from '../asset-path'
import { InteriorRoomPlugin } from './babylon-interior'

export const DESTROYED_MASK_PATH = '/textures/vehicle_destroyed_mask.png'
export const FURY_PBR_MAPS = { normal: '/models/fighter_normal.png', orm: '/models/fighter_orm.png' } as const

/** Destruction controls cutouts, independently of the base scorched paint. */
export interface VehicleDamageState {
  /** Strength of the scorched base layer, independent of structural cutouts. */
  damage?: number
  destruction: number
  heat?: number
  seed?: number
  /** Holes per local model unit. */
  holeScale?: number
  /** Apparent skin thickness in local model units; zero disables parallax. */
  holeDepth?: number
}
export const DEFAULT_VEHICLE_DAMAGE: Readonly<Required<VehicleDamageState>> = Object.freeze({ damage: 1, destruction: 0, heat: .7, seed: 0, holeScale: .82, holeDepth: .1 })
const textures = new WeakMap<Scene, Map<string, Texture>>()
const finite = (value: number | undefined, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

export function normalizeVehicleDamage(state: Partial<VehicleDamageState> = {}): Required<VehicleDamageState> {
  return {
    damage: clamp(finite(state.damage, DEFAULT_VEHICLE_DAMAGE.damage)),
    destruction: clamp(finite(state.destruction, 0)),
    heat: clamp(finite(state.heat, DEFAULT_VEHICLE_DAMAGE.heat)),
    seed: clamp(finite(state.seed, 0), -10000, 10000),
    holeScale: clamp(finite(state.holeScale, DEFAULT_VEHICLE_DAMAGE.holeScale), .01, 100),
    holeDepth: clamp(finite(state.holeDepth, DEFAULT_VEHICLE_DAMAGE.holeDepth), 0, 2),
  }
}

function sharedTexture(scene: Scene, path: string) {
  let cache = textures.get(scene)
  if (!cache) { cache = new Map(); textures.set(scene, cache) }
  let texture = cache.get(path)
  if (!texture) {
    texture = new Texture(assetPath(path), scene, false, false)
    texture.gammaSpace = false
    texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE
    cache.set(path, texture)
  }
  return texture
}

/** UV-authored maps for ordinary vehicle PBR materials, shared within a scene.
 * ORM uses R=occlusion, G=roughness, B=metalness, following the glTF convention.
 * Apply to the authored painted shell, not glass, lights, or engine effects.
 */
export function applyVehiclePbrMaps(material: PBRMaterial, maps: { normal?: string | Texture; orm?: string | Texture }) {
  const resolve = (map: string | Texture) => typeof map === 'string' ? sharedTexture(material.getScene(), map) : map
  if (maps.normal) {
    material.bumpTexture = resolve(maps.normal)
    material.bumpTexture.gammaSpace = false
    // Match Babylon's glTF normal-map convention after its vertical UV flip.
    material.invertNormalMapX = !material.getScene().useRightHandedSystem
    material.invertNormalMapY = material.getScene().useRightHandedSystem
  }
  if (maps.orm) {
    material.metallicTexture = resolve(maps.orm)
    material.metallicTexture.gammaSpace = false
    material.useRoughnessFromMetallicTextureAlpha = false
    material.useRoughnessFromMetallicTextureGreen = true
    material.useMetallnessFromMetallicTextureBlue = true
    material.useAmbientOcclusionFromMetallicTextureRed = true
    // Map values are absolute; a previous scalar metalness of zero disables them.
    material.metallic = material.roughness = 1
  }
}

/** A root flag makes damage local to a vehicle, including attached stores. */
export function hasDestroyedAppearance(object: Object3D): boolean {
  if (object.userData.vehicleEffect || object.name.startsWith('vehicle-fx-')) return false
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node.userData.destroyed !== undefined) return !!node.userData.destroyed
  }
  return false
}

/** Fixed-cost triplanar scorch and a continuous, object-local destruction field.
 * A second field sample offsets into the skin along the view ray: an intact rear
 * lip shades as a dark cavity; open front + rear samples discard the pixel.
 * This visual shell approximation does not generate geometry or collision.
 */
export class DestroyedVehiclePlugin extends MaterialPluginBase {
  private readonly mask: Texture
  private state = normalizeVehicleDamage()
  constructor(material: PBRMaterial) {
    // Register extra events BEFORE activation. Hard binding runs per draw even
    // when consecutive vehicles share the exact same cached damage material.
    super(material, 'GridDestroyedVehicle', 210, {}, true, false, true)
    this.registerForExtraEvents = true
    this.doNotSerialize = true
    this.mask = sharedTexture(material.getScene(), DESTROYED_MASK_PATH)
    this._enable(true)
  }
  setDamage(state: Partial<VehicleDamageState>) { this.state = normalizeVehicleDamage(state) }
  isCompatible(_language: ShaderLanguage) { return true }
  isReadyForSubMesh() { return this.mask.isReadyOrNotBlocking() }
  getSamplers(samplers: string[]) { samplers.push('gridDamageSampler') }
  getActiveTextures(active: BaseTexture[]) { active.push(this.mask) }
  hasTexture(texture: BaseTexture) { return texture === this.mask }
  getUniforms(language = ShaderLanguage.GLSL) {
    return {
      ubo: [{ name: 'gridDamage', size: 4, type: 'vec4' }, { name: 'gridDamageStyle', size: 4, type: 'vec4' }],
      fragment: language === ShaderLanguage.GLSL ? '#ifndef UNIFORMBUFFERS\nuniform vec4 gridDamage;\nuniform vec4 gridDamageStyle;\n#endif' : '',
    }
  }
  bindForSubMesh(buffer: UniformBuffer) { buffer.setTexture('gridDamageSampler', this.mask) }
  hardBindForSubMesh(buffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, subMesh: SubMesh) {
    const state = subMesh.getRenderingMesh().metadata?.gridVehicleDamage as Partial<VehicleDamageState> | undefined
    const fallback = this.state
    buffer.updateFloat4('gridDamage',
      clamp(finite(state?.destruction, fallback.destruction)),
      clamp(finite(state?.heat, fallback.heat)),
      clamp(finite(state?.seed, fallback.seed), -10000, 10000),
      clamp(finite(state?.holeScale, fallback.holeScale), .01, 100))
    buffer.updateFloat4('gridDamageStyle',
      clamp(finite(state?.holeDepth, fallback.holeDepth), 0, 2),
      clamp(finite(state?.damage, fallback.damage)), 0, 0)
  }
  dispose() { this._material.shadowDepthWrapper?.dispose() }
  getCustomCode(shaderType: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
    const gpu = language === ShaderLanguage.WGSL
    if (shaderType === 'vertex') {
      return gpu ? {
        CUSTOM_VERTEX_DEFINITIONS: 'varying gridDamagePosition: vec3f;',
        CUSTOM_VERTEX_MAIN_END: 'vertexOutputs.gridDamagePosition=positionUpdated;',
      } : {
        CUSTOM_VERTEX_DEFINITIONS: 'varying vec3 gridDamagePosition;',
        CUSTOM_VERTEX_MAIN_END: 'gridDamagePosition=positionUpdated;',
      }
    }
    if (shaderType !== 'fragment') return null
    // Babylon 9.25's wrapper only injects fragment declarations into GLSL main.
    // Supply its WGSL declarations conditionally for the shadow specialization.
    const definitions = gpu ? `#if defined(SM_FLOAT) && !defined(GRID_SHADOW_FRAGMENT_DECLARED)
#define GRID_SHADOW_FRAGMENT_DECLARED
#include<shadowMapFragmentExtraDeclaration>
#endif
varying gridDamagePosition: vec3f;
var gridDamageSamplerSampler: sampler; var gridDamageSampler: texture_2d<f32>;
fn gridCharHash(p:vec3f)->f32 {return fract(sin(dot(p,vec3f(127.1,311.7,74.7)))*43758.5453);}
fn gridCharNoise(p:vec3f)->f32 {let i=floor(p);let f=fract(p);let u=f*f*(vec3f(3.)-2.*f);return mix(mix(mix(gridCharHash(i),gridCharHash(i+vec3f(1,0,0)),u.x),mix(gridCharHash(i+vec3f(0,1,0)),gridCharHash(i+vec3f(1,1,0)),u.x),u.y),mix(mix(gridCharHash(i+vec3f(0,0,1)),gridCharHash(i+vec3f(1,0,1)),u.x),mix(gridCharHash(i+vec3f(0,1,1)),gridCharHash(i+vec3f(1,1,1)),u.x),u.y),u.z);}` : `varying vec3 gridDamagePosition; uniform sampler2D gridDamageSampler;
float gridCharHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float gridCharNoise(vec3 p){vec3 i=floor(p),f=fract(p),u=f*f*(vec3(3.)-2.*f);return mix(mix(mix(gridCharHash(i),gridCharHash(i+vec3(1,0,0)),u.x),mix(gridCharHash(i+vec3(0,1,0)),gridCharHash(i+vec3(1,1,0)),u.x),u.y),mix(mix(gridCharHash(i+vec3(0,0,1)),gridCharHash(i+vec3(1,0,1)),u.x),mix(gridCharHash(i+vec3(0,1,1)),gridCharHash(i+vec3(1,1,1)),u.x),u.y),u.z);}`
    const sample = (uv: string) => gpu ? `textureSample(gridDamageSampler,gridDamageSamplerSampler,${uv}).r` : `texture2D(gridDamageSampler,${uv}).r`
    const projection = (position: string) => `${sample(`${position}.yz*.23`)}*gridWeights.x+${sample(`${position}.xz*.23`)}*gridWeights.y+${sample(`${position}.xy*.23`)}*gridWeights.z`
    const worldPosition = gpu ? 'fragmentInputs.vPositionW' : 'vPositionW'
    const eyePosition = gpu ? 'scene.vEyePosition' : 'vEyePosition'
    // Texture and derivative work precedes discard: WGSL needs uniform control
    // flow for implicit texture derivatives. There are no view-dependent loops.
    const cutout = `vec3 gridP=gridDamagePosition;
vec3 gridNormal=normalize(cross(dFdx(gridP),dFdy(gridP)));
vec3 gridWeights=max(abs(gridNormal),vec3(.001));
gridWeights/=gridWeights.x+gridWeights.y+gridWeights.z;
float gridMask=${projection('gridP')};
vec3 gridLocalDx=normalize(dFdx(gridP));
vec3 gridLocalDy=normalize(dFdy(gridP));
#ifdef SM_FLOAT
vec3 gridEye=gridNormal;
#else
vec3 gridWorldDx=normalize(dFdx(${worldPosition}.xyz));
vec3 gridWorldDy=normalize(dFdy(${worldPosition}.xyz));
vec3 gridWorldNormal=normalize(cross(gridWorldDx,gridWorldDy));
vec3 gridWorldEye=normalize(${eyePosition}.xyz-${worldPosition}.xyz);
vec3 gridEye=normalize(gridLocalDx*dot(gridWorldEye,gridWorldDx)+gridLocalDy*dot(gridWorldEye,gridWorldDy)+gridNormal*dot(gridWorldEye,gridWorldNormal));
#endif
float gridFacing=dot(gridEye,gridNormal);
vec3 gridTangentEye=gridEye-gridNormal*gridFacing;
vec3 gridBackP=gridP-gridTangentEye*gridDamageStyle.x/max(abs(gridFacing),.25);
float gridBackMask=${projection('gridBackP')};
vec3 gridSeed=vec3(gridDamage.z*.719,gridDamage.z*.337,gridDamage.z*.913);
float gridField=.02+.96*clamp(mix(gridCharNoise(gridP*gridDamage.w+gridSeed),gridMask,.22),0.,1.);
float gridBackField=.02+.96*clamp(mix(gridCharNoise(gridBackP*gridDamage.w+gridSeed),gridBackMask,.22),0.,1.);
float gridCut=gridDamage.x;
float gridCavity=(1.-step(gridCut,gridField))*step(gridCut,gridBackField);
float gridBorder=1.-smoothstep(.0,.055,max(0.,gridField-gridCut));
float gridEmber=gridBorder*step(gridCut,gridField)*smoothstep(.0,.03,gridCut)*(1.-step(1.,gridCut))*gridDamage.y;
if(gridCut>=1. || (gridCut>0. && max(gridField,gridBackField)<gridCut)){discard;}`
    const shade = `vec3 gridUndamagedPaint=surfaceAlbedo;
float gridSoot=smoothstep(.08,.65,gridMask*2.4);
float gridLuma=dot(surfaceAlbedo,vec3(.2126,.7152,.0722));
vec3 gridPaint=mix(surfaceAlbedo,vec3(gridLuma),.82);
surfaceAlbedo=mix(gridPaint*.48,vec3(.0025,.002,.0018),gridSoot*.96);
surfaceAlbedo=mix(surfaceAlbedo,vec3(.045,.022,.009),smoothstep(.5,.8,gridMask)*.25);
surfaceAlbedo=mix(surfaceAlbedo,vec3(.008,.004,.002),gridCavity*.92);
surfaceAlbedo=mix(gridUndamagedPaint,surfaceAlbedo,gridDamageStyle.y);
float gridHotPatch=smoothstep(.32,.7,gridCharHash(floor(gridP*.85+gridSeed)));
vec3 gridEmberColor=mix(vec3(.65,.025,.001),vec3(1.,.24,.012),gridBorder*gridHotPatch)*gridEmber*gridHotPatch*gridDamageStyle.y*7.;`
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: definitions,
      CUSTOM_FRAGMENT_UPDATE_ALPHA: gpu ? toWGSL(cutout) : cutout,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: gpu ? toWGSL(shade) : shade,
      // HDR emissive output: the rim remains luminous without direct lighting.
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: 'finalEmissive+=gridEmberColor;',
    }
  }
}

function toWGSL(code: string) {
  return code.replace(/\b(?:vec3|float) /g, 'var ').replace(/\bvec3\(/g, 'vec3f(')
    .replace(/\bgridDamagePosition\b/g, 'fragmentInputs.gridDamagePosition')
    .replace(/\bgridDamageStyle\b/g, 'uniforms.gridDamageStyle')
    .replace(/\bgridDamage\b/g, 'uniforms.gridDamage')
    .replaceAll('dFdx(', 'dpdx(').replaceAll('dFdy(', 'dpdy(')
}

/** Material defaults; per-mesh metadata.gridVehicleDamage wins. */
export function setVehicleDamage(material: PBRMaterial, state: Partial<VehicleDamageState>) {
  const plugin = material.pluginManager?.getPlugin('GridDestroyedVehicle') as DestroyedVehiclePlugin | null
  plugin?.setDamage(state)
}

export function createDestroyedMaterial(source: PBRMaterial): PBRMaterial {
  const material = source.clone(`${source.name}-destroyed`)
  // Variants share original maps: only material and plugin belong to the wreck.
  for (const key of ['albedoTexture', 'ambientTexture', 'opacityTexture', 'reflectionTexture', 'refractionTexture', 'reflectivityTexture', 'metallicTexture', 'bumpTexture', 'lightmapTexture', 'emissiveTexture'] as const) {
    if (material[key] && material[key] !== source[key]) material[key]!.dispose()
    material[key] = source[key]
  }
  material.emissiveColor.set(0, 0, 0)
  material.emissiveTexture = null
  // Rebuild this plugin because it has no serialized constructor registration.
  if (source.pluginManager?.getPlugin('GridInteriorRooms')) new InteriorRoomPlugin(material)
  new DestroyedVehiclePlugin(material)
  // A standard shadow pass cannot see a material plugin's custom discard.
  material.shadowDepthWrapper = new ShadowDepthWrapper(material, material.getScene(), material.shaderLanguage === ShaderLanguage.WGSL ? { remappedVariables: ['vNormalW', 'vertexOutputs.vNormalW'] } : undefined)
  return material
}
