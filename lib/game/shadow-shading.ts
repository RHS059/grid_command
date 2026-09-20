import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import type { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator'
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore'
import { shadowMapVertexNormalBias } from '@babylonjs/core/Shaders/ShadersInclude/shadowMapVertexNormalBias'
import { shadowMapVertexNormalBiasWGSL } from '@babylonjs/core/ShadersWGSL/ShadersInclude/shadowMapVertexNormalBias'

/**
 * Babylon offsets every caster along -normal. On double-sided roofs, runway paint,
 * and base slabs, that moves the underside up through the visible top whenever the
 * pixel-scaled bias exceeds the shell thickness. Both faces must move away from
 * the light. Change only the shadow pass; keep the surface's authored normals.
 * Register both includes before Babylon compiles its shadow effects.
 */
export function prepareTwoSidedShadowBias() {
  ShaderStore.IncludesShadersStore[shadowMapVertexNormalBias.name] = shadowMapVertexNormalBias.shader.replace(
    'float ndlSM=dot(vNormalW,worldLightDirSM);',
    'float ndlSM=clamp(dot(vNormalW,worldLightDirSM),-1.0,1.0);vNormalW*=ndlSM<0.0?-1.0:1.0;',
  )
  ShaderStore.IncludesShadersStoreWGSL[shadowMapVertexNormalBiasWGSL.name] = shadowMapVertexNormalBiasWGSL.shader.replace(
    'var ndlSM: f32=dot(vNormalW,worldLightDirSM);',
    'var ndlSM: f32=clamp(dot(vNormalW,worldLightDirSM),-1.0,1.0);vNormalW*=select(1.0,-1.0,ndlSM<0.0);',
  )
}

/** Use two shadow pixels of normal offset at each cascade's world scale. */
export function shadowNormalBias(width: number, height: number, resolution: number) {
  return 2 * Math.max(width, height) / Math.max(1, resolution)
}

/** Set the offset after Babylon computes the current cascade projection. */
export function configureShadowNormalBias(shadows: CascadedShadowGenerator) {
  prepareTwoSidedShadowBias()
  const map = shadows.getShadowMap()!
  shadows.normalBias = .001
  map.onBeforeRenderObservable.add(layer => {
    const min = shadows.getCascadeMinExtents(layer), max = shadows.getCascadeMaxExtents(layer)
    if (min && max) shadows.normalBias = shadowNormalBias(max.x - min.x, max.y - min.y, map.getSize().width)
  })
}

/** Fit preview depth to the subject. The large receiver floor must not set the range. */
export function fitStudioShadowDepth(shadows: CascadedShadowGenerator, camera: FreeCamera) {
  const direction = camera.getTarget().subtract(camera.position).normalize()
  let near = Infinity, far = -Infinity
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const mesh of shadows.getShadowMap()?.renderList || []) {
    if (!mesh.isEnabled() || !mesh.isVisible) continue
    for (const point of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
      const depth = (point.x - camera.position.x) * direction.x + (point.y - camera.position.y) * direction.y + (point.z - camera.position.z) * direction.z
      near = Math.min(near, depth); far = Math.max(far, depth)
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); minZ = Math.min(minZ, point.z)
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); maxZ = Math.max(maxZ, point.z)
    }
  }
  if (!Number.isFinite(near) || !Number.isFinite(far)) return
  const margin = Math.max(.01, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2)
  const range = camera.maxZ - camera.minZ
  if (range <= 0) return
  const min = Math.max(0, (near - margin - camera.minZ) / range), max = Math.min(1, (far + margin - camera.minZ) / range)
  if (max > min) shadows.setMinMaxDistance(min, max)
}
