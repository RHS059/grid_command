import * as T from './scene-data'
import { mergeGeometries } from './scene-data'

// A common container keeps the truck, crane load and receiving trailer aligned.
export function createCargoContainer() {
  const parts:T.BufferGeometry[]=[]
  const box=(w:number,d:number,h:number,x=0,y=0,z=0)=>{const g=new T.BoxGeometry(w,d,h).toNonIndexed();g.translate(x,y,z);parts.push(g)}
  box(2.5,5.15,2.45)
  for(const sign of [-1,1])for(let i=0;i<24;i++)box(.05,.055,2.3,sign*1.275,-2.47+i*.215)
  for(let i=0;i<24;i++)box(2.45,.055,.035,0,-2.47+i*.215,1.245)
  for(const x of [-1.24,1.24])for(const y of [-2.6,2.6])box(.1,.1,2.5,x,y)
  for(const x of [-.63,.63]){box(1.2,.045,2.3,x,-2.6);box(.035,.065,2.05,x,-2.65);box(.23,.07,.045,x,-2.67,-.4)}
  const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose())
  return new T.Mesh(geometry,new T.MeshStandardMaterial({color:'#73765a',roughness:.9,metalness:.12}))
}

