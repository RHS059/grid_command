/** Engine-neutral model data. Babylon is the only rendering/geometry dependency. */
import { Matrix as BMatrix, Quaternion as BQuaternion, Vector3 as BVector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateBoxVertexData } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinderVertexData } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateSphereVertexData } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateTorusVertexData } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import earcut from 'earcut'

export const DynamicDrawUsage = 1, FrontSide = 0, DoubleSide = 2, AdditiveBlending = 2, NormalBlending = 1, LoopOnce = 1, LoopRepeat = 2
export const MathUtils = { degToRad: (v: number) => v * Math.PI / 180, clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) }
export class Vector2 {
  constructor(public x = 0, public y = 0) {}
  set(x: number, y: number) { this.x = x; this.y = y; return this }
  copy(v: Vector2) { return this.set(v.x, v.y) }
  clone() { return new Vector2(this.x, this.y) }
  toArray(): [number, number] { return [this.x, this.y] }
}
export class Vector3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this }
  setScalar(v: number) { return this.set(v, v, v) }
  copy(v: { x: number; y: number; z: number }) { return this.set(v.x, v.y, v.z) }
  clone() { return new Vector3(this.x, this.y, this.z) }
  add(v: Vector3) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z) }
  addScaledVector(v: Vector3, s: number) { return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s) }
  sub(v: Vector3) { return this.set(this.x - v.x, this.y - v.y, this.z - v.z) }
  subVectors(a: Vector3, b: Vector3) { return this.copy(a).sub(b) }
  multiplyScalar(s: number) { return this.set(this.x * s, this.y * s, this.z * s) }
  divideScalar(s: number) { return this.multiplyScalar(1 / s) }
  lengthSq() { return this.dot(this) }
  length() { return Math.sqrt(this.lengthSq()) }
  normalize() { return this.divideScalar(this.length() || 1) }
  dot(v: Vector3) { return this.x * v.x + this.y * v.y + this.z * v.z }
  cross(v: Vector3) { return this.crossVectors(this.clone(), v) }
  crossVectors(a: Vector3, b: Vector3) { return this.set(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x) }
  distanceTo(v: Vector3) { return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z) }
  lerp(v: Vector3, a: number) { return this.set(this.x+(v.x-this.x)*a,this.y+(v.y-this.y)*a,this.z+(v.z-this.z)*a) }
  toArray(): [number, number, number] { return [this.x, this.y, this.z] }
  fromArray(a: ArrayLike<number>, i = 0) { return this.set(a[i], a[i+1], a[i+2]) }
  fromBufferAttribute(a: BufferAttribute, i: number) { return this.set(a.getX(i), a.getY(i), a.getZ(i)) }
  applyMatrix4(m: Matrix4) { const e=m.elements,x=this.x,y=this.y,z=this.z,w=1/(e[3]*x+e[7]*y+e[11]*z+e[15]); return this.set((e[0]*x+e[4]*y+e[8]*z+e[12])*w,(e[1]*x+e[5]*y+e[9]*z+e[13])*w,(e[2]*x+e[6]*y+e[10]*z+e[14])*w) }
  applyQuaternion(q: Quaternion) { return this.applyMatrix4(new Matrix4().compose(new Vector3(),q,new Vector3(1,1,1))) }
  setFromMatrixPosition(m: Matrix4) { return this.fromArray(m.elements,12) }
  min(v: Vector3) { return this.set(Math.min(this.x,v.x),Math.min(this.y,v.y),Math.min(this.z,v.z)) }
  max(v: Vector3) { return this.set(Math.max(this.x,v.x),Math.max(this.y,v.y),Math.max(this.z,v.z)) }
}
export class Vector4 { constructor(public x=0,public y=0,public z=0,public w=0) {} set(x:number,y:number,z:number,w:number){this.x=x;this.y=y;this.z=z;this.w=w;return this} clone(){return new Vector4(this.x,this.y,this.z,this.w)} }
export class Quaternion {
  constructor(public x=0,public y=0,public z=0,public w=1) {}
  changed = false
  set(x:number,y:number,z:number,w:number){this.x=x;this.y=y;this.z=z;this.w=w;this.changed=true;return this}
  copy(q:Quaternion){return this.set(q.x,q.y,q.z,q.w)}
  clone(){return new Quaternion().copy(this)}
  setFromAxisAngle(axis:Vector3,angle:number){const s=Math.sin(angle/2);return this.set(axis.x*s,axis.y*s,axis.z*s,Math.cos(angle/2))}
  setFromUnitVectors(a:Vector3,b:Vector3){let w=a.dot(b)+1;const v=w<1e-6?(Math.abs(a.x)>Math.abs(a.z)?new Vector3(-a.y,a.x,0):new Vector3(0,-a.z,a.y)):new Vector3().crossVectors(a,b);if(w<1e-6)w=0;const n=Math.hypot(v.x,v.y,v.z,w)||1;return this.set(v.x/n,v.y/n,v.z/n,w/n)}
  multiply(q:Quaternion){const a=new BQuaternion(this.x,this.y,this.z,this.w).multiply(new BQuaternion(q.x,q.y,q.z,q.w));return this.set(a.x,a.y,a.z,a.w)}
  toArray():[number,number,number,number]{return[this.x,this.y,this.z,this.w]}
  setFromEuler(v:Vector3){const cx=Math.cos(v.x/2),sx=Math.sin(v.x/2),cy=Math.cos(v.y/2),sy=Math.sin(v.y/2),cz=Math.cos(v.z/2),sz=Math.sin(v.z/2);return this.set(sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz)}
}
export class Matrix4 {
  elements:number[]=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
  identity(){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];return this}
  copy(m:Matrix4){return this.fromArray(m.elements)} clone(){return new Matrix4().copy(this)}
  fromArray(a:ArrayLike<number>,offset=0){for(let i=0;i<16;i++)this.elements[i]=a[i+offset];return this}
  toArray(a:number[]|Float32Array=[],offset=0){for(let i=0;i<16;i++)a[i+offset]=this.elements[i];return a}
  multiply(m:Matrix4){return this.multiplyMatrices(this,m)}
  premultiply(m:Matrix4){return this.multiplyMatrices(m,this)}
  multiplyMatrices(a:Matrix4,b:Matrix4){const out=new Array<number>(16),ae=a.elements,be=b.elements;for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=ae[r]*be[c*4]+ae[r+4]*be[c*4+1]+ae[r+8]*be[c*4+2]+ae[r+12]*be[c*4+3];this.elements=out;return this}
  invert(){return this.fromArray(BMatrix.FromArray(this.elements).invert().asArray())}
  compose(p:Vector3,q:Quaternion,s:Vector3){return this.fromArray(BMatrix.Compose(new BVector3(s.x,s.y,s.z),new BQuaternion(q.x,q.y,q.z,q.w),new BVector3(p.x,p.y,p.z)).asArray())}
  makeTranslation(x:number,y:number,z:number){this.identity();this.elements[12]=x;this.elements[13]=y;this.elements[14]=z;return this}
  scale(v:Vector3){for(let i=0;i<4;i++){this.elements[i]*=v.x;this.elements[4+i]*=v.y;this.elements[8+i]*=v.z}return this}
}
let identity=0
export class Color {
  r=1;g=1;b=1
  constructor(value:string|number|Color=0xffffff,g?:number,b?:number){if(g!==undefined&&b!==undefined){this.r=Number(value);this.g=g;this.b=b}else this.set(value)}
  set(value:string|number|Color){if(value instanceof Color){this.r=value.r;this.g=value.g;this.b=value.b;return this}const n=typeof value==='number'?value:parseInt(value.replace('#','').replace(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i,'$1$1$2$2$3$3'),16);this.r=((n>>16)&255)/255;this.g=((n>>8)&255)/255;this.b=(n&255)/255;return this}
  clone(){return new Color(this)} multiplyScalar(s:number){this.r*=s;this.g*=s;this.b*=s;return this}
  getHexString(){return[this.r,this.g,this.b].map(v=>Math.round(MathUtils.clamp(v,0,1)*255).toString(16).padStart(2,'0')).join('')}
  toArray(){return[this.r,this.g,this.b]}
}
export class BufferAttribute {
  version=0;usage=0
  constructor(public array:Float32Array|Uint32Array|Uint16Array,public itemSize:number){}
  get count(){return this.array.length/this.itemSize} set needsUpdate(value:boolean){if(value)this.version++}
  setUsage(v:number){this.usage=v;return this}
  getX(i:number){return this.array[i*this.itemSize]}getY(i:number){return this.array[i*this.itemSize+1]}getZ(i:number){return this.array[i*this.itemSize+2]}
  setX(i:number,x:number){this.array[i*this.itemSize]=x;return this}setY(i:number,y:number){this.array[i*this.itemSize+1]=y;return this}setZ(i:number,z:number){this.array[i*this.itemSize+2]=z;return this}
  setXY(i:number,x:number,y:number){this.setX(i,x);this.setY(i,y);return this}setXYZ(i:number,x:number,y:number,z:number){this.setXY(i,x,y);this.setZ(i,z);return this}setXYZW(i:number,x:number,y:number,z:number,w:number){this.setXYZ(i,x,y,z);this.array[i*this.itemSize+3]=w;return this}
  clone(){return new BufferAttribute(this.array.slice(),this.itemSize)}
}
export class Float32BufferAttribute extends BufferAttribute {constructor(a:number[]|Float32Array,size:number){super(new Float32Array(a),size)}}
export class InstancedBufferAttribute extends BufferAttribute {}
export class BufferGeometry {
  id=++identity;attributes:Record<string,BufferAttribute>={};index:BufferAttribute|null=null;boundingBox:Box3|null=null;boundingSphere:Sphere|null=null;disposed=false
  setAttribute(name:string,a:BufferAttribute){this.attributes[name]=a;return this}getAttribute(name:string){return this.attributes[name]}deleteAttribute(name:string){delete this.attributes[name];return this}
  setIndex(index:number[]|BufferAttribute|null){this.index=index===null?null:index instanceof BufferAttribute?index:new BufferAttribute(new Uint32Array(index),1);return this}
  clone(){const result=new BufferGeometry();for(const[name,a]of Object.entries(this.attributes))result.attributes[name]=a.clone();result.index=this.index?.clone()||null;return result}
  toNonIndexed(){if(!this.index)return this.clone();const g=new BufferGeometry();for(const[name,a]of Object.entries(this.attributes)){const out=new Float32Array(this.index.count*a.itemSize);for(let i=0;i<this.index.count;i++)for(let k=0;k<a.itemSize;k++)out[i*a.itemSize+k]=a.array[this.index.getX(i)*a.itemSize+k];g.setAttribute(name,new BufferAttribute(out,a.itemSize))}return g}
  applyMatrix4(m:Matrix4){const p=this.getAttribute('position');if(!p)return this;const v=new Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m);p.setXYZ(i,v.x,v.y,v.z)}p.needsUpdate=true;this.computeVertexNormals();return this}
  translate(x:number,y:number,z:number){return this.applyMatrix4(new Matrix4().makeTranslation(x,y,z))}
  rotateX(a:number){return this.applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),a))}rotateY(a:number){return this.applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),a))}rotateZ(a:number){return this.applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),a))}
  scale(x:number,y:number,z:number){return this.applyMatrix4(new Matrix4().scale(new Vector3(x,y,z)))}
  applyQuaternion(q:Quaternion){return this.applyMatrix4(new Matrix4().compose(new Vector3(),q,new Vector3(1,1,1)))}
  computeVertexNormals(){const p=this.attributes.position;if(!p)return;const normals=new Float32Array(p.count*3),a=new Vector3(),b=new Vector3(),c=new Vector3();const index=this.index?.array;for(let i=0;i<(index?.length||p.count);i+=3){const ai=index?.[i]??i,bi=index?.[i+1]??i+1,ci=index?.[i+2]??i+2;a.fromBufferAttribute(p,ai);b.fromBufferAttribute(p,bi).sub(a);c.fromBufferAttribute(p,ci).sub(a);b.cross(c);for(const n of [ai,bi,ci]){normals[n*3]+=b.x;normals[n*3+1]+=b.y;normals[n*3+2]+=b.z}}for(let i=0;i<p.count;i++){a.fromArray(normals,i*3).normalize();normals.set(a.toArray(),i*3)}this.attributes.normal=new BufferAttribute(normals,3)}
  computeBoundingBox(){this.boundingBox=new Box3();const p=this.attributes.position;for(let i=0;p&&i<p.count;i++)this.boundingBox.expandByPoint(new Vector3().fromBufferAttribute(p,i))}
  computeBoundingSphere(){this.computeBoundingBox();this.boundingSphere=new Sphere(this.boundingBox!.getCenter(new Vector3()),this.boundingBox!.getSize(new Vector3()).length()/2)}
  dispose(){this.disposed=true}
}
function fromVertexData(target:BufferGeometry,data:{positions?:ArrayLike<number>|null;normals?:ArrayLike<number>|null;uvs?:ArrayLike<number>|null;indices?:ArrayLike<number>|null}){target.setAttribute('position',new Float32BufferAttribute(Array.from(data.positions||[]),3));if(data.normals)target.setAttribute('normal',new Float32BufferAttribute(Array.from(data.normals),3));if(data.uvs)target.setAttribute('uv',new Float32BufferAttribute(Array.from(data.uvs),2));if(data.indices){const indices=Array.from(data.indices);for(let i=0;i<indices.length;i+=3){const b=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=b}target.setIndex(indices)}return target}
export class BoxGeometry extends BufferGeometry {
  constructor(w=1,h=1,d=1,widthSegments=1,heightSegments=1,depthSegments=1) {
    super()
    if(widthSegments<=1&&heightSegments<=1&&depthSegments<=1){fromVertexData(this,CreateBoxVertexData({width:w,height:h,depth:d}));return}
    // Base platforms sample terrain at these vertices, so keep their requested subdivisions.
    const size=[w,h,d],segments=[widthSegments,heightSegments,depthSegments].map(value=>Math.max(1,Math.floor(value))),positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[]
    const face=(axis:number,sign:number,u:number,uSign:number,v:number,vSign:number)=>{
      const start=positions.length/3,columns=segments[u],rows=segments[v]
      for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
        const point=[0,0,0],normal=[0,0,0];point[axis]=sign*size[axis]/2;point[u]=(col/columns-.5)*size[u]*uSign;point[v]=(row/rows-.5)*size[v]*vSign;normal[axis]=sign
        positions.push(...point);normals.push(...normal);uvs.push(col/columns,row/rows)
      }
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const a=start+row*(columns+1)+col,b=a+columns+1;indices.push(a,a+1,b+1,a,b+1,b)}
    }
    face(0,1,2,-1,1,1);face(0,-1,2,1,1,1);face(1,1,0,1,2,-1);face(1,-1,0,1,2,1);face(2,1,0,1,1,1);face(2,-1,0,-1,1,1)
    this.setAttribute('position',new Float32BufferAttribute(positions,3));this.setAttribute('normal',new Float32BufferAttribute(normals,3));this.setAttribute('uv',new Float32BufferAttribute(uvs,2));this.setIndex(indices)
  }
}
export class CylinderGeometry extends BufferGeometry{constructor(top=1,bottom=1,height=1,segments=16,heightSegments=1){super();fromVertexData(this,CreateCylinderVertexData({diameterTop:top*2,diameterBottom:bottom*2,height,tessellation:segments,subdivisions:heightSegments}));}}
export class ConeGeometry extends CylinderGeometry{constructor(radius=1,height=1,segments=16){super(0,radius,height,segments)}}
export class SphereGeometry extends BufferGeometry{constructor(radius=1,width=16,_height=8,_phi=0,phiLength=Math.PI*2,_theta=0,thetaLength=Math.PI){super();fromVertexData(this,CreateSphereVertexData({diameter:radius*2,segments:width,arc:phiLength/(Math.PI*2),slice:thetaLength/Math.PI}));}}
export class IcosahedronGeometry extends SphereGeometry{constructor(radius=1,detail=0){super(radius,detail?8:4,4)}}
export class OctahedronGeometry extends SphereGeometry{constructor(radius=1,_detail=0){super(radius,3,2)}}
export class TorusGeometry extends BufferGeometry{constructor(radius=1,tube=.2,_radial=8,tubular=16){super();fromVertexData(this,CreateTorusVertexData({diameter:radius*2,thickness:tube*2,tessellation:tubular}));this.rotateX(Math.PI/2)}}
export class PlaneGeometry extends BufferGeometry{constructor(w=1,h=1){super();this.setAttribute('position',new Float32BufferAttribute([-w/2,-h/2,0,w/2,-h/2,0,w/2,h/2,0,-w/2,h/2,0],3));this.setAttribute('uv',new Float32BufferAttribute([0,0,1,0,1,1,0,1],2));this.setIndex([0,1,2,0,2,3]);this.computeVertexNormals()}}
export class RingGeometry extends BufferGeometry{constructor(inner=.5,outer=1,segments=32){super();const p:number[]=[],uv:number[]=[],idx:number[]=[];for(let i=0;i<=segments;i++)for(const r of [inner,outer]){const a=i/segments*Math.PI*2;p.push(Math.cos(a)*r,Math.sin(a)*r,0);uv.push(Math.cos(a)*r/(2*outer)+.5,Math.sin(a)*r/(2*outer)+.5)}for(let i=0;i<segments;i++){const n=i*2;idx.push(n,n+1,n+3,n,n+3,n+2)}this.setAttribute('position',new Float32BufferAttribute(p,3));this.setAttribute('uv',new Float32BufferAttribute(uv,2));this.setIndex(idx);this.computeVertexNormals()}}
export class CircleGeometry extends RingGeometry{constructor(radius=1,segments=16){super(0,radius,segments)}}
export class Path{points:Vector2[];constructor(points:Vector2[]=[]){this.points=points.map(point=>point.clone())}moveTo(x:number,y:number){this.points=[new Vector2(x,y)];return this}lineTo(x:number,y:number){this.points.push(new Vector2(x,y));return this}closePath(){return this}}
export class Shape extends Path{holes:Path[]=[]}
export const ShapeUtils={isClockWise:(points:Vector2[])=>points.reduce((sum,p,i)=>sum+(points[(i+1)%points.length].x-p.x)*(points[(i+1)%points.length].y+p.y),0)>0,triangulateShape:(points:Vector2[],holes:Vector2[][])=>{const all=[points,...holes],offsets:number[]=[];let count=points.length;for(const hole of holes){offsets.push(count);count+=hole.length}const indexes=earcut(all.flatMap(r=>r.flatMap(p=>[p.x,p.y])),offsets);return Array.from({length:indexes.length/3},(_,i)=>indexes.slice(i*3,i*3+3))}}
export class ExtrudeGeometry extends BufferGeometry{constructor(shape:Shape,options:{depth?:number;bevelEnabled?:boolean;curveSegments?:number;steps?:number}={}){super();const depth=options.depth??1,rings=[shape.points,...shape.holes.map(h=>h.points)],points=rings.flat(),v:number[]=[],push=(a:number,b:number,c:number,z:number)=>{for(const i of [a,b,c])v.push(points[i].x,points[i].y,z)};for(const[a,b,c]of ShapeUtils.triangulateShape(shape.points,shape.holes.map(h=>h.points))){push(c,b,a,0);push(a,b,c,depth)}for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];v.push(a.x,a.y,0,b.x,b.y,0,b.x,b.y,depth,a.x,a.y,0,b.x,b.y,depth,a.x,a.y,depth)}this.setAttribute('position',new Float32BufferAttribute(v,3));this.setAttribute('uv',new Float32BufferAttribute(new Float32Array(v.length/3*2),2));this.computeVertexNormals()}}
export class LatheGeometry extends BufferGeometry{constructor(points:Vector2[],segments=12){super();const p:number[]=[],uv:number[]=[],idx:number[]=[];for(let j=0;j<=segments;j++)for(let i=0;i<points.length;i++){const a=j/segments*Math.PI*2;p.push(points[i].x*Math.sin(a),points[i].y,points[i].x*Math.cos(a));uv.push(j/segments,i/(points.length-1))}for(let j=0;j<segments;j++)for(let i=0;i<points.length-1;i++){const a=j*points.length+i,b=a+points.length;idx.push(a,b,a+1,b,b+1,a+1)}this.setAttribute('position',new Float32BufferAttribute(p,3));this.setAttribute('uv',new Float32BufferAttribute(uv,2));this.setIndex(idx);this.computeVertexNormals()}}
export function mergeGeometries(parts:BufferGeometry[]){const converted=parts.map(g=>g.toNonIndexed()),result=new BufferGeometry();const names=new Set(converted.flatMap(g=>Object.keys(g.attributes)));for(const name of names){const size=converted.find(g=>g.attributes[name])!.attributes[name].itemSize,total=converted.reduce((n,g)=>n+g.attributes.position.count,0),array=new Float32Array(total*size);let offset=0;for(const g of converted){const a=g.attributes[name];if(a)array.set(a.array,offset);else if(name==='color')array.fill(1,offset,offset+g.attributes.position.count*size);offset+=g.attributes.position.count*size}result.setAttribute(name,new BufferAttribute(array,size))}return result}
export interface MaterialOptions{color?:string|number|Color;emissive?:Color|string|number;emissiveIntensity?:number;roughness?:number;metalness?:number;vertexColors?:boolean;flatShading?:boolean;side?:number;transparent?:boolean;opacity?:number;blending?:number;depthWrite?:boolean;depthTest?:boolean;toneMapped?:boolean;name?:string;uniforms?:Record<string,{value:any}>;defines?:Record<string,unknown>;vertexShader?:string;fragmentShader?:string;wireframe?:boolean}
export class Material{ id=++identity;name='';color=new Color();emissive=new Color(0);emissiveIntensity=1;roughness=.85;metalness=.05;vertexColors=false;flatShading=false;side=FrontSide;transparent=false;opacity=1;blending=NormalBlending;depthWrite=true;depthTest=true;toneMapped=true;wireframe=false;needsUpdate=false;disposed=false;uniforms:Record<string,{value:any}>={};constructor(options:MaterialOptions={}){Object.assign(this,options);this.color=new Color(options.color??0xffffff);this.emissive=new Color(options.emissive??0)}clone(){return new (this.constructor as typeof Material)({...this,color:this.color.clone(),emissive:this.emissive.clone()})}dispose(){this.disposed=true}}
export class MeshStandardMaterial extends Material{}
export class MeshBasicMaterial extends Material{}
export class ShaderMaterial extends Material{}
export class Object3D{
  id=++identity;name='';position=new Vector3();rotation=new Vector3();quaternion=new Quaternion();scale=new Vector3(1,1,1);matrix=new Matrix4();matrixWorld=new Matrix4();children:Object3D[]=[];parent:Object3D|null=null;visible=true;castShadow=false;receiveShadow=false;frustumCulled=true;userData:Record<string,any>={};private lastRotation='0:0:0'
  add(...nodes:Object3D[]){for(const node of nodes){node.parent?.remove(node);node.parent=this;this.children.push(node)}return this}remove(...nodes:Object3D[]){for(const node of nodes){const i=this.children.indexOf(node);if(i>=0)this.children.splice(i,1);node.parent=null}return this}
  traverse(fn:(node:Object3D)=>void){fn(this);for(const node of this.children)node.traverse(fn)}traverseVisible(fn:(node:Object3D)=>void){if(!this.visible)return;fn(this);for(const node of this.children)node.traverseVisible(fn)}getObjectByName(name:string):Object3D|undefined{if(this.name===name)return this;for(const node of this.children){const found=node.getObjectByName(name);if(found)return found}return undefined}
  updateMatrix(){const rotation=this.rotation.toArray().join(':');if(rotation!==this.lastRotation)this.quaternion.setFromEuler(this.rotation);this.lastRotation=rotation;this.quaternion.changed=false;this.matrix.compose(this.position,this.quaternion,this.scale)}
  updateMatrixWorld(_force=false){this.updateMatrix();this.matrixWorld.copy(this.parent?new Matrix4().multiplyMatrices(this.parent.matrixWorld,this.matrix):this.matrix);for(const child of this.children)child.updateMatrixWorld(_force)}
  getWorldPosition(target:Vector3){this.updateMatrixWorld(true);return target.setFromMatrixPosition(this.matrixWorld)}
  clone(recursive=true):Object3D{const target=this instanceof Mesh?new Mesh(this.geometry,this.material):new Object3D();target.name=this.name;target.position.copy(this.position);target.rotation.copy(this.rotation);target.quaternion.copy(this.quaternion);target.scale.copy(this.scale);target.visible=this.visible;target.userData={...this.userData};if(recursive)for(const child of this.children)target.add(child.clone(true));return target}
}
export class Group extends Object3D{}
export class Scene extends Group{background:Color|null=null}
export class Mesh extends Object3D{constructor(public geometry=new BufferGeometry(),public material:Material|Material[]=new Material()){super()}}
export class LineSegments extends Mesh{}
export class InstancedMesh extends Mesh{count:number;instanceMatrix:InstancedBufferAttribute;instanceColor:InstancedBufferAttribute|null=null;disposed=false;constructor(g:BufferGeometry,m:Material|Material[],capacity:number){super(g,m);this.count=capacity;this.instanceMatrix=new InstancedBufferAttribute(new Float32Array(capacity*16),16)}setMatrixAt(i:number,m:Matrix4){this.instanceMatrix.array.set(m.elements,i*16)}getMatrixAt(i:number,m:Matrix4){return m.fromArray(this.instanceMatrix.array,i*16)}setColorAt(i:number,c:Color){this.instanceColor??=new InstancedBufferAttribute(new Float32Array(this.instanceMatrix.count*3).fill(1),3);this.instanceColor.setXYZ(i,c.r,c.g,c.b)}dispose(){this.disposed=true}}
export class HemisphereLight extends Object3D{color:Color;groundColor:Color;constructor(sky:string,ground:string,public intensity=1){super();this.color=new Color(sky);this.groundColor=new Color(ground)}}
export class DirectionalLight extends Object3D{color:Color;target=new Object3D();constructor(color:string,public intensity=1){super();this.color=new Color(color)}}
export class PointLight extends Object3D{color:Color;constructor(color:string,public intensity=1,public distance=0,public decay=2){super();this.color=new Color(color)}}
export class Camera extends Object3D{projectionMatrix=new Matrix4();projectionMatrixInverse=new Matrix4();up=new Vector3(0,0,1)}
export class PerspectiveCamera extends Camera{target=new Vector3();constructor(public fov=40,public aspect=1,public near=.1,public far=5000){super()}updateProjectionMatrix(){}lookAt(target:Vector3){this.target.copy(target)}}
export class Sphere{constructor(public center=new Vector3(),public radius=1){}}
export class Frustum{private matrix=new Matrix4();setFromProjectionMatrix(m:Matrix4){this.matrix.copy(m);return this}intersectsSphere(s:Sphere){const e=this.matrix.elements;for(const [a,sign]of [[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]]){const x=e[3]+sign*e[a],y=e[7]+sign*e[a+4],z=e[11]+sign*e[a+8],w=e[15]+sign*e[a+12];if(x*s.center.x+y*s.center.y+z*s.center.z+w < -s.radius*Math.hypot(x,y,z))return false}return true}}
export class Box3{constructor(public min=new Vector3(Infinity,Infinity,Infinity),public max=new Vector3(-Infinity,-Infinity,-Infinity)){}expandByPoint(p:Vector3){this.min.min(p);this.max.max(p);return this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getSize(target:Vector3){return this.isEmpty()?target.set(0,0,0):target.copy(this.max).sub(this.min)}getCenter(target:Vector3){return this.isEmpty()?target.set(0,0,0):target.copy(this.max).add(this.min).multiplyScalar(.5)}setFromObject(root:Object3D){root.updateMatrixWorld(true);root.traverse(node=>{if(node instanceof Mesh){const p=node.geometry.attributes.position;for(let i=0;p&&i<p.count;i++)this.expandByPoint(new Vector3().fromBufferAttribute(p,i).applyMatrix4(node.matrixWorld))}});return this}}
export class GridHelper extends Mesh{constructor(size:number,_divisions:number,color:string,_minor:string){super(new PlaneGeometry(size,size).rotateX(-Math.PI/2),new MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:.2}))}}

