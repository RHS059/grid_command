import * as T from './scene-data'

/** One low, warm key light placed west of the theater. */
export function addWestSun(scene:T.Scene,scale=1){
  const sun=new T.DirectionalLight('#ffc27a',3.2)
  sun.name='west-sun'
  sun.position.set(-scale,scale*.18,scale*.22)
  sun.castShadow=true
  scene.add(sun)
  return sun
}
