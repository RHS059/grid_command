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

type Part = { q: string; n: number; s: number; i: string; palette: number[][] }
type Asset = Record<string, Part>
const assets: Partial<Record<Role, Asset>> = {
  TANK: tank, TROOP_TRUCK: troop, APC: apc, HEAVY_LIFT_HELI: cargo,
  ATTACK_HELI: attack, CAS_FIGHTER: cas, JET: fighter,
}
export const hasBlenderVehicle = (role: Role) => !!assets[role]

function bytes(value: string) {
  const decoded = atob(value), result = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) result[i] = decoded.charCodeAt(i)
  return result
}

function geometry(parts: Part[]) {
  const g = new T.BufferGeometry()
  const positions: number[] = [], colors: number[] = []
  for (const part of parts) {
    const packed = bytes(part.q); let buffer = 0, bits = 0, cursor = 0
    for (let i = 0; i < part.n; i++) {
      while (bits < 15) { buffer |= packed[cursor++] << bits; bits += 8 }
      let value = buffer & 0x7fff; buffer >>>= 15; bits -= 15
      if (value & 0x4000) value -= 0x8000
      positions.push(value * part.s)
    }
    const indices = bytes(part.i), vertices = part.n / 3
    for (let vertex = 0; vertex < vertices; vertex++) colors.push(...part.palette[(indices[vertex >> 1] >> ((vertex & 1) * 4)) & 15])
  }
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

/** Blender's +Y nose and +Z up are retained; aimed turrets stay in world-local coordinates. */
export function blenderVehicleGeometry(role: Role, side: Side, attachment = false) {
  const asset = assets[role]!
  const rig=vehicleRig(role)!
  const turretPart=(name:string)=>name==='turret'||rig.nodes[name]?.parent==='turret'
  const parts = Object.entries(asset).filter(([name]) => rig.nodes[name]?.kind!=='muzzle_flash'&&(attachment ? turretPart(name) : !turretPart(name))).map(([, part]) => part)
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
  const flashMaterial = role==='CAS_FIGHTER'?new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,emissive:'#ffb526',emissiveIntensity:4,flatShading:true,roughness:1,toneMapped:false}):material
  if(flashMaterial!==material)root.userData.materials.push(flashMaterial)
  const rig=vehicleRig(role)!, groups:Record<string,T.Group>={}
  for(const [name,node] of Object.entries(rig.nodes)){const g=new T.Group();g.name=name;groups[name]=g;g.position.set(...node.pivot as [number,number,number])}
  for(const [name,node] of Object.entries(rig.nodes)){const g=groups[name];if(node.parent){const p=rig.nodes[node.parent].pivot;g.position.set(node.pivot[0]-p[0],node.pivot[1]-p[1],node.pivot[2]-p[2]);groups[node.parent].add(g)}else root.add(g)}
  for(const [part,data] of Object.entries(assets[role]!)){const g=geometry([data]),p=rig.nodes[part]?.pivot||[0,0,0];g.translate(-p[0],-p[1],-p[2]);const mesh=new T.Mesh(g,rig.nodes[part]?.kind==='muzzle_flash'?flashMaterial:material);mesh.name=part+'_mesh';(groups[part]||root).add(mesh)}
  poseVehicleClip(root,'idle',0)
  for(const seat of rig.seats||[]){const marker=new T.Group();marker.name=seat.name;marker.position.set(...seat.position as [number,number,number]);marker.rotation.z=seat.yaw;marker.userData={...seat};root.add(marker)}
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