// Imported animation tracks remain data; the Babylon asset bridge applies the
// selected actions to native AnimationGroups and preserves their skeletons.
export class KeyframeTrack{constructor(public name:string,public times:number[]=[],public values:number[]=[]){}clone(){return new KeyframeTrack(this.name,[...this.times],[...this.values])}}
export class QuaternionKeyframeTrack extends KeyframeTrack{}
export class VectorKeyframeTrack extends KeyframeTrack{}
export class AnimationClip{additive=false;constructor(public name:string,public duration:number,public tracks:KeyframeTrack[]){}}
export class AnimationAction{time=0;weight=1;playing=false;clampWhenFinished=false;constructor(public clip:AnimationClip){}setLoop(_loop:number,_count:number){return this}setEffectiveWeight(w:number){this.weight=w;return this}play(){this.playing=true;return this}stop(){this.playing=false;return this}reset(){this.time=0;return this}}
export class AnimationMixer{private actions:AnimationAction[]=[];constructor(private root:Object3D){}clipAction(clip:AnimationClip){const action=new AnimationAction(clip);this.actions.push(action);return action}stopAllAction(){for(const action of this.actions)action.stop()}update(_dt:number){this.root.userData.animationState=this.actions.filter(a=>a.playing).map(a=>({name:a.clip.name,time:a.time,weight:a.weight,clip:a.clip}))}}
export const AnimationUtils={makeClipAdditive:(clip:AnimationClip,_frame:number,reference:AnimationClip)=>{
  clip.additive=true
  for(const track of clip.tracks){const rest=reference.tracks.find(value=>value.name===track.name);if(!rest)continue;const quaternion=track.name.endsWith('.quaternion'),size=quaternion?4:3
    for(let i=0;i<track.values.length;i+=size){if(quaternion){const inverse=new Quaternion(-rest.values[0],-rest.values[1],-rest.values[2],rest.values[3]),value=inverse.multiply(new Quaternion(track.values[i],track.values[i+1],track.values[i+2],track.values[i+3]));track.values.splice(i,4,...value.toArray())}else for(let k=0;k<size;k++)track.values[i+k]-=rest.values[k]}
  }
  return clip
}}
