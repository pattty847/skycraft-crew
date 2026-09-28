import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { MineTripTask, visibleOre } from '../server/tasks/mine-trip.js';
import skill from '../server/skills/mine-trip.js';
import { flatWorld,runTask } from './helpers.js';
function fixture(){const world=flatWorld({x:[28,46],z:[34,44],y:10});const simulation=new Simulation(world),e=simulation.spawn('codex-companion'),player=simulation.spawn('player');e.position={x:34.5,y:11,z:39.5};player.position={x:31.5,y:11,z:39.5};simulation.tick(1/60);return {world,simulation,e,player};}
const run=(task,room)=>runTask(room,task,{limit:15000});
test('mining trip walks, mines only selected visible ore and verifies delivery',()=>{
 const room=fixture();for(let z=37;z<=39;z++)room.world.set(42,11,z,7);const task=new MineTripTask(room,room.e,{requesterId:'player',blockId:7,count:3});const before=room.world.blocks.slice();const result=run(task,room);assert.ok(result?.ok,JSON.stringify(result));assert.equal(room.player.inventory[7],3);assert.equal(room.e.inventory[7],0);assert.equal(result.mined.length,3);
 for(let i=0;i<before.length;i++)if(before[i]!==room.world.blocks[i])assert.equal(before[i],7);
});
test('mining trip ignores hidden and protected ore, and never digs under a player',()=>{
 const room=fixture();room.world.set(35,10,39,7);room.world.set(40,11,39,7);room.world.set(40,12,39,3);for(const [x,z] of [[39,39],[41,39],[40,38],[40,40]])room.world.set(x,11,z,3);
 room.simulation.canEdit=(e,p)=>p.x!==35;assert.equal(visibleOre(room,room.e,7).length,0);const task=new MineTripTask(room,room.e,{requesterId:'player',blockId:7,count:1});assert.equal(run(task,room).ok,false);
});
test('changing a claim during walking prevents mining; stop and disconnect finish tasks',()=>{
 const room=fixture();room.e.inventory[19]=1;room.world.set(42,11,39,8);const task=new MineTripTask(room,room.e,{requesterId:'player',blockId:8,count:1});task.tick(1/60);room.simulation.canEdit=()=>false;run(task,room);assert.equal(room.world.get(42,11,39),8);
 const stopped=new MineTripTask(room,room.e,{requesterId:'player',blockId:8,count:1});stopped.cancel();assert.equal(stopped.result.ok,false);
 const left=new MineTripTask(room,room.e,{requesterId:'player',blockId:8,count:1});room.simulation.entities.delete('player');left.tick(1/60);assert.match(left.result.message,/disconnected/);
});
test('mining trip rejects other blocks, invalid counts and unsupported mode proposals',()=>{for(const a of [{blockId:9,count:3},{blockId:7,count:0},{blockId:8,count:6},{blockId:7,count:1.5}])assert.throws(()=>skill.validate(a));assert.deepEqual(skill.validate({blockId:8,count:3}),{type:'mine-trip',blockId:8,count:3});});
