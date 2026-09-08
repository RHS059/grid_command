import { MeshStandardMaterial, Color, Vector2, Vector4, FrontSide } from './scene-data'
import type { InteriorRoomData } from './building-system'
/** Babylon's InteriorRoomPlugin implements the parallax shader for both graphics backends. */
export function createInteriorWindowMaterial(color = '#35596b', vertexColors = false, room: InteriorRoomData = { type: 2, span: 1, offset: 0, seed: .5 }) {
  return new MeshStandardMaterial({ name: 'interior-window', color, roughness: .2, metalness: .45, vertexColors, side: FrontSide,
    uniforms: { windowTint: { value: new Color(color) }, roomDataUniform: { value: new Vector4(room.type, room.span, room.offset, room.seed) }, buildingGlobalFade: { value: 1 }, buildingRevealProgress: { value: 1 }, buildingDetailFade: { value: 1 }, buildingFocus: { value: new Vector2() } },
  })
}
