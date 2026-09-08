import * as T from 'three'

const vertexShader = /* glsl */`
  varying vec2 vWindowUv;
  varying vec3 vWorldPosition;
  varying vec3 vWindowCenter;
  varying vec3 vWorldRight;
  varying vec3 vWorldUp;
  varying vec3 vWorldOut;
  #ifdef USE_INSTANCING_COLOR
    attribute vec3 instanceColor;
    varying vec3 vInstanceColor;
  #endif

  void main() {
    mat4 world = modelMatrix;
    #ifdef USE_INSTANCING
      world = modelMatrix * instanceMatrix;
    #endif
    vec4 worldPosition = world * vec4(position, 1.0);
    vWindowUv = uv;
    vWorldPosition = worldPosition.xyz;
    vWindowCenter = (world * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vWorldRight = normalize((world * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
    vWorldUp = normalize((world * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    vWorldOut = normalize(cross(vWorldRight, vWorldUp));
    #ifdef USE_INSTANCING_COLOR
      vInstanceColor = instanceColor;
    #endif
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const fragmentShader = /* glsl */`
  uniform vec3 windowTint;
  varying vec2 vWindowUv;
  varying vec3 vWorldPosition;
  varying vec3 vWindowCenter;
  varying vec3 vWorldRight;
  varying vec3 vWorldUp;
  varying vec3 vWorldOut;
  #ifdef USE_INSTANCING_COLOR
    varying vec3 vInstanceColor;
  #endif

  float hash21(vec2 value) {
    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec3 tint = windowTint;
    #ifdef USE_INSTANCING_COLOR
      tint *= vInstanceColor;
    #endif

    vec3 worldRay = normalize(vWorldPosition - cameraPosition);
    vec3 ray = vec3(dot(worldRay, vWorldRight), dot(worldRay, vWorldUp), dot(worldRay, -vWorldOut));
    ray.z = max(ray.z, 0.025);
    vec3 origin = vec3(vWindowUv - 0.5, 0.0);
    float tx = abs(ray.x) < 0.0001 ? 10000.0 : ((ray.x > 0.0 ? 0.5 : -0.5) - origin.x) / ray.x;
    float ty = abs(ray.y) < 0.0001 ? 10000.0 : ((ray.y > 0.0 ? 0.5 : -0.5) - origin.y) / ray.y;
    float tz = 1.0 / ray.z;
    float distanceToRoom = min(tz, min(tx, ty));
    vec3 hit = origin + ray * distanceToRoom;

    float roomSeed = hash21(floor(vWindowCenter.xy * 0.19) + floor(vWindowCenter.zz * 0.37));
    vec3 backWall = mix(vec3(0.095, 0.105, 0.11), vec3(0.23, 0.18, 0.12), roomSeed);
    vec3 sideWall = mix(backWall * 0.72, vec3(0.10, 0.14, 0.15), roomSeed * 0.65);
    vec3 floorColor = mix(vec3(0.10, 0.075, 0.055), vec3(0.17, 0.14, 0.10), roomSeed);
    vec3 ceilingColor = backWall * 0.58;
    vec3 interior = backWall;
    if (distanceToRoom == tx) interior = sideWall * (ray.x > 0.0 ? 0.78 : 1.08);
    else if (distanceToRoom == ty) interior = ray.y > 0.0 ? ceilingColor : floorColor;

    if (distanceToRoom == tz) {
      vec2 backUv = hit.xy + 0.5;
      float desk = step(0.15, backUv.x) * step(backUv.x, 0.86) * step(0.13, backUv.y) * step(backUv.y, 0.28);
      float cabinet = step(0.68, backUv.x) * step(backUv.x, 0.86) * step(0.28, backUv.y) * step(backUv.y, 0.74);
      float picture = step(0.18, backUv.x) * step(backUv.x, 0.46) * step(0.58, backUv.y) * step(backUv.y, 0.79);
      interior = mix(interior, vec3(0.035, 0.03, 0.025), max(desk, cabinet));
      interior = mix(interior, mix(vec3(0.18, 0.25, 0.27), vec3(0.36, 0.24, 0.12), roomSeed), picture * 0.72);
    }

    float lit = step(0.56, roomSeed);
    interior += vec3(0.48, 0.31, 0.14) * lit * (0.18 + 0.24 * max(0.0, hit.y + 0.5));
    interior = mix(interior, interior * tint * 2.1, 0.34);
    float edge = min(min(vWindowUv.x, 1.0 - vWindowUv.x), min(vWindowUv.y, 1.0 - vWindowUv.y));
    float rim = 1.0 - smoothstep(0.0, 0.11, edge);
    float diagonalSheen = smoothstep(0.055, 0.0, abs(vWindowUv.x + vWindowUv.y * 0.48 - 0.84));
    vec3 glass = tint * (0.12 + rim * 0.16) + vec3(0.20, 0.29, 0.34) * diagonalSheen * 0.22;
    gl_FragColor = vec4(interior + glass, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function createInteriorWindowMaterial(color = '#35596b', vertexColors = false) {
  return new T.ShaderMaterial({
    name: 'interior-window',
    uniforms: { windowTint: { value: new T.Color(color) } },
    vertexShader,
    fragmentShader,
    side: T.FrontSide,
    toneMapped: true,
    vertexColors,
  })
}
