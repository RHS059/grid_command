import * as T from 'three'

export function createWireSpriteMaterial(color = '#252a29', vertexColors = false) {
  return new T.ShaderMaterial({
    name: 'building-wire-sprite',
    uniforms: { wireColor: { value: new T.Color(color) } },
    vertexColors,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    vertexShader: /* glsl */`
      uniform vec3 wireColor;
      varying vec2 vUv;
      varying vec3 vColor;
      #ifdef USE_INSTANCING_COLOR
        attribute vec3 instanceColor;
      #endif
      void main() {
        mat4 world = modelMatrix;
        #ifdef USE_INSTANCING
          world = modelMatrix * instanceMatrix;
        #endif
        vec4 center = viewMatrix * world * vec4(0.0, 0.0, 0.0, 1.0);
        float width = length((world * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        float height = length((world * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        center.xy += position.xy * vec2(width, height);
        vUv = uv;
        vColor = wireColor;
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor;
        #endif
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vec2 point = vUv - 0.5;
        float alpha = 1.0 - smoothstep(0.28, 0.48, length(point));
        if (alpha < 0.04) discard;
        gl_FragColor = vec4(vColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

export function createColoredBuildingMaterial(kind: string) {
  const material = new T.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: kind === 'roof' ? .75 : kind === 'detail-cylinder' ? .62 : .9,
    metalness: ['door', 'detail-box', 'detail-cylinder'].includes(kind) ? .16 : .04,
    side: kind === 'gable' || kind === 'detail-plane' ? T.DoubleSide : T.FrontSide,
  })
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance + diffuseColor.rgb * 0.24;',
    )
  }
  material.customProgramCacheKey = () => 'building-colored-fill-v1'
  return material
}
