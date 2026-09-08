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
        vec2 edge = min(vUv, 1.0 - vUv);
        float alpha = smoothstep(0.0, 0.16, min(edge.x, edge.y));
        if (alpha < 0.04) discard;
        gl_FragColor = vec4(vColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

export function createColoredBuildingMaterial(kind: string) {
  return new T.MeshBasicMaterial({
    color: '#ffffff',
    vertexColors: true,
    toneMapped: false,
    side: kind === 'gable' || kind === 'detail-plane' ? T.DoubleSide : T.FrontSide,
  })
}
