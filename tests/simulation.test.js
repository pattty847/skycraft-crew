import test from 'node:test';
import assert from 'node:assert/strict';
import { World, generateWorld } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { raycast } from '../src/raycast.js';
import { createActions } from '../src/actions.js';
function setup(){const w=new World();for(let x=30;x<40;x++)for(let z=35;z<44;z++)w.set(x,22,z,3);const s=new Simulation(w),e=s.spawn();return {w,s,e};}
test('action API emits isolated intents, never mutates a world',()=>{const out=[],a=createActions('a',v=>out.push(v));const p={x:1,y:2,z:3};a.move(p);p.x=99;a.jump();a.lookAt(p);a.breakBlock({x:1,y:1,z:1});a.placeBlock({x:2,y:1,z:1},9);a.say('hello');assert.deepEqual(out.map(a=>a.type),['move','jump','lookAt','breakBlock','placeBlock','say']);assert.equal(out[0].dir.x,1);assert.throws(()=>a.move({x:NaN,y:0,z:0}));});
test('DDA finds face and adjacent placement cell along negative and zero axes',()=>{const w=new World();w.set(4,4,4,3);const h=raycast(w,{x:8,y:4.5,z:4.5},{x:-1,y:0,z:0},8);assert.deepEqual(h.pos,{x:4,y:4,z:4});assert.deepEqual(h.normal,{x:1,y:0,z:0});assert.equal(raycast(w,{x:8,y:4.5,z:4.5},{x:1,y:0,z:0},8),null);});
test('gravity, jumping and solid walls constrain entity motion',()=>{const {w,s,e}=setup();for(let i=0;i<60;i++)s.tick(1/60);assert.ok(e.grounded);const y=e.position.y;e.actions.jump();s.tick(1/60);assert.ok(e.position.y>y);for(let i=0;i<120;i++)s.tick(1/60);assert.ok(Math.abs(e.position.y-y)<.01);for(let z=35;z<44;z++)for(let y=23;y<27;y++)w.set(36,y,z,3);for(let i=0;i<120;i++){e.actions.move({x:1,y:0,z:0});s.tick(1/60);}assert.ok(e.position.x<=35.721);});
test('held mining respects hardness, cancellation and inventory conservation',()=>{const {w,s,e}=setup(),p={x:35,y:23,z:39};w.set(p.x,p.y,p.z,3);for(let i=0;i<40;i++){e.actions.breakBlock(p);s.tick(1/60);}assert.equal(w.get(35,23,39),3);s.tick(1/60);assert.equal(e.breaking,null);for(let i=0;i<91;i++){e.actions.breakBlock(p);s.tick(1/60);}assert.equal(w.get(35,23,39),0);assert.equal(e.inventory[3],1);});
test('placement rejects self intersection, remote edits and unsupported blocks',()=>{const {w,s,e}=setup();const n=e.inventory[9];e.actions.placeBlock({x:34,y:23,z:39},9);e.actions.placeBlock({x:1,y:1,z:1},9);s.tick(1/60);assert.equal(e.inventory[9],n);e.actions.placeBlock({x:35,y:23,z:39},9);s.tick(1/60);assert.equal(w.get(35,23,39),9);assert.equal(e.inventory[9],n-1);});
test('recipe exchanges one wood for exactly four planks; respawn retains items',()=>{const {s,e}=setup();const n=e.inventory[9];assert.ok(s.craftPlanks(e));assert.equal(e.inventory[5],2);assert.equal(e.inventory[9],n+4);e.position.y=-30;s.tick(1/60);assert.ok(e.position.y>0);assert.equal(e.inventory[9],n+4);});
test('a second Entity uses the same actions and cannot place inside another Entity',()=>{const {s,e,w}=setup();const other=s.spawn('future-agent');other.position={x:35.5,y:23,z:39.5};e.actions.placeBlock({x:35,y:23,z:39},9);s.tick(1/60);assert.equal(w.get(35,23,39),0);other.actions.move({x:1,y:0,z:0});s.tick(1/60);assert.ok(other.position.x>35.5);});
test('block actions cannot pass through solid walls',()=>{const {s,e,w}=setup();w.set(35,24,39,3);w.set(36,24,39,5);for(let i=0;i<100;i++){e.actions.breakBlock({x:36,y:24,z:39});s.tick(1/60);}assert.equal(w.get(36,24,39),5);assert.equal(s.place(e,{x:37,y:24,z:39},9),false);});

test('the edit policy hook can refuse breaking and placing for one entity only',()=>{
 const w=generateWorld(),sim=new Simulation(w),a=sim.spawn('a'),b=sim.spawn('b');
 const pos={x:33,y:w.top(33,39),z:39},id=w.get(pos.x,pos.y,pos.z);
 sim.canEdit=(e,p,kind)=>!(e.id==='a'&&p.x===pos.x&&p.y===pos.y&&p.z===pos.z);
 for(let i=0;i<120;i++){a.actions.breakBlock(pos);sim.tick(1/60);}assert.equal(w.get(pos.x,pos.y,pos.z),id);assert.equal(a.breaking,null);
 for(let i=0;i<120;i++){b.actions.breakBlock(pos);sim.tick(1/60);}assert.equal(w.get(pos.x,pos.y,pos.z),0);
 a.actions.placeBlock(pos,9);sim.tick(1/60);assert.equal(w.get(pos.x,pos.y,pos.z),0);
 b.actions.placeBlock(pos,9);sim.tick(1/60);assert.equal(w.get(pos.x,pos.y,pos.z),9);
});

test('spawning never lands on a build or a tree, even when one covers the spawn point',()=>{
 const w=generateWorld(),sim=new Simulation(w);
 for(let x=31;x<38;x++)for(let z=36;z<43;z++)w.set(x,w.top(x,z)+3,z,9);
 const p=sim.findSpawn();assert.ok([1,2,3,4].includes(w.get(Math.floor(p.x),p.y-1,Math.floor(p.z))));
});

test('crafting is an intent any controller can send, checked by the simulation',()=>{
 const w=generateWorld(),sim=new Simulation(w),e=sim.spawn('c');e.inventory[5]=1;e.inventory[9]=0;
 e.actions.craft('planks');sim.tick(1/60);assert.equal(e.inventory[9],4);assert.equal(e.inventory[5],0);
 e.actions.craft('planks');sim.tick(1/60);assert.equal(e.inventory[9],4,'no wood, no planks');
 assert.throws(()=>e.actions.craft('diamonds'));
});
