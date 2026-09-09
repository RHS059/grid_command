import * as T from './scene-data'

/** One low, warm key light placed west of the theater. Kept for existing callers (the model viewer). */
export function addWestSun(scene:T.Scene,scale=1){
  const sun=new T.DirectionalLight('#ffc27a',3.2)
  sun.name='west-sun'
  sun.position.set(-scale,scale*.18,scale*.22)
  sun.castShadow=true
  scene.add(sun)
  return sun
}

export interface StudioRig{
  key:T.DirectionalLight;fill:T.DirectionalLight;rim:T.DirectionalLight
  /** Re-aims all three roles from the current camera basis. Call after the orbit update, before rendering. */
  update(camera:{position:T.Vector3;up:T.Vector3},target:T.Vector3,center:T.Vector3,radius:number):void
}

/**
 * Isolated three-point studio rig for the model viewer: key, weaker opposing fill and a
 * rear rim. The three roles are placed from the camera basis rather than fixed world axes,
 * so the key stays camera-left through a full 360 degree orbit instead of sliding around
 * the subject. Only the key owns shadows; colors stay near-neutral so BLU/RED markings
 * are not misrepresented.
 */
export function addStudioLighting(scene:T.Scene):StudioRig{
  scene.profile='studio'
  const key=new T.DirectionalLight('#fff3e0',2.9),fill=new T.DirectionalLight('#dce8ff',.8),rim=new T.DirectionalLight('#f4f4f4',1.9)
  key.name='studio-key';fill.name='studio-fill';rim.name='studio-rim'
  key.castShadow=true
  const ambient=new T.HemisphereLight('#93b4d8','#2b3340',.22)
  ambient.name='studio-ambient'
  scene.add(key,fill,rim,ambient)
  scene.background=new T.Color('#0c1826')
  let basis={forward:new T.Vector3(0,1,0),right:new T.Vector3(1,0,0),up:new T.Vector3(0,0,1)}
  const update=(camera:{position:T.Vector3;up:T.Vector3},target:T.Vector3,center:T.Vector3,radius:number)=>{
    const forward=camera.position.clone().sub(target)
    if(forward.length()>1e-6)forward.normalize();else forward.copy(basis.forward)
    const right=new T.Vector3().crossVectors(camera.up,forward)
    if(right.length()>1e-6)right.normalize();else right.copy(basis.right)
    const up=new T.Vector3().crossVectors(forward,right)
    if(up.length()>1e-6)up.normalize();else up.copy(basis.up)
    basis={forward:forward.clone(),right:right.clone(),up:up.clone()}
    const offset=(rightWeight:number,forwardWeight:number,upWeight:number)=>{
      const value=new T.Vector3().addScaledVector(right,rightWeight).addScaledVector(forward,forwardWeight).addScaledVector(up,upWeight)
      return value.length()>1e-6?value.normalize():value
    }
    const distance=Math.max(radius,.01)*3
    const place=(light:T.DirectionalLight,direction:T.Vector3)=>{light.position.copy(center).addScaledVector(direction,distance);light.target.position.copy(center)}
    place(key,offset(-1,1,1));place(fill,offset(1,1,.35));place(rim,offset(.4,-1,.8))
  }
  return {key,fill,rim,update}
}

export interface BattlefieldLighting{sun:T.DirectionalLight;sky:T.HemisphereLight}

/**
 * Battlefield environment: the existing warm western sun (explicit shadow owner) plus a
 * low hemispheric ambient fill standing in for sky/IBL. There is no licensed prefiltered
 * environment asset in this repository, so this intentionally stops at the fallback the
 * spec describes for a still-loading environment rather than faking a textured sky.
 */
export function addBattlefieldLighting(scene:T.Scene,scale=1):BattlefieldLighting{
  scene.profile='battlefield'
  const sun=addWestSun(scene,scale)
  sun.name='battlefield-sun'
  sun.target.position.set(0,0,0)
  const sky=new T.HemisphereLight('#7fa6c9','#3a3c30',.28)
  sky.name='battlefield-sky'
  scene.add(sky)
  scene.background=new T.Color('#243244')
  return {sun,sky}
}
