import * as T from './scene-data'
import { mergeGeometries } from './scene-data'
import type { Role, Side } from './types'
/** Procedural gameplay silhouettes; independently authored detailed assets can replace these later. */
export function maritimeGeometry(role:Role,side:Side){
  const parts:T.BufferGeometry[]=[],large=role==='FRIGATE',length=large?70:role==='LANDING_CRAFT'?18:10,width=large?10:5
  const box=(x:number,y:number,z:number,w:number,l:number,h:number,color:string)=>{const g=new T.BoxGeometry(w,l,h).toNonIndexed();g.translate(x,y,z);const c=new T.Color(color),a=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b}g.setAttribute('color',new T.Float32BufferAttribute(a,3));parts.push(g)}
  box(0,0,.8,width,length,1.6,side==='BLU'?'#596d78':'#766961');box(0,-length*.2,2,width*.55,length*.25,2,'#414b4d')
  if(role!=='LANDING_CRAFT'){box(0,length*.2,2.1,2,3,1,'#333c3e');box(0,length*.2+2,2.4,.3,4,.3,'#22292a')}
  if(large){box(0,-8,5,.5,.5,8,'#414b4d');box(0,-8,8,6,.4,.5,'#414b4d')}
  return mergeGeometries(parts)!
}
