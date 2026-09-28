import test from 'node:test';
import assert from 'node:assert/strict';
import { Hotbar, HOTBAR_SIZE } from '../src/hotbar.js';
import { BLOCK_COUNT, B } from '../src/blocks.js';
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
const inv=counts=>{const a=new Uint16Array(BLOCK_COUNT);for(const [id,n] of Object.entries(counts))a[id]=n;return a;};
test('new items fill empty slots; a used-up stack keeps its slot until the room is needed',()=>{
 const bar=new Hotbar(store(),'k');
 bar.sync(inv({[B.WOOD]:3,[B.PLANKS]:24}));
 assert.deepEqual(bar.slots.slice(0,2),[B.WOOD,B.PLANKS]);assert.equal(bar.slots.length,HOTBAR_SIZE);
 bar.sync(inv({[B.PLANKS]:24}));assert.equal(bar.slots[0],B.WOOD,'wood ran out but keeps its slot');
 const lots={[B.PLANKS]:1};for(const id of [2,3,4,6,7,8,10,11])lots[id]=1;// nine different items, no wood
 bar.sync(inv(lots));
 assert.equal(bar.slots.includes(B.WOOD),false,'the empty wood slot was reused once the bar filled up');assert.equal(new Set(bar.slots).size,HOTBAR_SIZE);
});
test('putting an item from the Bag in a slot swaps it with where it was; empty slots mean empty hands',()=>{
 const bar=new Hotbar(store(),'k'),bag=inv({[B.WOOD]:1,[B.PLANKS]:1,[B.STONE]:5});bar.sync(bag);
 const [a,b]=[bar.slots[0],bar.slots[1]];bar.assign(0,b);
 assert.deepEqual(bar.slots.slice(0,2),[b,a],'swapped');
 bar.select(8);const hands=bar.held(bag);assert.equal(bag[hands],0,'an empty slot holds nothing you carry');
 bar.select(-1);assert.equal(bar.index,8,'selection wraps');bar.select(9);assert.equal(bar.index,0);
});
test('the layout is remembered per key and ignores junk',()=>{
 const s=store(),bar=new Hotbar(s,'sky:hotbar:me');bar.sync(inv({[B.CLAY]:2}));bar.select(3);
 const again=new Hotbar(s,'sky:hotbar:me');assert.deepEqual(again.slots,bar.slots);assert.equal(again.index,3);
 s.setItem('bad',JSON.stringify({slots:[-4,'x',999,5],index:77}));const junk=new Hotbar(s,'bad');
 assert.deepEqual(junk.slots.slice(0,4),[0,0,0,5]);assert.equal(junk.index,0);
 assert.doesNotThrow(()=>new Hotbar(null,'k').save(),'no storage is fine');
});
