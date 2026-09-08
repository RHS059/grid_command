import * as T from 'three'

export function createWireSpriteMaterial(color = '#252a29', vertexColors = false) {
  return new T.ShaderMaterial({
    name: 'building-wire-sprite',
    uniforms: { wireColor: { value: new T.Color(color) }, buildingGlobalFade: { value: 1 }, buildingRevealProgress: { value: 1 }, buildingDetailFade: { value: 1 }, buildingFocus: { value: new T.Vector2() } },
    vertexColors,
    defines: vertexColors ? { USE_BUILDING_FADE: '' } : {},
    transparent: false,
    depthWrite: true,
    side: T.DoubleSide,
    vertexShader: /* glsl */`
      uniform vec3 wireColor;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vBuildingFade;
      varying float vBuildingReveal;
      varying float vBuildingLod;
      varying vec2 vBuildingOrigin;
      #ifdef USE_BUILDING_FADE
        uniform float buildingGlobalFade;
        uniform vec2 buildingFocus;
        attribute float buildingFade;
        attribute float buildingReveal;
        attribute float buildingLod;
        attribute vec2 buildingOrigin;
      #endif
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
        vBuildingFade = 1.0;
        vBuildingReveal = 0.0;
        vBuildingLod = 0.0;
        vBuildingOrigin = vec2(0.0);
        #ifdef USE_BUILDING_FADE
          vBuildingFade = buildingFade;
          vBuildingReveal = buildingReveal;
          vBuildingLod = buildingLod;
          vBuildingOrigin = buildingOrigin;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * world * vec4(position, 1.0);
        #ifdef USE_BUILDING_FADE
          if (buildingGlobalFade <= 0.001 || distance(buildingOrigin, buildingFocus) >= 200.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        #endif
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vBuildingFade;
      varying float vBuildingReveal;
      varying float vBuildingLod;
      varying vec2 vBuildingOrigin;
      uniform float buildingGlobalFade;
      uniform float buildingRevealProgress;
      uniform float buildingDetailFade;
      uniform vec2 buildingFocus;
      void main() {
        float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float coverage = clamp(abs(vBuildingFade), 0.0, 1.0);
        #ifdef USE_BUILDING_FADE
          coverage *= buildingGlobalFade * smoothstep(vBuildingReveal, min(1.0, vBuildingReveal + 0.52), buildingRevealProgress);
          coverage *= 1.0 - smoothstep(180.0, 200.0, distance(vBuildingOrigin, buildingFocus));
          coverage *= vBuildingLod > 0.5 ? buildingDetailFade : vBuildingLod < -0.5 ? 1.0 - buildingDetailFade : 1.0;
        #endif
        float threshold = vBuildingLod < -0.5 ? 1.0 - dither : dither;
        if (coverage <= threshold) discard;
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
    uniforms: { buildingGlobalFade: { value: 1 }, buildingRevealProgress: { value: 1 }, buildingDetailFade: { value: 1 }, buildingFocus: { value: new T.Vector2() } },
    defines: { USE_BUILDING_FADE: '' },
    side: kind === 'gable' || kind === 'detail-plane' ? T.DoubleSide : T.FrontSide,
    vertexShader: /* glsl */`
      attribute vec3 buildingColor;
      attribute float buildingFade;
      attribute float buildingReveal;
      attribute float buildingLod;
      attribute vec2 buildingOrigin;
      uniform float buildingGlobalFade;
      uniform vec2 buildingFocus;
      varying vec3 vBuildingColor;
      varying float vBuildingFade;
      varying float vBuildingReveal;
      varying float vBuildingLod;
      varying vec2 vBuildingOrigin;
      void main() {
        mat4 world = modelMatrix;
        #ifdef USE_INSTANCING
          world = modelMatrix * instanceMatrix;
        #endif
        vBuildingColor = buildingColor;
        vBuildingFade = buildingFade;
        vBuildingReveal = buildingReveal;
        vBuildingLod = buildingLod;
        vBuildingOrigin = buildingOrigin;
        gl_Position = projectionMatrix * viewMatrix * world * vec4(position, 1.0);
        if (buildingGlobalFade <= 0.001 || distance(buildingOrigin, buildingFocus) >= 200.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vBuildingColor;
      varying float vBuildingFade;
      varying float vBuildingReveal;
      varying float vBuildingLod;
      varying vec2 vBuildingOrigin;
      uniform float buildingGlobalFade;
      uniform float buildingRevealProgress;
      uniform float buildingDetailFade;
      uniform vec2 buildingFocus;
      void main() {
        float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float coverage = clamp(abs(vBuildingFade), 0.0, 1.0);
        coverage *= buildingGlobalFade * smoothstep(vBuildingReveal, min(1.0, vBuildingReveal + 0.52), buildingRevealProgress);
        coverage *= 1.0 - smoothstep(180.0, 200.0, distance(vBuildingOrigin, buildingFocus));
        coverage *= vBuildingLod > 0.5 ? buildingDetailFade : vBuildingLod < -0.5 ? 1.0 - buildingDetailFade : 1.0;
        float threshold = vBuildingLod < -0.5 ? 1.0 - dither : dither;
        if (coverage <= threshold) discard;
        gl_FragColor = vec4(vBuildingColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
}
