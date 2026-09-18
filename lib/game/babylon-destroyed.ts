import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import type { Object3D } from './scene-data'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { Scene } from '@babylonjs/core/scene'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import { assetPath } from '../asset-path'

const masks = new WeakMap<Scene, Texture>()
export const DESTROYED_MASK_PATH = '/textures/vehicle_destroyed_mask.png'
function sharedMask(scene: Scene) {
  let mask = masks.get(scene)
  if (!mask) {
    mask = new Texture(assetPath(DESTROYED_MASK_PATH), scene, false, false)
    mask.gammaSpace = false
    mask.wrapU = mask.wrapV = Texture.WRAP_ADDRESSMODE
    masks.set(scene, mask)
  }
  return mask
}

/** A root flag makes damage local to a vehicle, including attached stores. */
export function hasDestroyedAppearance(object: Object3D): boolean {
  if (object.userData.vehicleEffect || object.name.startsWith('vehicle-fx-')) return false
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node.userData.destroyed !== undefined) return !!node.userData.destroyed
  }
  return false
}

/** Triplanar scorch texture: needs no UVs or vehicle-specific authoring.
 * It uses mesh-local positions so its soot does not swim when the vehicle moves.
 * Color modulation keeps the original paint, panel lines and markings underneath.
 */
export class DestroyedVehiclePlugin extends MaterialPluginBase {
  private readonly mask: Texture
  constructor(material: PBRMaterial) { super(material, 'GridDestroyedVehicle', 210, {}, true, true); this.mask = sharedMask(material.getScene()) }
  isCompatible(_language: ShaderLanguage) { return true }
  isReadyForSubMesh() { return this.mask.isReadyOrNotBlocking() }
  getSamplers(samplers: string[]) { samplers.push('gridDamageSampler') }
  bindForSubMesh(buffer: UniformBuffer) { buffer.setTexture('gridDamageSampler', this.mask) }
  getCustomCode(shaderType: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
    const gpu = language === ShaderLanguage.WGSL
    if (shaderType === 'vertex') return gpu ? {
      CUSTOM_VERTEX_DEFINITIONS: 'varying gridDamagePosition: vec3f;',
      CUSTOM_VERTEX_MAIN_END: 'vertexOutputs.gridDamagePosition=positionUpdated;',
    } : {
      CUSTOM_VERTEX_DEFINITIONS: 'varying vec3 gridDamagePosition;',
      CUSTOM_VERTEX_MAIN_END: 'gridDamagePosition=positionUpdated;',
    }
    if (shaderType !== 'fragment') return null
    const definitions = gpu ? `varying gridDamagePosition: vec3f;
var gridDamageSamplerSampler: sampler; var gridDamageSampler: texture_2d<f32>;
fn gridCharHash(p:vec3f)->f32 {return fract(sin(dot(p,vec3f(127.1,311.7,74.7)))*43758.5453);}
fn gridCharNoise(p:vec3f)->f32 {let i=floor(p);let f=fract(p);let u=f*f*(vec3f(3.)-2.*f);return mix(mix(mix(gridCharHash(i),gridCharHash(i+vec3f(1,0,0)),u.x),mix(gridCharHash(i+vec3f(0,1,0)),gridCharHash(i+vec3f(1,1,0)),u.x),u.y),mix(mix(gridCharHash(i+vec3f(0,0,1)),gridCharHash(i+vec3f(1,0,1)),u.x),mix(gridCharHash(i+vec3f(0,1,1)),gridCharHash(i+vec3f(1,1,1)),u.x),u.y),u.z);}` : `varying vec3 gridDamagePosition; uniform sampler2D gridDamageSampler;
float gridCharHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float gridCharNoise(vec3 p){vec3 i=floor(p),f=fract(p),u=f*f*(vec3(3.)-2.*f);return mix(mix(mix(gridCharHash(i),gridCharHash(i+vec3(1,0,0)),u.x),mix(gridCharHash(i+vec3(0,1,0)),gridCharHash(i+vec3(1,1,0)),u.x),u.y),mix(mix(gridCharHash(i+vec3(0,0,1)),gridCharHash(i+vec3(1,0,1)),u.x),mix(gridCharHash(i+vec3(0,1,1)),gridCharHash(i+vec3(1,1,1)),u.x),u.y),u.z);}`
    const sample = (uv: string) => gpu ? `textureSample(gridDamageSampler,gridDamageSamplerSampler,${uv}).r` : `texture2D(gridDamageSampler,${uv}).r`
    const body = `vec3 gridP=gridDamagePosition;
vec3 gridWeights=max(abs(normalize(cross(dFdx(gridP),dFdy(gridP)))),vec3(.001));
gridWeights/=gridWeights.x+gridWeights.y+gridWeights.z;
float gridMask=${sample('gridP.yz*.23')}*gridWeights.x+${sample('gridP.xz*.23')}*gridWeights.y+${sample('gridP.xy*.23')}*gridWeights.z;
float gridSoot=smoothstep(.08,.65,gridMask*2.4);
float gridAsh=smoothstep(.57,.82,gridCharNoise(gridP*7.3));
float gridPits=smoothstep(.69,.86,gridCharNoise(gridP*37.));
float gridLuma=dot(surfaceAlbedo,vec3(.2126,.7152,.0722));
vec3 gridPaint=mix(surfaceAlbedo,vec3(gridLuma),.82);
surfaceAlbedo=mix(gridPaint*.48,vec3(.0025,.002,.0018),gridSoot*.96);
surfaceAlbedo=mix(surfaceAlbedo,vec3(.045,.022,.009),gridAsh*.25);
surfaceAlbedo*=1.-gridPits*.55;`
    const code = gpu ? body.replace(/vec3 /g,'var ').replace(/float /g,'let ').replace(/vec3\(/g,'vec3f(').replace('=gridDamagePosition','=fragmentInputs.gridDamagePosition').replaceAll('dFdx(', 'dpdx(').replaceAll('dFdy(', 'dpdy(') : body
    return { CUSTOM_FRAGMENT_DEFINITIONS: definitions, CUSTOM_FRAGMENT_BEFORE_LIGHTS: code }
  }
}

export function createDestroyedMaterial(source: PBRMaterial): PBRMaterial {
  const material = source.clone(`${source.name}-destroyed`)
  // Babylon clones texture wrappers by default. Variants share the original maps;
  // only the material and its damage plugin belong to the destroyed appearance.
  for (const key of ['albedoTexture', 'ambientTexture', 'opacityTexture', 'reflectionTexture', 'refractionTexture', 'reflectivityTexture', 'metallicTexture', 'bumpTexture', 'lightmapTexture', 'emissiveTexture'] as const) {
    if (material[key] && material[key] !== source[key]) material[key]!.dispose()
    material[key] = source[key]
  }
  material.roughness = .98
  material.metallic = .03
  material.emissiveColor.set(0, 0, 0)
  material.emissiveTexture = null
  new DestroyedVehiclePlugin(material)
  return material
}
