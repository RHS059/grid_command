import * as T from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { assetPath } from '@/lib/asset-path'
import { SIDE_COLOR, type Side } from './types'

let soldierAsset:Promise<GLTF>|undefined

/** One request and one parsed source rig for the whole page. */
export function loadSoldierAsset(){return soldierAsset??=(new GLTFLoader()).loadAsync(assetPath('/models/soldier.glb'))}

/** Each batch owns one disposable template; its instances share geometry and materials. */
export function createSoldierTemplate(source:T.Object3D,side:Side){
  const template=cloneSkeleton(source),geometries=new Map<T.BufferGeometry,T.BufferGeometry>(),materials=new Map<T.Material,T.Material>()
  template.traverse(node=>{if(!(node instanceof T.Mesh))return;const sourceGeometry=node.geometry;let geometry=geometries.get(sourceGeometry);if(!geometry){const cloned=sourceGeometry.clone();geometries.set(sourceGeometry,cloned);geometry=cloned}node.geometry=geometry
    const copy=(material:T.Material)=>{let result=materials.get(material);if(!result){result=material.clone();if(result.name==='Team marking'&&'color' in result)(result as T.MeshStandardMaterial).color.set(SIDE_COLOR[side]);materials.set(material,result)}return result}
    node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material);node.castShadow=false;node.receiveShadow=false})
  template.name=`soldier-${side}-template`;template.visible=false;return template
}

export const cloneSoldierRig=(template:T.Object3D)=>cloneSkeleton(template)
