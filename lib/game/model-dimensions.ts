import dimensions from '../../godot/data/model_dimensions.json'
import { Box3, Mesh, Vector3, type Object3D } from './scene-data'
import type { ModelId } from './model-catalog'

/** One world unit is one metre. The same catalog is read by the native viewer. */
export const MODEL_DIMENSIONS = dimensions
export function modelScale(id: ModelId, size: Vector3, up: 'y' | 'z' = 'z') {
  const dimension = MODEL_DIMENSIONS[id]
  const span = dimension.axis === 'height' ? size[up] : Math.max(size.x, size.y, size.z)
  return Number.isFinite(span) && span > .00001 ? dimension.metres / span : 1
}
export function modelDimensionLabel(id: ModelId) {
  const dimension = MODEL_DIMENSIONS[id]
  return `${Number(dimension.metres.toFixed(2))} m ${dimension.axis === 'height' ? 'tall' : 'overall'}`
}
/** Hidden deployment geometry must never change the scale of its stowed chassis. */
export function visibleModelBounds(root: Object3D) {
  root.updateMatrixWorld(true)
  const bounds = new Box3()
  const visit = (node: Object3D) => {
    if (!node.visible) return
    if (node instanceof Mesh) {
      const positions = node.geometry.attributes.position
      for (let i = 0; positions && i < positions.count; i++) bounds.expandByPoint(new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld))
    }
    for (const child of node.children) visit(child)
  }
  visit(root)
  return bounds
}
/** Power-of-ten metres keep the floor useful for people, vehicles and large bases. */
export function modelGridSpacing(extent: number) {
  return Math.max(1, 10 ** Math.floor(Math.log10(Math.max(1, extent / 10))))
}

