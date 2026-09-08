import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines'
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
/** Parallax room box shading stays inside the PBR pipeline, including reflections and shadows. */
export class InteriorRoomPlugin extends MaterialPluginBase {
  constructor(material: PBRMaterial) { super(material, 'GridInteriorRooms', 200, {}, true, true) }
  isCompatible(_language: ShaderLanguage) { return true }
  prepareDefinesBeforeAttributes(defines: MaterialDefines) { defines._needUVs = true }
  getAttributes(attributes: string[]) { attributes.push('roomData') }
  getCustomCode(shaderType: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
    const gpu = language === ShaderLanguage.WGSL
    if (shaderType === 'vertex') return gpu ? {
      CUSTOM_VERTEX_DEFINITIONS: 'attribute roomData: vec4f; varying gridRoom: vec4f; varying gridUV: vec2f; varying gridRight: vec3f; varying gridUp: vec3f;',
      CUSTOM_VERTEX_MAIN_END: 'vertexOutputs.gridRoom=vertexInputs.roomData; vertexOutputs.gridUV=vertexInputs.uv; vertexOutputs.gridRight=normalize(finalWorld[0].xyz); vertexOutputs.gridUp=normalize(finalWorld[2].xyz);',
    } : {
      CUSTOM_VERTEX_DEFINITIONS: 'attribute vec4 roomData; varying vec4 gridRoom; varying vec2 gridUV; varying vec3 gridRight; varying vec3 gridUp;',
      CUSTOM_VERTEX_MAIN_END: 'gridRoom=roomData; gridUV=uv; gridRight=normalize(finalWorld[0].xyz); gridUp=normalize(finalWorld[2].xyz);',
    }
    if (shaderType !== 'fragment') return null
    return gpu ? {
      CUSTOM_FRAGMENT_DEFINITIONS: `varying gridRoom: vec4f; varying gridUV: vec2f; varying gridRight: vec3f; varying gridUp: vec3f;
fn gridRoomColor(uv:vec2f,rd:vec3f,room:vec4f)->vec3f {
 let span=max(1.,room.y);let origin=vec3f((uv.x+room.z)/span,uv.y,0.001);let ray=vec3f(rd.x/span,rd.y,max(.08,rd.z));
 let wall=select(vec3f(0.),vec3f(1.),ray>vec3f(0.));let t=(wall-origin)/select(vec3f(.00001),ray,abs(ray)>vec3f(.00001));let distance=min(min(t.x,t.y),t.z);let hit=origin+ray*distance;
 let family=room.x;var base=mix(vec3f(.16,.19,.20),vec3f(.45,.38,.27),fract(room.w*7.));base*=select(.7,1.15,hit.y>.01);base*=select(.7,1.,hit.z>.99);
 let shelf=step(.68,hit.y)*step(.06,fract(hit.y*7.));let desk=step(hit.y,.38)*step(.15,hit.x)*step(hit.x,.84);
 if(family<2.){base=mix(base,vec3f(.24,.21,.16),desk);base+=vec3f(.16,.11,.05)*step(.77,hit.x)*step(.35,hit.y)*step(hit.y,.62);}
 else if(family<4.){base=mix(base,vec3f(.10,.15,.19),desk);base+=vec3f(.04,.15,.19)*step(.3,hit.x)*step(hit.x,.65)*step(.4,hit.y)*step(hit.y,.66);}
 else {base=mix(base,vec3f(.29,.22,.13),shelf);base*=.65+.35*step(.07,fract(hit.x*(3.+family)));}
 return base;
}`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `let gridEye=normalize(scene.vEyePosition.xyz-fragmentInputs.vPositionW);let gridOut=normalize(cross(fragmentInputs.gridRight,fragmentInputs.gridUp));let gridRay=vec3f(-dot(gridEye,fragmentInputs.gridRight),-dot(gridEye,fragmentInputs.gridUp),abs(dot(gridEye,gridOut)));let gridInterior=gridRoomColor(fragmentInputs.gridUV,gridRay,fragmentInputs.gridRoom);surfaceAlbedo=mix(gridInterior,surfaceAlbedo,.28);`,
    } : {
      CUSTOM_FRAGMENT_DEFINITIONS: `varying vec4 gridRoom; varying vec2 gridUV; varying vec3 gridRight; varying vec3 gridUp;
vec3 gridRoomColor(vec2 uv,vec3 rd,vec4 room){
 float span=max(1.,room.y);vec3 origin=vec3((uv.x+room.z)/span,uv.y,.001);vec3 ray=vec3(rd.x/span,rd.y,max(.08,rd.z));
 vec3 wall=step(vec3(0.),ray);vec3 t=(wall-origin)/(mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))*max(abs(ray),vec3(.00001)));float distance=min(min(t.x,t.y),t.z);vec3 hit=origin+ray*distance;
 float family=room.x;vec3 base=mix(vec3(.16,.19,.20),vec3(.45,.38,.27),fract(room.w*7.));base*=hit.y>.01?1.15:.7;base*=hit.z>.99?1.:.7;
 float shelf=step(.68,hit.y)*step(.06,fract(hit.y*7.));float desk=step(hit.y,.38)*step(.15,hit.x)*step(hit.x,.84);
 if(family<2.){base=mix(base,vec3(.24,.21,.16),desk);base+=vec3(.16,.11,.05)*step(.77,hit.x)*step(.35,hit.y)*step(hit.y,.62);}
 else if(family<4.){base=mix(base,vec3(.10,.15,.19),desk);base+=vec3(.04,.15,.19)*step(.3,hit.x)*step(hit.x,.65)*step(.4,hit.y)*step(hit.y,.66);}
 else{base=mix(base,vec3(.29,.22,.13),shelf);base*=.65+.35*step(.07,fract(hit.x*(3.+family)));}return base;}`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: 'vec3 gridEye=normalize(vEyePosition.xyz-vPositionW);vec3 gridOut=normalize(cross(gridRight,gridUp));vec3 gridRay=vec3(-dot(gridEye,gridRight),-dot(gridEye,gridUp),abs(dot(gridEye,gridOut)));surfaceAlbedo=mix(gridRoomColor(gridUV,gridRay,gridRoom),surfaceAlbedo,.28);',
    }
  }
}
