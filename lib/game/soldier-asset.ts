import * as D from './scene-data'
import { assetPath } from '@/lib/asset-path'
import { SIDE_COLOR, type Side } from './types'
interface RigAsset { scene: D.Object3D; animations: D.AnimationClip[] }
interface GltfNode { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
interface GltfAccessor { bufferView?: number; byteOffset?: number; count: number; type: string; componentType: number }
interface GltfDocument { nodes?: GltfNode[]; scenes?: { nodes: number[] }[]; scene?: number; accessors?: GltfAccessor[]; bufferViews?: { byteOffset?: number; byteStride?: number }[]; animations?: { name?: string; samplers: { input: number; output: number }[]; channels: { sampler: number; target: { node: number; path: string } }[] }[] }
let soldierAsset: Promise<RigAsset> | undefined
let soldierWeaponAsset: Promise<RigAsset> | undefined
export type SoldierWeapon = 'RIFLE' | 'MG' | 'AT' | 'AA_TEAM'
/** Parse hierarchy and animation metadata; Babylon owns GPU meshes and skeletons. */
async function loadRig(url: string): Promise<RigAsset> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Model request failed (${response.status})`)
  const buffer = await response.arrayBuffer(), view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid binary model')
  let document: GltfDocument = {}, binary = 0
  for (let offset = 12; offset + 8 <= buffer.byteLength;) {
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true)
    if (type === 0x4e4f534a) document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length)))
    if (type === 0x004e4942) binary = offset + 8
    offset += 8 + length
  }
  const nodes = (document.nodes || []).map((node, index) => {
    const object = new D.Group(); object.name = node.name || `node-${index}`
    if (node.translation) object.position.fromArray(node.translation)
    if (node.rotation) object.quaternion.set(node.rotation[0], node.rotation[1], node.rotation[2], node.rotation[3])
    if (node.scale) object.scale.fromArray(node.scale)
    return object
  })
  document.nodes?.forEach((node, index) => node.children?.forEach(child => nodes[index].add(nodes[child])))
  const scene = new D.Group(); scene.userData.nativeAssetURL = url
  for (const index of document.scenes?.[document.scene || 0]?.nodes || nodes.map((_, index) => index).filter(index => !nodes[index].parent)) scene.add(nodes[index])
  const values = (index: number) => {
    const accessor = document.accessors?.[index], descriptor = accessor?.bufferView === undefined ? undefined : document.bufferViews?.[accessor.bufferView]
    if (!accessor || !descriptor || accessor.componentType !== 5126) return []
    const size = accessor.type === 'VEC4' ? 4 : accessor.type === 'VEC3' ? 3 : 1, result: number[] = []
    for (let i = 0; i < accessor.count; i++) for (let j = 0; j < size; j++) result.push(view.getFloat32(binary + (descriptor.byteOffset || 0) + (accessor.byteOffset || 0) + i * (descriptor.byteStride || size * 4) + j * 4, true))
    return result
  }
  const animations = (document.animations || []).map((animation, index) => {
    let duration = 0
    const tracks = animation.channels.map(channel => {
      const sampler = animation.samplers[channel.sampler], times = values(sampler.input), output = values(sampler.output)
      duration = Math.max(duration, times[times.length - 1] || 0)
      const name = `${nodes[channel.target.node]?.name}.${channel.target.path === 'rotation' ? 'quaternion' : channel.target.path === 'translation' ? 'position' : 'scale'}`
      return channel.target.path === 'rotation' ? new D.QuaternionKeyframeTrack(name, times, output) : new D.VectorKeyframeTrack(name, times, output)
    })
    return new D.AnimationClip(animation.name || `animation-${index}`, duration, tracks)
  })
  return { scene, animations }
}
export function loadSoldierAsset() { return soldierAsset ??= loadRig(assetPath('/models/soldier.glb')) }
export function loadSoldierWeaponAsset() { return soldierWeaponAsset ??= loadRig(assetPath('/models/soldier-weapons.glb')) }
export function cloneSoldierWeapon(source: D.Object3D, weapon: SoldierWeapon) {
  const node = source.getObjectByName(`Weapon_${weapon}`)
  if (!node) return undefined
  const clone = node.clone(true); clone.userData.nativeAssetURL = source.userData.nativeAssetURL; clone.userData.nativeNodeName = node.name
  return clone
}
export function createSoldierTemplate(source: D.Object3D, side: Side) {
  const template = source.clone(true); template.name = `soldier-${side}-template`; template.visible = false; template.userData.teamColor = SIDE_COLOR[side]
  return template
}
export const cloneSoldierRig = (template: D.Object3D) => template.clone(true)
