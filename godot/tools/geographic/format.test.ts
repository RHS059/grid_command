import assert from 'node:assert/strict'
import test from 'node:test'
import { chunks, encodeTile, MAGIC } from './format'

test('binary format preserves browser coordinate handedness and values',()=>{
  const encoded=encodeTile({z:12,x:715,y:1652},{roads:{positions:[100,200,5,200,200,5,100,300,5],indices:[0,1,2]}})
  assert.equal(encoded.bytes.subarray(0,8).toString(),MAGIC)
  assert.equal(encoded.bytes.readUInt32LE(20),1)
  assert.equal(encoded.bytes.readUInt32LE(28),2)
  assert.equal(encoded.bytes.readFloatLE(44),1)
  assert.ok(Math.abs(encoded.bytes.readFloatLE(48)-0.05)<1e-7)
  assert.equal(encoded.bytes.readFloatLE(52),-2)
  assert.equal(encoded.bytes.length,92)
})
test('mesh pieces bound upload size without losing triangles or colors',()=>{
  const batch={positions:[0,0,0,1,0,0,0,1,0],indices:Array.from({length:60000},(_,i)=>i%3),colors:[1,0,0,1,0,1,0,1,0,0,1,1]}
  const parts=chunks(batch)
  assert.equal(parts.length,3)
  assert.equal(parts.reduce((n,p)=>n+p.indices.length,0),batch.indices.length)
  assert.ok(parts.every(p=>p.indices.length<=24576 && p.colors!.length===p.positions.length/3*4))
})
test('invalid source geometry is rejected before publication',()=>{
  assert.throws(()=>chunks({positions:[0,0,NaN],indices:[0,0,0]}),/Nonfinite/)
  assert.throws(()=>chunks({positions:[0,0,0],indices:[0,1,2]}),/Invalid vertex/)
})
