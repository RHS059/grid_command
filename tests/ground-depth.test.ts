import test from 'node:test'
import assert from 'node:assert/strict'
import { Engine } from '@babylonjs/core/Engines/engine'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { BabylonRuntime } from '../lib/game/babylon-runtime'
import { cameraClipPlanes } from '../lib/game/geo-map'
import { GeographicTiles, clippedTriangleRange, terrainTriangleHeightAt } from '../lib/game/geo-tiles'
import * as D from '../lib/game/scene-data'

test('terrain queries interpolate in the rendered triangle in world space',()=>{
  const a={x:0,y:0,z:2},b={x:2,y:.1,z:18},c={x:.1,y:2,z:30}
  assert.equal(terrainTriangleHeightAt(a,b,c,a),2)
  assert.ok(Math.abs(terrainTriangleHeightAt(a,b,c,{x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3})!-50/3)<1e-12)
  assert.equal(terrainTriangleHeightAt(a,b,c,{x:2,y:2}),undefined)
})

test('footprint ranges interpolate boundary crossings without using outside peaks',()=>{
  const range=clippedTriangleRange([{x:-10,y:0,z:100},{x:10,y:0,z:0},{x:0,y:10,z:0}],{minX:0,maxX:5,minY:0,maxY:5})
  assert.deepEqual(range,{high:50,low:0})
})

test('close map views use enough near-plane separation for graded surfaces',()=>{
  const close=cameraClipPlanes(600),overview=cameraClipPlanes(15000)
  assert.equal(close.near,6);assert.equal(close.far,20000)
  assert.equal(overview.near,150);assert.equal(overview.far,120000)
  assert.ok(close.far/close.near<20000)
  const depth=(z:number)=>close.far/(close.far-close.near)-close.far*close.near/((close.far-close.near)*z)
  assert.ok((depth(600.015)-depth(600))*2**24>2)
})

test('Babylon materials preserve authored depth testing and writing',()=>{
  const engine=new NullEngine(),runtime=new (BabylonRuntime as unknown as new(canvas:HTMLCanvasElement,engine:NullEngine)=>BabylonRuntime)({dataset:{}} as HTMLCanvasElement,engine)
  try{
    const scene=new D.Scene(),source=new D.MeshBasicMaterial({depthTest:false,depthWrite:true}),mesh=new D.Mesh(new D.BoxGeometry(),source);scene.add(mesh);runtime.sync(scene)
    const material=runtime.scene.materials.find(item=>item.name===`material-${source.id}`);assert.ok(material instanceof PBRMaterial)
    assert.equal(material.depthFunction,Engine.ALWAYS);assert.equal(material.disableDepthWrite,true)
    source.depthTest=true;runtime.sync(scene);assert.equal(material.depthFunction,Engine.LEQUAL);assert.equal(material.disableDepthWrite,false)
  }finally{runtime.dispose()}
})

// Exercise the actual range query, including a missing tile between ready corners.
test('a complete initial footprint includes interior peaks and excludes neighboring terrain',async()=>{
  const { MercatorCoordinate, tileAt }=await import('../lib/game/geography')
  const { ORIGIN, toPoint }=await import('../lib/game/theater')
  const address=tileAt(ORIGIN,14),size=2**address.z
  const point=(x:number,y:number)=>{const ll=new MercatorCoordinate(x/size,y/size).toLngLat();return toPoint(ll.lng,ll.lat)}
  const tiles=new GeographicTiles({} as ConstructorParameters<typeof GeographicTiles>[0],()=>{})
  const loaded=(tiles as unknown as {tiles:Map<string,unknown>}).tiles
  const add=(x:number,z:number)=>{
    const nw=point(x,address.y),ne=point(x+1,address.y),sw=point(x,address.y+1),se=point(x+1,address.y+1)
    const positions=[nw.x,nw.y,z,ne.x,ne.y,z,sw.x,sw.y,z,se.x,se.y,z]
    loaded.set(String(x),{address:{...address,x},dem:{},mesh:{getVerticesData:()=>positions,getIndices:()=>[0,2,1,1,2,3]}})
  }
  const nw=point(address.x+.2,address.y+.2),se=point(address.x+2.8,address.y+.8)
  const bounds={minX:nw.x,maxX:se.x,minY:se.y,maxY:nw.y}
  add(address.x,1);add(address.x+2,1)
  assert.equal(tiles.elevationRange(bounds),undefined)
  add(address.x+1,70);add(address.x+3,300)
  assert.deepEqual(tiles.elevationRange(bounds),{high:70,low:1})
})
