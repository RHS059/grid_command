import fs from 'node:fs'
import path from 'node:path'
import * as T from '../../lib/game/scene-data'
import { createSupportModel } from '../../lib/game/support-models'
const out=process.env.GC_SEAT_AUDIT_OUT!
for(const role of ['TRUCK','FORKLIFT','UAV_JAMMER'] as const){
 const root=createSupportModel(role,'BLU');root.updateMatrixWorld(true)
 const objects:any[]=[]
 root.traverse(o=>{
  if(!(o instanceof T.Mesh))return
  for(let p:T.Object3D|null=o;p;p=p.parent)if(!p.visible)return
  const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry
  const positions:number[]=[];const a=g.getAttribute('position')
  for(let i=0;i<a.count;i++){const p=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);positions.push(...p.toArray())}
  const material=(Array.isArray(o.material)?o.material[0]:o.material)
  objects.push({name:o.name||`mesh_${objects.length}`,positions,color:material.color.toArray()})
 })
 fs.writeFileSync(path.join(out,role.toLowerCase()+'_geometry.json'),JSON.stringify(objects))
 console.log(role,objects.length,'meshes')
}
