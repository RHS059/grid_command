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
