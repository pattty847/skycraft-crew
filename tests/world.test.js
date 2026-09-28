import test from 'node:test';
import assert from 'node:assert/strict';
import { World, generateWorld } from '../src/world.js';
import { meshChunk, cornerOcclusion } from '../src/mesher.js';
test('terrain is deterministic and contains all natural materials',()=>{const a=generateWorld(),b=generateWorld();assert.deepEqual(a.blocks,b.blocks);for(let id=1;id<=8;id++)assert.ok(a.blocks.includes(id));});
test('mesher removes shared faces, including chunk boundaries',()=>{const w=new World();w.set(15,2,2,3);w.set(16,2,2,3);assert.equal(meshChunk(w,0,0,0).indices.length,30);assert.equal(meshChunk(w,1,0,0).indices.length,30);});
test('edge edits invalidate neighboring chunks',()=>{const w=new World();w.set(15,2,2,3);assert.ok(w.dirty.has('0,0,0'));assert.ok(w.dirty.has('1,0,0'));});
test('corner edits invalidate diagonal chunks, which ambient occlusion reads',()=>{const w=new World();w.set(15,15,15,3);for(const key of ['1,1,1','0,1,1','1,0,0'])assert.ok(w.dirty.has(key),key);});
test('ambient occlusion darkens corners next to blocks and leaves open faces bright',()=>{
 const w=new World(),top=[0,1,0];w.set(4,4,4,3);
 const light=()=>{const m=meshChunk(w,0,0,0);return m.colors.filter((_,i)=>i%3===0);};
 assert.ok(light().every(v=>v>.59),'a lone block has no occlusion');
 w.set(5,5,4,3);w.set(4,5,5,3);
 assert.equal(cornerOcclusion(w,4,4,4,top,[1,1,1]),0,'two edges close the corner');
 assert.equal(cornerOcclusion(w,4,4,4,top,[0,1,0]),3,'the far corner stays open');
});
