import { attachAircraftWeapons } from './aircraft-weapons'
import * as T from './scene-data'
import { assetPath } from '../asset-path'
import { computeAngleNormals } from './geometry-normals'
import { SIDE_COLOR, type Role, type Side } from './types'
import { createInteriorWindowMaterial } from './interior-window-material'
import tank from './generated/tank.json'
import troop from './generated/troop_transport.json'
import apc from './generated/apc.json'
import cannonApc from './generated/cannon_apc.json'
import apcLod1 from './generated/apc_lod1.json'
import cannonApcLod1 from './generated/cannon_apc_lod1.json'
import amphibiousApc from './generated/amphibious_apc.json'
import cargo from './generated/vtol_cargo.json'
import attack from './generated/vtol_attack.json'
import { vehicleRig, poseVehicleClip } from './vehicle-animation'
import cas from './generated/cas.json'
import reconUav from './generated/recon_uav.json'
import fighter from './generated/fighter.json'
import patrolBoat from './generated/patrol_boat.json'
import landingCraft from './generated/landing_craft.json'
import aircraftCarrier from './generated/aircraft_carrier.json'
import missileCruiser from './generated/missile_cruiser.json'
import { attachVehicleEffects } from './vehicle-effects'
import { LodTransition, type ModelLodState } from './lod-transition'

type Part = { q: string; n: number; s: number; i: string; palette: number[][]; indices?: number[]; uv?: number[]; normals?: number[]; texture?: string; factionVertices?: number[] }
export type PackedVehiclePart = Part
export { geometry as decodeVehicleGeometry }
type Asset = Record<string, Part>
// Both roles use the same canonical chassis records and atlas. Only the roof weapon differs.
const strykerDragoon: Asset = { ...apc, turret: cannonApc.turret, cannon: cannonApc.cannon }
const assets: Partial<Record<Role, Asset>> = {
  TANK: tank, TROOP_TRUCK: troop, APC: apc, CANNON_APC: strykerDragoon, AMPHIBIOUS_APC: amphibiousApc, HEAVY_LIFT_HELI: cargo,
  ATTACK_HELI: attack, CAS_FIGHTER: cas, RECON_UAV: reconUav, JET: fighter,
  PATROL_BOAT: patrolBoat, LANDING_CRAFT: landingCraft, FRIGATE: missileCruiser, AIRCRAFT_CARRIER: aircraftCarrier,
}
export const hasBlenderVehicle = (role: Role) => !!assets[role]

function bytes(value: string) {
  const decoded = atob(value), result = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) result[i] = decoded.charCodeAt(i)
  return result
}
const lowAssets: Partial<Record<Role, Asset>> = { APC: apcLod1, CANNON_APC: cannonApcLod1 }

function geometry(parts: Part[], side?: Side) {
  const g = new T.BufferGeometry()
  const positions: number[] = [], colors: number[] = [], normals: number[] = [], uvs: number[] = [], triangles: number[] = []
  const indexed = parts.some(part => !!part.indices), textured = parts.some(part => !!part.uv)
  for (const part of parts) {
    const packed = bytes(part.q); let buffer = 0, bits = 0, cursor = 0
    const partPositions: number[] = []
    for (let i = 0; i < part.n; i++) {
      while (bits < 15) { buffer |= packed[cursor++] << bits; bits += 8 }
      let value = buffer & 0x7fff; buffer >>>= 15; bits -= 15
      if (value & 0x4000) value -= 0x8000
      partPositions.push(value * part.s)
    }
    // Keep each part separate during normal generation. Preserve all authored normals.
    const source = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(partPositions, 3))
    if (part.indices) source.setIndex(part.indices)
    const indices = bytes(part.i), vertices = part.n / 3
    const faction = side && part.factionVertices ? new Set(part.factionVertices) : undefined
    const factionColor = side ? new T.Color(SIDE_COLOR[side]).toArray() : undefined
    const partColors: number[] = []
    for (let vertex = 0; vertex < vertices; vertex++) partColors.push(...(faction?.has(vertex) ? factionColor! : part.palette[(indices[vertex >> 1] >> ((vertex & 1) * 4)) & 15]))
    source.setAttribute('color', new T.Float32BufferAttribute(partColors, 3))
    if (textured) source.setAttribute('uv', new T.Float32BufferAttribute(part.uv || new Array(vertices * 2).fill(0), 2))
    if (part.normals) source.setAttribute('normal', new T.Float32BufferAttribute(part.normals, 3))
    const shaded = part.normals ? source : computeAngleNormals(source)
    const count = shaded.getAttribute('position').count, offset = positions.length / 3
    if (indexed) for (const index of shaded.index?.array || Array.from({ length: count }, (_, i) => i)) triangles.push(offset + index)
    for (const [name, values] of [['position', positions], ['normal', normals], ['color', colors], ...(textured ? [['uv', uvs]] : [])] as [string, number[]][]) {
      for (const value of shaded.getAttribute(name).array) values.push(value)
    }
    if (shaded !== source) shaded.dispose()
    source.dispose()
  }
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3))
  g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3))
  if (indexed) g.setIndex(triangles)
  if (textured) g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2))
  return g
}

