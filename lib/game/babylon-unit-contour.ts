import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh'
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine'
import type { Scene } from '@babylonjs/core/scene'
import type { Object3D } from './scene-data'

export const UNIT_CONTOUR = Object.freeze({ strength: .025, power: 4 })

/** Factories opt in at the unit root; lights, exhaust and muzzle effects opt out. */
export function hasUnitSurface(object: Object3D) {
  let unit = false
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node.userData.vehicleEffect) return false
    if (node.userData.unitSurface) unit = true
  }
  return unit
}

/** A small neutral grazing reflection, evaluated inside the existing opaque draw. */
export class UnitContourPlugin extends MaterialPluginBase {
  constructor(material: PBRMaterial) {
    // Run after damage so glowing embers suppress this quiet surface reflection.
    super(material, 'GridUnitContour', 220, {}, true, false, true)
    this.registerForExtraEvents = true
    this.doNotSerialize = true
    this._enable(true)
  }
  isCompatible(_language: ShaderLanguage) { return true }
  getUniforms(language = ShaderLanguage.GLSL) {
    return {
      ubo: [{ name: 'gridUnitContour', size: 1, type: 'float' }],
      fragment: language === ShaderLanguage.GLSL ? '#ifndef UNIFORMBUFFERS\nuniform float gridUnitContour;\n#endif' : '',
    }
  }
  hardBindForSubMesh(buffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, subMesh: SubMesh) {
    // One cached material may also be used outside a unit. Never leak the effect.
    buffer.updateFloat('gridUnitContour', subMesh.getRenderingMesh().metadata?.gridUnitContour === true ? UNIT_CONTOUR.strength : 0)
  }
  getCustomCode(shaderType: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
    if (shaderType !== 'fragment') return null
    const gpu = language === ShaderLanguage.WGSL, scalar = gpu ? 'let' : 'float', vector = gpu ? 'vec3f' : 'vec3'
    return {
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `#if !defined(UNLIT) && !defined(SM_FLOAT)
${scalar} gridContourFacing=clamp(abs(dot(geometricNormalW,viewDirectionW)),0.,1.);
${scalar} gridContourEdge=pow(1.-gridContourFacing,${UNIT_CONTOUR.power.toFixed(1)});
${scalar} gridContourPaint=.4+.6*clamp(dot(surfaceAlbedo,${vector}(.2126,.7152,.0722)),0.,1.);
${scalar} gridContourEmission=1.-clamp(max(finalEmissive.r,max(finalEmissive.g,finalEmissive.b)),0.,1.);
finalAmbient+=${vector}(${gpu ? 'uniforms.' : ''}gridUnitContour*gridContourEdge*gridContourPaint*gridContourEmission);
#endif`,
    }
  }
}

export function ensureUnitContour(material: PBRMaterial) {
  if (!material.pluginManager?.getPlugin('GridUnitContour')) new UnitContourPlugin(material)
}
