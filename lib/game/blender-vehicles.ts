import * as T from './scene-data'
import { SIDE_COLOR, type Role, type Side } from './types'
import { createInteriorWindowMaterial } from './interior-window-material'
import tank from './generated/tank.json'
import troop from './generated/troop_transport.json'
import apc from './generated/apc.json'
import cargo from './generated/vtol_cargo.json'
import attack from './generated/vtol_attack.json'
import { vehicleRig, poseVehicleClip } from './vehicle-animation'
import cas from './generated/cas.json'
import fighter from './generated/fighter.json'

type Part = { p: number[]; c: number[] }
type Asset = Record<string, Part>
const assets: Partial<Record<Role, Asset>> = {
  TANK: tank, TROOP_TRUCK: troop, APC: apc, HEAVY_LIFT_HELI: cargo,
  ATTACK_HELI: attack, CAS_FIGHTER: cas, JET: fighter,
}
export const hasBlenderVehicle = (role: Role) => !!assets[role]

function geometry(parts: Part[]) {
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(parts.flatMap(p => p.p), 3))
  g.setAttribute('color', new T.Float32BufferAttribute(parts.flatMap(p => p.c), 3))
  g.computeVertexNormals()
  return g
}

/** Blender's +Y nose and +Z up are retained; aimed turrets stay in world-local coordinates. */
export function blenderVehicleGeometry(role: Role, side: Side, attachment = false) {
  const asset = assets[role]!
  const rig=vehicleRig(role)!
  const turretPart=(name:string)=>name==='turret'||rig.nodes[name]?.parent==='turret'
  const parts = Object.entries(asset).filter(([name]) => attachment ? turretPart(name) : !turretPart(name)).map(([, part]) => part)
  const g = geometry(parts)
  if (!attachment && g.getAttribute('position').count) {
    const mark = new T.BoxGeometry(role === 'TROOP_TRUCK' ? .45 : .7, .035, .1).toNonIndexed()
    mark.translate(0, role === 'TROOP_TRUCK' ? 2.09 : role === 'APC' ? 3.37 : 3.57, role === 'TROOP_TRUCK' ? .88 : 1.15)
    const c = new T.Color(SIDE_COLOR[side]), values = new Float32Array(mark.getAttribute('position').count * 3)
    for (let i = 0; i < values.length; i += 3) values.set([c.r, c.g, c.b], i)
    mark.setAttribute('color', new T.BufferAttribute(values, 3))
    const merged = T.mergeGeometries([g, mark]); g.dispose(); mark.dispose(); return merged
  }
  return g
}

/** Keep each animated propeller around its actual hub, independent of fuselage origin. */
export function createBlenderVehicle(role: Role, side: Side) {
  const root = new T.Group(); root.name = role
  const material = new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, flatShading: true, roughness: .85 })
  root.userData.materials = [material]
  const rig=vehicleRig(role)!, groups:Record<string,T.Group>={}
  for(const [name,node] of Object.entries(rig.nodes)){const g=new T.Group();g.name=name;groups[name]=g;g.position.set(...node.pivot as [number,number,number])}
  for(const [name,node] of Object.entries(rig.nodes)){const g=groups[name];if(node.parent){const p=rig.nodes[node.parent].pivot;g.position.set(node.pivot[0]-p[0],node.pivot[1]-p[1],node.pivot[2]-p[2]);groups[node.parent].add(g)}else root.add(g)}
  for(const [part,data] of Object.entries(assets[role]!)){const g=geometry([data]),p=rig.nodes[part]?.pivot||[0,0,0];g.translate(-p[0],-p[1],-p[2]);const mesh=new T.Mesh(g,material);mesh.name=part+'_mesh';(groups[part]||root).add(mesh)}
  poseVehicleClip(root,'idle',0)
  root.userData.blenderVehicle = true
  root.userData.side = side
  if (['APC','HEAVY_LIFT_HELI'].includes(role)) {
    const interior = createInteriorWindowMaterial('#4b5143', false, {type:6,span:1,offset:0,seed:.47})
    const g = new T.PlaneGeometry(role==='APC'?1.54:2.438,role==='APC'?1.3:.954);g.rotateX(Math.PI/2)
    const panel = new T.Mesh(g,interior);panel.name='vehicle-parallax-interior'
    if(role==='APC')panel.position.set(0,-3.38,1.55)
    else {panel.position.set(1.08,-.115,1.395);panel.rotation.z=Math.PI/2}
    root.add(panel);root.userData.materials.push(interior)
  }
  if (['CAS_FIGHTER','JET','ATTACK_HELI','HEAVY_LIFT_HELI'].includes(role)) {
    const paint = new T.MeshStandardMaterial({ color: SIDE_COLOR[side], roughness: .85 })
    root.userData.materials.push(paint)
    for (const sign of [-1,1]) {
      const mark = new T.Mesh(new T.BoxGeometry(.18,.62,.02),paint)
      mark.position.set(sign*2.8,role==='JET'?-2.5:0,role==='CAS_FIGHTER'?1.39:role==='JET'?1.93:2.47)
      mark.name='faction-band';root.add(mark)
    }
  }
  if(['TANK','APC','TROOP_TRUCK'].includes(role)){
    const paint=new T.MeshStandardMaterial({color:SIDE_COLOR[side],roughness:.85});root.userData.materials.push(paint)
    const mark=new T.Mesh(new T.BoxGeometry(role==='TROOP_TRUCK'?.45:.7,.035,.1),paint)
    mark.name='faction-band';mark.position.set(0,role==='TROOP_TRUCK'?2.09:role==='APC'?3.37:3.57,role==='TROOP_TRUCK'?.88:1.15);root.add(mark)
  }
  return root
}
