import test from 'node:test';
import assert from 'node:assert/strict';
import { saveGame,loadGame } from '../src/storage.js';
import { generateWorld } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
const memory=()=>{let value=null;return {getItem:()=>value,setItem:(k,v)=>value=v};};
test('save roundtrip retains edited blocks, inventory, selection, position and time',()=>{const w=generateWorld(),e=new Simulation(w).spawn(),storage=memory();w.set(30,25,30,9);e.inventory[3]=17;e.selected=3;assert.ok(saveGame(w,e,.8,storage).ok);const loaded=loadGame(storage);assert.equal(loaded.status,'loaded');assert.deepEqual(loaded.world.blocks,w.blocks);assert.deepEqual(loaded.inventory,e.inventory);assert.deepEqual(loaded.position,e.position);assert.equal(loaded.phase,.8);assert.equal(loaded.selected,3);});
test('corrupt saves are detected without overwriting them',()=>{const storage=memory();storage.setItem('', '{broken');assert.equal(loadGame(storage).status,'error');assert.equal(storage.getItem(),'{broken');});
test('storage failures produce recoverable results',()=>{const w=generateWorld(),e=new Simulation(w).spawn();assert.equal(saveGame(w,e,.2,{setItem(){throw Error('quota');}}).ok,false);});
