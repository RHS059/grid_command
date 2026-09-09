import * as T from './scene-data'
import { computeAngleNormals } from './geometry-normals'

/** Small meshes, baked once and merged before instancing. Z is up. */
export function tint(g: T.BufferGeometry, color: string, variation = 0) {
  const base = new T.Color(color), a = new Float32Array(g.getAttribute('position').count * 3)
  for (let i = 0; i < a.length / 3; i++) {
    const shade = 1 + variation * (((Math.floor(i / 6) * 7) % 5) / 4 - .5)
    a.set([base.r * shade, base.g * shade, base.b * shade], i * 3)
  }
  g.setAttribute('color', new T.BufferAttribute(a, 3)); return g
}
function geometry(vertices: number[]) {
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2))
  // Smoothed per part, before anything merges or instances it: bevels and gentle tapers
  // round off, corners at more than 30 degrees stay crisp.
  return computeAngleNormals(g)
}
/** Beveled rectangular cross sections, ordered from bottom to top. */
export function shell(rings: { z: number; w: number; d: number; y?: number }[], color: string, bevel = .2) {
  const vertices: number[] = [], sections = rings.map(r => {
    const x = r.w / 2, y = r.d / 2, k = bevel
    return [[-x*(1-k),-y],[x*(1-k),-y],[x,-y*(1-k)],[x,y*(1-k)],[x*(1-k),y],[-x*(1-k),y],[-x,y*(1-k)],[-x,-y*(1-k)]].map(([a,b]) => [a,b+(r.y||0),r.z])
  })
  const tri = (a: number[], b: number[], c: number[]) => vertices.push(...a,...b,...c)
  for (let r=0;r<sections.length-1;r++) for(let i=0;i<8;i++) {
    const n=(i+1)%8,a=sections[r][i],b=sections[r][n],c=sections[r+1][n],d=sections[r+1][i];tri(a,b,c);tri(a,c,d)
  }
  for(let i=1;i<7;i++){tri(sections[0][0],sections[0][i+1],sections[0][i]);const top=sections.at(-1)!;tri(top[0],top[i],top[i+1])}
  return tint(geometry(vertices),color,.12)
}
/** Extrude a side silhouette along X, preserving concave cutouts. */
export function profile(points: [number,number][], width: number, color: string) {
  const contour=points.map(p=>new T.Vector2(...p)); if(T.ShapeUtils.isClockWise(contour))contour.reverse()
  const vertices:number[]=[],tri=(a:number[],b:number[],c:number[])=>vertices.push(...a,...b,...c)
  const v=(i:number,x:number)=>[x,contour[i].x,contour[i].y]
  for(const [a,b,c] of T.ShapeUtils.triangulateShape(contour,[])){tri(v(a,width/2),v(b,width/2),v(c,width/2));tri(v(c,-width/2),v(b,-width/2),v(a,-width/2))}
  for(let i=0;i<contour.length;i++){const n=(i+1)%contour.length;tri(v(i,-width/2),v(n,-width/2),v(n,width/2));tri(v(i,-width/2),v(n,width/2),v(i,width/2))}
  return tint(geometry(vertices),color,.08)
}
export function rod(a: [number,number,number], b: [number,number,number], radius:number, color:string, sides=6) {
  const start=new T.Vector3(...a),end=new T.Vector3(...b),g=new T.CylinderGeometry(radius,radius,start.distanceTo(end),sides).toNonIndexed()
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());return tint(g,color)
}
