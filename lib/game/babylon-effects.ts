import { Constants } from '@babylonjs/core/Engines/constants'
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline'
import { SSRRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline'
import { TAARenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/taaRenderingPipeline'
import type { Camera } from '@babylonjs/core/Cameras/camera'
import type { Scene } from '@babylonjs/core/scene'

// Analytic AgX: inset, 16.5-stop log exposure, contrast, outset and display gamma.
// The polynomial is the commonly used fit to the AgX default contrast curve.
const glsl = `precision highp float;
varying vec2 vUV; uniform sampler2D textureSampler;
vec3 agx(vec3 c){
 c=mat3(.842479,.042328,.042375,.078434,.878468,.078434,.079223,.079166,.879142)*c;
 vec3 x=clamp((log2(max(c,vec3(1e-10)))+12.47393)/16.5,0.,1.);
 vec3 x2=x*x;vec3 x4=x2*x2;
 x=15.5*x4*x2-40.14*x4*x+31.96*x4-6.868*x2*x+.4298*x2+.1191*x-.00232;
 x=pow(max(x,vec3(0.)),vec3(2.2));
 x=mat3(1.196879,-.052896,-.052971,-.098020,1.151903,-.098043,-.099029,-.098961,1.151073)*x;
 return pow(clamp(x,0.,1.),vec3(1./2.2));
}
void main(){vec4 c=texture2D(textureSampler,vUV);gl_FragColor=vec4(agx(c.rgb),c.a);}`
const wgsl = `varying vUV: vec2f;
var textureSamplerSampler: sampler; var textureSampler: texture_2d<f32>;
fn agx(c0:vec3f)->vec3f{
 let c=mat3x3f(vec3f(.842479,.042328,.042375),vec3f(.078434,.878468,.078434),vec3f(.079223,.079166,.879142))*c0;
 var x=clamp((log2(max(c,vec3f(1e-10)))+12.47393)/16.5,vec3f(0.),vec3f(1.));
 let x2=x*x;let x4=x2*x2;
 x=15.5*x4*x2-40.14*x4*x+31.96*x4-6.868*x2*x+.4298*x2+.1191*x-.00232;
 x=pow(max(x,vec3f(0.)),vec3f(2.2));
 x=mat3x3f(vec3f(1.196879,-.052896,-.052971),vec3f(-.098020,1.151903,-.098043),vec3f(-.099029,-.098961,1.151073))*x;
 return pow(clamp(x,vec3f(0.),vec3f(1.)),vec3f(1./2.2));
}
@fragment fn main(input:FragmentInputs)->FragmentOutputs{let c=textureSample(textureSampler,textureSamplerSampler,input.vUV);fragmentOutputs.color=vec4f(agx(c.rgb),c.a);}`
ShaderStore.ShadersStore.gridAgXFragmentShader = glsl
ShaderStore.ShadersStoreWGSL.gridAgXFragmentShader = wgsl

export const usesCinematicEffects=(quality:'performance'|'balanced'|'high')=>quality==='high'

export class BattlefieldEffects {
  private taa:TAARenderingPipeline|null=null
  private contact:SSAO2RenderingPipeline|null=null
  private reflections:SSRRenderingPipeline|null=null
  private bloom:DefaultRenderingPipeline|null=null
  private tone:PostProcess|null=null
  private mode=''
  constructor(private scene:Scene,private camera:Camera){}
  configure(quality:'performance'|'balanced'|'high'){
    if(quality===this.mode)return
    const cinematic=usesCinematicEffects(quality)
    this.dispose();this.mode=quality
    this.scene.imageProcessingConfiguration.applyByPostProcess=true
    this.scene.imageProcessingConfiguration.toneMappingEnabled=false
    // Balanced already renders at 1.5x device pixels. Running the complete
    // full-resolution post stack as well made it substantially more expensive
    // than the UI's default quality implied, even in an otherwise empty scene.
    // Keep temporal accumulation and bloom as explicit high-quality effects.
    if(cinematic){
      // Babylon requires TAA to be the first camera postprocess.
      this.taa=new TAARenderingPipeline('grid-temporal-aa',this.scene,[this.camera],Constants.TEXTURETYPE_HALF_FLOAT)
      this.taa.samples=8;this.taa.reprojectHistory=false;this.taa.clampHistory=true;this.taa.disableOnCameraMove=false
      // Babylon 9.25's WebGPU prepass exposes no MRT texture array in Firefox. SSAO2 and
      // SSR dereference those missing attachments every frame, so retain them on WebGL only.
      if(!this.scene.getEngine().isWebGPU){
        this.contact=new SSAO2RenderingPipeline('grid-contact-shading',this.scene,{ssaoRatio:.5,blurRatio:.5},[this.camera],false,Constants.TEXTURETYPE_HALF_FLOAT)
        this.contact.radius=2;this.contact.totalStrength=.75;this.contact.samples=8
        this.reflections=new SSRRenderingPipeline('grid-reflections',this.scene,[this.camera],false,Constants.TEXTURETYPE_HALF_FLOAT)
        this.reflections.strength=.45;this.reflections.maxDistance=80;this.reflections.maxSteps=48;this.reflections.step=2;this.reflections.thickness=.5;this.reflections.ssrDownsample=1;this.reflections.blurDownsample=1
        this.reflections.inputTextureColorIsInGammaSpace=false;this.reflections.generateOutputInGammaSpace=false
      }
      this.bloom=new DefaultRenderingPipeline('grid-bloom',true,this.scene,[this.camera])
      this.bloom.imageProcessingEnabled=false;this.bloom.bloomEnabled=true;this.bloom.bloomWeight=.2;this.bloom.bloomThreshold=1;this.bloom.bloomKernel=32
    }
    this.tone=new PostProcess('grid-agx','gridAgX',{size:1,camera:this.camera,engine:this.scene.getEngine(),shaderLanguage:this.scene.getEngine().isWebGPU?ShaderLanguage.WGSL:ShaderLanguage.GLSL,textureType:this.scene.getEngine().getCaps().textureHalfFloatRender?Constants.TEXTURETYPE_HALF_FLOAT:Constants.TEXTURETYPE_UNSIGNED_BYTE})
  }
  dispose(){this.tone?.dispose();this.bloom?.dispose();this.reflections?.dispose();this.contact?.dispose();this.taa?.dispose();this.tone=null;this.bloom=null;this.reflections=null;this.contact=null;this.taa=null;this.mode=''}
}
