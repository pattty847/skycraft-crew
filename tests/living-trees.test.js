import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { B, BLOCKS, BLOCK_COUNT, isPlant } from '../src/blocks.js';
import { World, growTree, generateWorld, islandAt } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { Ecology, woodNearby } from '../server/ecology.js';
import { Room } from '../server/room.js';
import { collides } from '../src/physics.js';
import { standable } from '../server/navigation/pathfinder.js';
import { raycast } from '../src/raycast.js';
import { meshChunk } from '../src/mesher.js';

function small(){const world=new World(),simulation=new Simulation(world),extensions=new Map(),room={world,simulation,extend(name,ext){extensions.set(name,ext);}};const ecology=new Ecology(room);const set=world.set.bind(world);world.set=(x,y,z,id)=>{const before=world.get(x,y,z),ok=set(x,y,z,id);if(ok)ecology.changed({x,y,z},before,id);return ok;};simulation.onPlace=(p,id)=>ecology.placed(p,id);return {world,simulation,ecology,room,extensions};}
function ground(w,x,z,y=20){w.set(x,y,z,B.GRASS);return {x,y:y+1,z};}
function savedRoom(t){const dir=mkdtempSync(join(tmpdir(),'sky-living-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return new Room(dir);}

test('new ids append to old inventory and distinguish solid blocks from plants',()=>{
 assert.deepEqual(BLOCKS.slice(12,17).map(b=>b.name),['Sapling','Red mushroom','Brown mushroom','Yellow flower','White flower']);
 assert.equal(BLOCK_COUNT,26);assert.ok(BLOCKS.slice(1,12).every(b=>b.kind==='solid'));assert.ok(BLOCKS.slice(12,17).every(b=>b.kind==='plant'));
});
test('orphan natural leaves decay singly; supported and placed leaves survive',()=>{
 const {world:w,ecology:e}=small(),orphan={x:34,y:25,z:34},placed={x:36,y:25,z:34},supported={x:38,y:25,z:34};
 w.set(orphan.x,orphan.y,orphan.z,B.LEAVES);w.set(placed.x,placed.y,placed.z,B.LEAVES);e.placed(placed,B.LEAVES);
 w.set(supported.x,24,supported.z,B.WOOD);w.set(supported.x,supported.y,supported.z,B.LEAVES);
 assert.equal(woodNearby(w,supported),true);assert.equal(woodNearby(w,orphan),false);
 e.leaves.set(w.index(orphan.x,orphan.y,orphan.z),0);e.leaves.set(w.index(supported.x,supported.y,supported.z),0);e.leaves.set(w.index(placed.x,placed.y,placed.z),0);
 e.decayOne();assert.equal(w.get(orphan.x,orphan.y,orphan.z),0);assert.equal(w.get(placed.x,placed.y,placed.z),B.LEAVES);assert.equal(w.get(supported.x,supported.y,supported.z),B.LEAVES);
});
test('a complete small canopy stays attached until its trunk is removed',()=>{
 const {world:w,ecology:e}=small();ground(w,45,45);growTree(w,45,21,45,4);
 const leafCount=()=>Array.from(w.blocks).filter(id=>id===B.LEAVES).length;
 const initial=leafCount();assert.ok(initial>20);for(const index of e.leaves.keys())e.leaves.set(index,0);e.decayOne();assert.equal(leafCount(),initial);
 for(let y=21;y<25;y++)w.set(45,y,45,B.AIR);
 for(let i=0;i<80;i++)e.tick(1/60);assert.ok(e.leaves.size>0);for(const index of e.leaves.keys())e.leaves.set(index,0);
 e.decayOne();assert.equal(leafCount(),initial-1);
});
test('saplings require dirt or grass and clear air, then grow only into clear space',()=>{
 const {world:w,simulation:s,ecology:e}=small(),player=s.spawn('gardener');player.position={x:30.5,y:21,z:30.5};
 const p=ground(w,32,30);player.inventory[B.SAPLING]=3;
 assert.equal(s.place(player,p,B.SAPLING),true);assert.equal(w.get(p.x,p.y,p.z),B.SAPLING);
 const above={x:33,y:21,z:30};w.set(above.x,20,above.z,B.STONE);assert.equal(s.place(player,above,B.SAPLING),false);
 w.set(above.x,20,above.z,B.DIRT);w.set(above.x,22,above.z,B.STONE);assert.equal(s.place(player,above,B.SAPLING),false);
 w.set(32,25,30,B.STONE);e.saplings.set(w.index(p.x,p.y,p.z),0);e.tick(1);assert.equal(w.get(p.x,p.y,p.z),B.SAPLING);
 w.set(32,25,30,B.AIR);w.set(above.x,22,above.z,B.AIR);player.position.x=20.5;e.saplings.set(w.index(p.x,p.y,p.z),e.clock);e.tick(.3);assert.equal(w.get(p.x,p.y,p.z),B.WOOD);
});
test('plants are passable, cannot support a player or block, and remain raycast targets',()=>{
 const {world:w,simulation:s}=small(),p=ground(w,34,34);w.set(p.x,p.y,p.z,B.RED_MUSHROOM);
 assert.equal(collides(w,{x:34.5,y:21,z:34.5}),false);assert.equal(standable(w,{x:34.5,y:21,z:34.5}),true);
 assert.equal(standable(w,{x:34.5,y:22,z:34.5}),false);
 assert.equal(raycast(w,{x:32.5,y:21.5,z:34.5},{x:1,y:0,z:0},5)?.id,B.RED_MUSHROOM);
 const player=s.spawn('builder');player.position={x:33.5,y:21,z:34.5};player.inventory[B.STONE]=1;
 assert.equal(s.place(player,{x:34,y:22,z:34},B.STONE),false);
 const mesh=meshChunk(w,2,1,2);assert.ok(mesh.indices.length>mesh.solidCount+mesh.lampCount);
});
test('ecology state and a blocked sapling survive a room save and restart',t=>{
 const room=savedRoom(t),w=room.world,p={x:60,y:21,z:60};w.set(p.x,p.y-1,p.z,B.GRASS);w.set(p.x,p.y,p.z,B.SAPLING);w.set(p.x,p.y+4,p.z,B.STONE);
 const index=w.index(p.x,p.y,p.z);room.ecology.saplings.set(index,0);room.ecology.tick(1);assert.equal(w.get(p.x,p.y,p.z),B.SAPLING);
 room.ecology.placedLeaves.add(w.index(20,25,20));room.save();const next=new Room(room.directory);
 assert.equal(next.world.get(p.x,p.y,p.z),B.SAPLING);assert.ok(next.ecology.saplings.has(index));assert.ok(next.ecology.placedLeaves.has(w.index(20,25,20)));
 next.world.set(p.x,p.y+4,p.z,B.AIR);next.ecology.saplings.set(index,next.ecology.clock);next.ecology.tick(.3);assert.equal(next.world.get(p.x,p.y,p.z),B.WOOD);
});
test('forage migration fills old decoration spots once and leaves occupied cells alone',t=>{
 const room=savedRoom(t),fresh=generateWorld(),spots=[];
 for(let i=0;i<fresh.blocks.length&&spots.length<2;i++)if(isPlant(fresh.blocks[i]))spots.push(fresh.position(i));
 const [empty,occupied]=spots;assert.ok(empty&&occupied);room.save();const d=JSON.parse(readFileSync(room.file)),blocks=Buffer.from(d.blocks,'base64');
 blocks[room.world.index(empty.x,empty.y,empty.z)]=0;blocks[room.world.index(occupied.x,occupied.y,occupied.z)]=B.PLANKS;
 d.blocks=blocks.toString('base64');d.extensions.terrain.frontier=2;delete d.extensions.ecology;writeFileSync(room.file,JSON.stringify(d));
 const migrated=new Room(room.directory);assert.equal(migrated.world.get(empty.x,empty.y,empty.z),fresh.get(empty.x,empty.y,empty.z));assert.equal(migrated.world.get(occupied.x,occupied.y,occupied.z),B.PLANKS);
 assert.equal(readdirSync(room.directory).filter(name=>name.startsWith('before-forage-')).length,1);migrated.save();new Room(room.directory);assert.equal(readdirSync(room.directory).filter(name=>name.startsWith('before-forage-')).length,1);
});
test('forage respawn obeys a per-island cap',()=>{
 const {world:w,ecology:e}=small(),island='Origin Island';e.counts.set(island,30);
 // Make natural grass available throughout the island; a capped island never gains forage.
 for(let x=18;x<42;x++)for(let z=18;z<42;z++){const top=e.natural.top(x,z),y=isPlant(e.natural.get(x,top,z))?top-1:top;if(e.natural.get(x,y,z)===B.GRASS){w.set(x,y,z,B.GRASS);w.set(x,y+1,z,B.AIR);}}
 const before=Array.from(w.blocks).filter(isPlant).length;
 for(let i=0;i<400;i++){e.step+=4;e.respawn();}
 assert.equal(Array.from(w.blocks).filter(isPlant).length,before);assert.equal(e.counts.get(island),30);
});
