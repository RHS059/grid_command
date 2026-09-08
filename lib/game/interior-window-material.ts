import * as T from 'three'
import type { InteriorRoomData } from './building-system'

const vertexShader = /* glsl */`
  varying vec2 vWindowUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldRight;
  varying vec3 vWorldUp;
  varying vec3 vWorldOut;
  uniform vec4 roomDataUniform;
  varying vec4 vRoomData;
  #ifdef USE_INSTANCING
    attribute vec4 roomData;
  #endif
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
    vWorldRight = normalize((world * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
    vWorldUp = normalize((world * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    vWorldOut = normalize(cross(vWorldRight, vWorldUp));
    vRoomData = roomDataUniform;
    #ifdef USE_INSTANCING
      vRoomData = roomData;
    #endif
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
  varying vec3 vWorldRight;
  varying vec3 vWorldUp;
  varying vec3 vWorldOut;
  varying vec4 vRoomData;
  #ifdef USE_INSTANCING_COLOR
    varying vec3 vInstanceColor;
  #endif

  float rectangle(vec2 point, vec4 bounds) {
    return step(bounds.x, point.x) * step(point.x, bounds.z) * step(bounds.y, point.y) * step(point.y, bounds.w);
  }

  float boxHit(vec3 origin, vec3 direction, vec3 minimum, vec3 maximum) {
    vec3 safeDirection = direction;
    safeDirection.x = abs(safeDirection.x) < 0.0001 ? 0.0001 : safeDirection.x;
    safeDirection.y = abs(safeDirection.y) < 0.0001 ? 0.0001 : safeDirection.y;
    safeDirection.z = abs(safeDirection.z) < 0.0001 ? 0.0001 : safeDirection.z;
    vec3 first = (minimum - origin) / safeDirection;
    vec3 second = (maximum - origin) / safeDirection;
    vec3 nearSide = min(first, second), farSide = max(first, second);
    float nearDistance = max(max(nearSide.x, nearSide.y), nearSide.z);
    float farDistance = min(min(farSide.x, farSide.y), farSide.z);
    return farDistance >= max(nearDistance, 0.0) ? max(nearDistance, 0.0) : 10000.0;
  }

  void main() {
    vec3 tint = windowTint;
    #ifdef USE_INSTANCING_COLOR
      tint *= vInstanceColor;
    #endif

    vec3 worldRay = normalize(vWorldPosition - cameraPosition);
    float roomSpan = max(1.0, vRoomData.y);
    vec3 ray = vec3(dot(worldRay, vWorldRight) / roomSpan, dot(worldRay, vWorldUp), dot(worldRay, -vWorldOut));
    ray.z = max(ray.z, 0.025);
    vec2 roomUv = vec2((vRoomData.z + vWindowUv.x) / roomSpan, vWindowUv.y);
    vec3 origin = vec3(roomUv - 0.5, 0.0);
    float tx = abs(ray.x) < 0.0001 ? 10000.0 : ((ray.x > 0.0 ? 0.5 : -0.5) - origin.x) / ray.x;
    float ty = abs(ray.y) < 0.0001 ? 10000.0 : ((ray.y > 0.0 ? 0.5 : -0.5) - origin.y) / ray.y;
    float tz = 1.0 / ray.z;
    float distanceToRoom = min(tz, min(tx, ty));
    vec3 hit = origin + ray * distanceToRoom;

    float roomSeed = fract(vRoomData.w);
    vec3 backWall = mix(vec3(0.095, 0.105, 0.11), vec3(0.23, 0.18, 0.12), roomSeed);
    vec3 sideWall = mix(backWall * 0.72, vec3(0.10, 0.14, 0.15), roomSeed * 0.65);
    vec3 floorColor = mix(vec3(0.10, 0.075, 0.055), vec3(0.17, 0.14, 0.10), roomSeed);
    vec3 ceilingColor = backWall * 0.58;
    vec3 interior = backWall;
    if (distanceToRoom == tx) interior = sideWall * (ray.x > 0.0 ? 0.78 : 1.08);
    else if (distanceToRoom == ty) interior = ray.y > 0.0 ? ceilingColor : floorColor;

    if (distanceToRoom == tz) {
      vec2 backUv = hit.xy + 0.5;
      float roomType = floor(vRoomData.x + 0.5);
      float furniture = 0.0, secondary = 0.0, wallDetail = 0.0;
      if (roomType < 0.5) {
        furniture = rectangle(backUv, vec4(0.10, 0.10, 0.76, 0.32));
        secondary = rectangle(backUv, vec4(0.10, 0.32, 0.76, 0.48)) + rectangle(backUv, vec4(0.80, 0.10, 0.94, 0.38));
        wallDetail = rectangle(backUv, vec4(0.16, 0.58, 0.48, 0.82));
      } else if (roomType < 1.5) {
        furniture = rectangle(backUv, vec4(0.12, 0.11, 0.82, 0.37));
        secondary = rectangle(backUv, vec4(0.18, 0.37, 0.76, 0.54));
        wallDetail = rectangle(backUv, vec4(0.68, 0.60, 0.92, 0.84));
      } else if (roomType < 2.5) {
        furniture = rectangle(backUv, vec4(0.12, 0.13, 0.72, 0.29));
        secondary = rectangle(backUv, vec4(0.68, 0.10, 0.86, 0.69));
        wallDetail = rectangle(backUv, vec4(0.18, 0.55, 0.52, 0.78));
      } else if (roomType < 3.5) {
        furniture = rectangle(backUv, vec4(0.12, 0.14, 0.88, 0.31));
        secondary = rectangle(backUv, vec4(0.18, 0.31, 0.29, 0.47)) + rectangle(backUv, vec4(0.45, 0.31, 0.56, 0.47)) + rectangle(backUv, vec4(0.71, 0.31, 0.82, 0.47));
        wallDetail = rectangle(backUv, vec4(0.18, 0.58, 0.82, 0.73));
      } else if (roomType < 4.5) {
        furniture = rectangle(backUv, vec4(0.08, 0.12, 0.92, 0.27)) + rectangle(backUv, vec4(0.08, 0.45, 0.92, 0.54));
        secondary = rectangle(backUv, vec4(0.13, 0.27, 0.20, 0.43)) + rectangle(backUv, vec4(0.36, 0.27, 0.43, 0.43)) + rectangle(backUv, vec4(0.60, 0.27, 0.67, 0.43)) + rectangle(backUv, vec4(0.82, 0.27, 0.89, 0.43));
        wallDetail = rectangle(backUv, vec4(0.08, 0.66, 0.92, 0.79));
      } else if (roomType < 5.5) {
        furniture = rectangle(backUv, vec4(0.10, 0.10, 0.26, 0.72)) + rectangle(backUv, vec4(0.42, 0.10, 0.58, 0.72)) + rectangle(backUv, vec4(0.74, 0.10, 0.90, 0.72));
        secondary = rectangle(backUv, vec4(0.08, 0.25, 0.92, 0.31)) + rectangle(backUv, vec4(0.08, 0.47, 0.92, 0.53));
      } else if (roomType < 6.5) {
        furniture = rectangle(backUv, vec4(0.08, 0.08, 0.36, 0.42)) + rectangle(backUv, vec4(0.62, 0.08, 0.92, 0.58));
        secondary = rectangle(backUv, vec4(0.12, 0.42, 0.31, 0.68)) + rectangle(backUv, vec4(0.50, 0.08, 0.58, 0.78));
        wallDetail = rectangle(backUv, vec4(0.10, 0.75, 0.90, 0.82));
      } else {
        furniture = rectangle(backUv, vec4(0.08, 0.10, 0.92, 0.24));
        secondary = rectangle(backUv, vec4(0.16, 0.24, 0.27, 0.44)) + rectangle(backUv, vec4(0.43, 0.24, 0.54, 0.44)) + rectangle(backUv, vec4(0.70, 0.24, 0.81, 0.44));
        wallDetail = rectangle(backUv, vec4(0.40, 0.58, 0.60, 0.86));
      }
      furniture = clamp(furniture, 0.0, 1.0); secondary = clamp(secondary, 0.0, 1.0); wallDetail = clamp(wallDetail, 0.0, 1.0);
      interior = mix(interior, mix(vec3(0.035, 0.03, 0.025), vec3(0.10, 0.15, 0.13), roomSeed), furniture);
      interior = mix(interior, mix(vec3(0.20, 0.13, 0.08), vec3(0.16, 0.20, 0.21), roomSeed), secondary * 0.9);
      interior = mix(interior, mix(vec3(0.18, 0.25, 0.27), vec3(0.36, 0.24, 0.12), roomSeed), wallDetail * 0.72);
    }

    float roomType = floor(vRoomData.x + 0.5), propA = 10000.0, propB = 10000.0, propC = 10000.0;
    vec3 propColorA = vec3(0.17, 0.12, 0.08), propColorB = vec3(0.08, 0.10, 0.10), propColorC = vec3(0.20, 0.18, 0.13);
    if (roomType < 0.5) {
      propA = boxHit(origin, ray, vec3(-.43, -.48, .28), vec3(.22, -.20, .82));
      propB = boxHit(origin, ray, vec3(-.46, -.19, .68), vec3(.25, .10, .86));
      propC = boxHit(origin, ray, vec3(.31, -.48, .50), vec3(.46, -.18, .73));
    } else if (roomType < 1.5) {
      propA = boxHit(origin, ray, vec3(-.42, -.46, .58), vec3(.36, -.16, .86));
      propB = boxHit(origin, ray, vec3(-.30, -.46, .28), vec3(.25, -.35, .56));
      propC = boxHit(origin, ray, vec3(.30, -.20, .88), vec3(.46, .19, .94));
    } else if (roomType < 2.5) {
      propA = boxHit(origin, ray, vec3(-.42, -.43, .42), vec3(.18, -.31, .82));
      propB = boxHit(origin, ray, vec3(-.34, -.31, .50), vec3(-.24, .02, .61));
      propC = boxHit(origin, ray, vec3(.28, -.46, .72), vec3(.44, .24, .91));
    } else if (roomType < 3.5) {
      propA = boxHit(origin, ray, vec3(-.42, -.40, .35), vec3(.42, -.27, .78));
      propB = boxHit(origin, ray, vec3(-.32, -.27, .44), vec3(-.23, -.03, .56));
      propC = boxHit(origin, ray, vec3(.23, -.27, .57), vec3(.32, -.03, .69));
    } else if (roomType < 4.5) {
      propA = boxHit(origin, ray, vec3(-.44, -.47, .28), vec3(-.26, .23, .88));
      propB = boxHit(origin, ray, vec3(-.09, -.47, .28), vec3(.09, .23, .88));
      propC = boxHit(origin, ray, vec3(.26, -.47, .28), vec3(.44, .23, .88));
      propColorA = vec3(.24, .30, .18); propColorB = vec3(.32, .24, .12); propColorC = vec3(.20, .28, .22);
    } else if (roomType < 5.5) {
      propA = boxHit(origin, ray, vec3(-.42, -.47, .42), vec3(-.18, .15, .82));
      propB = boxHit(origin, ray, vec3(-.10, -.47, .42), vec3(.12, .15, .82));
      propC = boxHit(origin, ray, vec3(.20, -.47, .42), vec3(.42, .15, .82));
      propColorA = vec3(.34, .20, .13); propColorB = vec3(.17, .27, .25); propColorC = vec3(.27, .25, .15);
    } else if (roomType < 6.5) {
      propA = boxHit(origin, ray, vec3(-.43, -.48, .34), vec3(-.12, -.05, .72));
      propB = boxHit(origin, ray, vec3(.12, -.48, .50), vec3(.44, .24, .86));
      propC = boxHit(origin, ray, vec3(-.04, -.48, .22), vec3(.04, .32, .30));
      propColorA = vec3(.27, .22, .14); propColorB = vec3(.16, .23, .22); propColorC = vec3(.34, .30, .19);
    } else {
      propA = boxHit(origin, ray, vec3(-.44, -.46, .34), vec3(.44, -.33, .78));
      propB = boxHit(origin, ray, vec3(-.31, -.33, .45), vec3(-.22, -.08, .56));
      propC = boxHit(origin, ray, vec3(.22, -.33, .56), vec3(.31, -.08, .67));
    }
    float nearestProp = min(propA, min(propB, propC));
    if (nearestProp < distanceToRoom) {
      vec3 propColor = propA <= propB && propA <= propC ? propColorA : propB <= propC ? propColorB : propColorC;
      float propShade = .72 + .22 * max(0.0, normalize(ray).y);
      interior = propColor * propShade;
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

export function createInteriorWindowMaterial(color = '#35596b', vertexColors = false, room: InteriorRoomData = { type: 2, span: 1, offset: 0, seed: .5 }) {
  return new T.ShaderMaterial({
    name: 'interior-window',
    uniforms: { windowTint: { value: new T.Color(color) }, roomDataUniform: { value: new T.Vector4(room.type, room.span, room.offset, room.seed) } },
    vertexShader,
    fragmentShader,
    side: T.FrontSide,
    toneMapped: true,
    vertexColors,
  })
}
