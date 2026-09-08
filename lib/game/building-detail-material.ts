import * as T from 'three'

export function createWireSpriteMaterial(color = '#252a29', vertexColors = false) {
  return new T.ShaderMaterial({
    name: 'building-wire-sprite',
    uniforms: { wireColor: { value: new T.Color(color) } },
    vertexColors,
    transparent: false,
    depthWrite: true,
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
        vUv = uv;
        vColor = wireColor;
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * world * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        gl_FragColor = vec4(vColor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

export function createColoredBuildingMaterial(kind: string) {
  return new T.ShaderMaterial({
    name: 'building-direct-color',
    side: kind === 'gable' || kind === 'detail-plane' ? T.DoubleSide : T.FrontSide,
    vertexShader: /* glsl */`
      attribute vec3 buildingColor;
      varying vec3 vBuildingColor;
      void main() {
        mat4 world = modelMatrix;
        #ifdef USE_INSTANCING
          world = modelMatrix * instanceMatrix;
        #endif
        vBuildingColor = buildingColor;
        gl_Position = projectionMatrix * viewMatrix * world * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vBuildingColor;
      void main() {
        gl_FragColor = vec4(vBuildingColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
}
