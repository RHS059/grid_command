declare module '@mapbox/vector-tile' {
  export class VectorTile { constructor(pbf: unknown); layers: Record<string, { extent: number; length: number; feature(index: number): { type: number; properties: Record<string, string | number | boolean>; loadGeometry(): { x: number; y: number }[][] } }> }
}
declare module 'pbf' { export default class Pbf { constructor(bytes: Uint8Array) } }
