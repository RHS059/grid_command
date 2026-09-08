import { MeshStandardMaterial, Color, Vector2, DoubleSide, FrontSide } from './scene-data'
const visibility = () => ({ buildingGlobalFade: { value: 1 }, buildingRevealProgress: { value: 1 }, buildingDetailFade: { value: 1 }, buildingFocus: { value: new Vector2() } })
/** Material intent consumed by the native PBR renderer. Visibility is culled per spatial batch. */
export function createWireSpriteMaterial(color = '#252a29', vertexColors = false) {
  return new MeshStandardMaterial({ name: 'building-wire-sprite', color, vertexColors, roughness: .8, side: DoubleSide, uniforms: { ...visibility(), wireColor: { value: new Color(color) } } })
}
export function createColoredBuildingMaterial(kind: string) {
  return new MeshStandardMaterial({ name: 'building-direct-color', vertexColors: true, roughness: kind.includes('window') ? .25 : .85, metalness: kind.includes('window') ? .3 : .03, side: kind === 'gable' || kind === 'detail-plane' ? DoubleSide : FrontSide, uniforms: visibility() })
}
