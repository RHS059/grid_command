import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import { ShadowDepthWrapper } from '@babylonjs/core/Materials/shadowDepthWrapper'
import '@babylonjs/core/ShadersWGSL/ShadersInclude/shadowMapFragmentExtraDeclaration'
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh'
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine'
import type { Scene } from '@babylonjs/core/scene'
import type { LodDitherRange } from './lod-transition'

/** Discard before depth output. Keep the material in its opaque render pass. */
export class LodDitherPlugin extends MaterialPluginBase {
  constructor(material: PBRMaterial) {
    super(material, 'GridLodDither', 180, { GRID_LOD_INSTANCES: false }, true, false, true)
    this.registerForExtraEvents = true
    this.doNotSerialize = true
    this._enable(true)
  }
  isCompatible(_language: ShaderLanguage) { return true }
  prepareDefines(defines: MaterialDefines, _scene: Scene, mesh: AbstractMesh) {
    ;(defines as MaterialDefines & { GRID_LOD_INSTANCES: boolean }).GRID_LOD_INSTANCES = mesh.isVerticesDataPresent('buildingLod')
  }
  getAttributes(attributes: string[], _scene: Scene, mesh: AbstractMesh) {
    if (mesh.isVerticesDataPresent('buildingLod')) attributes.push('buildingLod')
  }
  getUniforms(language = ShaderLanguage.GLSL) {
    return {
      ubo: [{ name: 'gridLodState', size: 4, type: 'vec4' }],
      fragment: language === ShaderLanguage.GLSL ? '#ifndef UNIFORMBUFFERS\nuniform vec4 gridLodState;\n#endif' : '',
    }
  }
  hardBindForSubMesh(buffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, subMesh: SubMesh) {
    const mesh = subMesh.getRenderingMesh(), range = mesh.metadata?.gridLodRange as LodDitherRange | undefined
    buffer.updateFloat4('gridLodState', range?.[0] ?? 0, range?.[1] ?? 1, mesh.metadata?.gridLodDetail ?? 1, 0)
  }
  getCustomCode(shaderType: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
    const gpu = language === ShaderLanguage.WGSL
    if (shaderType === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: gpu
        ? '#ifdef GRID_LOD_INSTANCES\nattribute buildingLod: f32; varying gridLodRole: f32;\n#endif'
        : '#ifdef GRID_LOD_INSTANCES\nattribute float buildingLod; varying float gridLodRole;\n#endif',
      CUSTOM_VERTEX_MAIN_END: gpu
        ? '#ifdef GRID_LOD_INSTANCES\nvertexOutputs.gridLodRole=vertexInputs.buildingLod;\n#endif'
        : '#ifdef GRID_LOD_INSTANCES\ngridLodRole=buildingLod;\n#endif',
    }
    if (shaderType !== 'fragment') return null
    // This arithmetic is the same 4 by 4 Bayer matrix on both backends.
    const definitions = gpu ? `#if defined(SM_FLOAT) && !defined(GRID_SHADOW_FRAGMENT_DECLARED)
#define GRID_SHADOW_FRAGMENT_DECLARED
#include<shadowMapFragmentExtraDeclaration>
#endif
#ifdef GRID_LOD_INSTANCES
varying gridLodRole: f32;
#endif
fn gridBayer2(p:vec2f)->f32 {return 2.*p.x+3.*p.y-4.*p.x*p.y;}
fn gridBayer4(pixel:vec2f)->f32 {
 let p=floor(pixel);let low=p-2.*floor(p/2.);let half=floor(p/2.);let high=half-2.*floor(half/2.);
 return (4.*gridBayer2(low)+gridBayer2(high)+.5)/16.;
}` : `#ifdef GRID_LOD_INSTANCES
varying float gridLodRole;
#endif
float gridBayer2(vec2 p){return 2.*p.x+3.*p.y-4.*p.x*p.y;}
float gridBayer4(vec2 pixel){vec2 p=floor(pixel),low=mod(p,2.),high=mod(floor(p/2.),2.);return (4.*gridBayer2(low)+gridBayer2(high)+.5)/16.;}`
    const range = gpu ? 'uniforms.gridLodState' : 'gridLodState', role = gpu ? 'fragmentInputs.gridLodRole' : 'gridLodRole'
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: definitions,
      CUSTOM_FRAGMENT_MAIN_BEGIN: `${gpu ? 'var' : 'vec2'} gridLodRange=${range}.xy;
#ifdef GRID_LOD_INSTANCES
if(${role}>.5){gridLodRange=${gpu ? 'vec2f' : 'vec2'}(0.,${range}.z);}
if(${role}<-.5){gridLodRange=${gpu ? 'vec2f' : 'vec2'}(${range}.z,1.);}
#endif
${gpu ? 'let' : 'float'} gridLodThreshold=gridBayer4(${gpu ? 'fragmentInputs.position' : 'gl_FragCoord'}.xy);
if(gridLodThreshold<gridLodRange.x||gridLodThreshold>=gridLodRange.y){discard;}`,
    }
  }
}

export function ensureLodDither(material: PBRMaterial) {
  if (!material.pluginManager?.getPlugin('GridLodDither')) new LodDitherPlugin(material)
  material.shadowDepthWrapper ??= new ShadowDepthWrapper(material, material.getScene(), material.shaderLanguage === ShaderLanguage.WGSL ? { remappedVariables: ['vNormalW', 'vertexOutputs.vNormalW'] } : undefined)
}