/** Blender's +Y nose and +Z up are retained; aimed turrets stay in world-local coordinates. */
export function blenderVehicleGeometry(role: Role, side: Side, attachment = false) {
  const asset = assets[role]!
  const rig=vehicleRig(role)!
  const turretPart=(name:string)=>rig.nodes[name]?.kind==='turret'||rig.nodes[rig.nodes[name]?.parent||'']?.kind==='turret'
  const parts = Object.entries(asset).filter(([name]) => rig.nodes[name]?.kind!=='muzzle_flash'&&(attachment ? turretPart(name) : !turretPart(name))).map(([, part]) => part)
  const g = geometry(parts, side)
  if (!attachment && !['JET','CAS_FIGHTER','RECON_UAV','AMPHIBIOUS_APC','APC','CANNON_APC','PATROL_BOAT','LANDING_CRAFT','FRIGATE','AIRCRAFT_CARRIER'].includes(role) && g.getAttribute('position').count) {
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
  const root = new T.Group(); root.name = role; root.userData.unitSurface = true
  const lowAsset = lowAssets[role]
  const lod: ModelLodState | undefined = lowAsset ? { transition: new LodTransition(), span: 7.4, detail: 1 } : undefined
  if (lod) root.userData.modelLodRoot = lod
  const texture = Object.values(assets[role]!).find(part => part.texture)?.texture
  const material = new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, flatShading: false, roughness: .85, map: texture ? assetPath(texture) : undefined })
  root.userData.materials = [material]
  const flashMaterial = role==='CAS_FIGHTER'?new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,emissive:'#ffb526',emissiveIntensity:4,flatShading:true,roughness:1,toneMapped:false}):material
  if(flashMaterial!==material)root.userData.materials.push(flashMaterial)
  const rig=vehicleRig(role)!, groups:Record<string,T.Group>={}
  for(const [name,node] of Object.entries(rig.nodes)){const g=new T.Group();g.name=name;groups[name]=g;g.position.set(...node.pivot as [number,number,number])}
  for(const [name,node] of Object.entries(rig.nodes)){const g=groups[name];if(node.parent){const p=rig.nodes[node.parent].pivot;g.position.set(node.pivot[0]-p[0],node.pivot[1]-p[1],node.pivot[2]-p[2]);groups[node.parent].add(g)}else root.add(g)}
  for(const [part,data] of Object.entries(assets[role]!)){const g=geometry([data],side),p=rig.nodes[part]?.pivot||[0,0,0];g.translate(-p[0],-p[1],-p[2]);const mesh=new T.Mesh(g,rig.nodes[part]?.kind==='muzzle_flash'?flashMaterial:material);mesh.name=part+'_mesh';(groups[part]||root).add(mesh)
    if (lod && lowAsset?.[part]) {
      mesh.userData.modelLod = lod
      // The renderer owns the low geometry. Both levels use the same rig matrix.
      mesh.userData.createLodGeometry = () => geometry([lowAsset[part]], side).translate(-p[0], -p[1], -p[2])
    }
  }
  poseVehicleClip(root,'idle',0)
  for(const seat of rig.seats||[]){const marker=new T.Group();marker.name=seat.name;marker.position.set(...seat.position as [number,number,number]);marker.rotation.z=seat.yaw;marker.userData={...seat};root.add(marker)}
  root.userData.blenderVehicle = true
  root.userData.side = side
  if (['APC','CANNON_APC','HEAVY_LIFT_HELI'].includes(role)) {
    const interior = createInteriorWindowMaterial('#4b5143', false, {type:6,span:1,offset:0,seed:.47})
    const stryker=role==='APC'||role==='CANNON_APC'
    const g = new T.PlaneGeometry(stryker?1.54:2.438,stryker?1.3:.954);g.rotateX(Math.PI/2)
    const panel = new T.Mesh(g,interior);panel.name='vehicle-parallax-interior'
    if(stryker)panel.position.set(0,-3.49,1.49)
    else {panel.position.set(1.08,-.115,1.395);panel.rotation.z=Math.PI/2}
    root.add(panel);root.userData.materials.push(interior)
  }
  if (['ATTACK_HELI','HEAVY_LIFT_HELI'].includes(role)) {
    const paint = new T.MeshStandardMaterial({ color: SIDE_COLOR[side], roughness: .85 })
    root.userData.materials.push(paint)
    for (const sign of [-1,1]) {
      const mark = new T.Mesh(new T.BoxGeometry(.18,.62,.02),paint)
      mark.position.set(sign*2.8,role==='JET'?-2.5:0,role==='CAS_FIGHTER'?1.39:role==='JET'?1.93:2.47)
      mark.name='faction-band';root.add(mark)
    }
  }
  if(['TANK','APC','CANNON_APC','TROOP_TRUCK'].includes(role)){
    const paint=new T.MeshStandardMaterial({color:SIDE_COLOR[side],roughness:.85});root.userData.materials.push(paint)
    const mark=new T.Mesh(new T.BoxGeometry(role==='TROOP_TRUCK'?.45:.7,.035,.1),paint)
    const stryker=role==='APC'||role==='CANNON_APC'
    mark.name='faction-band';mark.position.set(0,role==='TROOP_TRUCK'?2.09:stryker?3.545:3.57,role==='TROOP_TRUCK'?.88:stryker?1.42:1.15);root.add(mark)
  }
  attachVehicleEffects(root, role, side)
  attachAircraftWeapons(root, role, geometry)
  return root
}

