import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { B } from '../src/blocks.js';
import { World } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { Room } from '../server/room.js';
import { JobBoard } from '../server/jobs/board.js';
import { SurfaceGatherTask } from '../server/tasks/surface-gather.js';
import gather from '../server/skills/gather.js';
import { SupplyBuildTask } from '../server/jobs/supply-build.js';
import { planBuild } from '../server/building/planner.js';
import { previewCells } from '../src/blueprints.js';
import { Companion,PERSONAS } from '../server/companion.js';
import { Foreman } from '../server/jobs/foreman.js';
import { STOCKPILE_POSITION } from '../server/stockpile.js';
import planSkill from '../server/skills/plan.js';
const run=(room,task,limit=60*120)=>{for(let i=0;i<limit&&!task.result;i++){task.tick(1/60);room.simulation.tick(1/60);}return task.result;};
const temp=t=>{const directory=mkdtempSync(join(tmpdir(),'sky-order-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const room=new Room(directory);room.orders.cooldown=0;return room;};
function site(t){
 const room=temp(t);for(let x=114;x<=124;x++)for(let z=4;z<=14;z++){for(let y=30;y<=36;y++)room.world.set(x,y,z,B.AIR);room.world.set(x,30,z,B.STONE);}
 const bot=room.simulation.spawn('claude-companion'),player=room.simulation.spawn('player');bot.position={x:116.5,y:31,z:8.5};player.position={x:118.5,y:31,z:8.5};bot.grounded=true;player.grounded=true;room.jobs=new JobBoard(room);
 return {room,bot,player};
}
test('gather validates stone, dirt, sand and clay up to sixteen; ore is refused',()=>{
 for(const id of [B.WOOD,B.STONE,B.DIRT,B.SAND,B.CLAY])assert.equal(gather.validate({blockId:id,count:16}).blockId,id);
 assert.throws(()=>gather.validate({blockId:B.COAL,count:2}),/Ore needs a mining trip/);
 assert.throws(()=>gather.validate({blockId:B.STONE,count:17}),/1–16/);
});
test('each surface material mines through actions and delivers by receipts; protection prevents mining',()=>{
 for(const id of [B.STONE,B.DIRT,B.SAND,B.CLAY]){
  const world=new World();for(let x=1;x<16;x++)for(let z=1;z<16;z++)world.set(x,0,z,B.STONE);
  world.set(8,1,5,id);const sim=new Simulation(world),room={world,simulation:sim},bot=sim.spawn('claude-companion'),player=sim.spawn('player');
  bot.position={x:5.5,y:1,z:5.5};player.position={x:4.5,y:1,z:5.5};bot.grounded=true;player.grounded=true;
  const result=run(room,new SurfaceGatherTask(room,bot,{requesterId:player.id,blockId:id,count:1}));
  assert.equal(result?.ok,true,`${id}: ${result?.message}`);assert.equal(result.delivered,1);assert.equal(player.inventory[id],1);assert.equal(world.get(8,1,5),0);
 }
 const world=new World();for(let x=1;x<16;x++)for(let z=1;z<16;z++)world.set(x,0,z,B.STONE);world.set(8,1,5,B.CLAY);
 const sim=new Simulation(world),room={world,simulation:sim},bot=sim.spawn('claude-companion');bot.position={x:5.5,y:1,z:5.5};sim.canEdit=()=>false;
 const result=run(room,new SurfaceGatherTask(room,bot,{requesterId:bot.id,blockId:B.CLAY,count:1}),60*2);
 assert.equal(result?.ok,false);assert.equal(world.get(8,1,5),B.CLAY);
});
test('orders validate site, protection, overlap, limits and distance; snapshot reports cells and progress',t=>{
 const {room,bot,player}=site(t),msg={blueprint:'path',params:{length:2},anchor:{x:120,y:31,z:8},facing:'east'};
 const order=room.orders.post(player,msg),view=room.extensionSnapshots().orders;
 assert.equal(view.length,1);assert.equal(view[0].ownerId,player.id);assert.equal(view[0].total,2);assert.equal(view[0].placed,0);assert.equal(view[0].status,'open');
 assert.throws(()=>room.orders.post(player,msg),/overlaps/);
 room.world.set(view[0].cells[0].x,view[0].cells[0].y,view[0].cells[0].z,B.PLANKS);assert.equal(room.extensionSnapshots().orders[0].placed,1);
 room.simulation.canEdit=(e,p)=>p.x!==123;
 assert.throws(()=>room.orders.post(player,{...msg,anchor:{x:123,y:31,z:8}}),/protected/);
 room.simulation.canEdit=()=>true;
 assert.throws(()=>room.orders.post(player,{...msg,anchor:{x:30,y:31,z:8}}),/32 blocks/);
 for(const z of [5,11])room.orders.post(player,{...msg,anchor:{x:120,y:31,z}});
 assert.throws(()=>room.orders.post(player,{...msg,anchor:{x:116,y:31,z:12}}),/limit/);
 room.orders.cancel(player,order.id);assert.equal(room.extensionSnapshots().orders.length,2);
 assert.equal(room.jobs.find(order.jobId).status,'cancelled');
});
test('saved claim blueprint limits, catalog cells and planning; only owner deletes',t=>{
 const {room,bot,player}=site(t);room.claims.items.push({id:'small',ownerId:player.id,name:'Small',min:{x:120,y:31,z:10},max:{x:121,y:31,z:10},protectPlayers:true,allowCompanions:true});
 room.world.set(120,31,10,B.PLANKS);room.world.set(121,31,10,B.WOOD);
 const saved=room.blueprints.save(player,{claimId:'small',name:'Tiny wall'});
 assert.equal(saved.blocks.length,2);assert.equal(room.extensionSnapshots().blueprints.find(b=>b.key===saved.key).kind,'player');
 const plan=planBuild(room,{...bot,inventory:new Uint16Array(26).fill(65535)},{blueprint:saved.key,anchor:{x:120,y:31,z:8},facing:'north',params:{}});
 assert.equal(plan.cells.length,2);assert.deepEqual(plan.cells.map(c=>c.id),[B.PLANKS,B.WOOD]);
 assert.deepEqual(previewCells(room.blueprints.catalog().find(b=>b.key===saved.key),{x:120,y:31,z:8},'north'),plan.cells);
 const order=room.orders.post(player,{blueprint:saved.key,anchor:{x:120,y:31,z:8},facing:'north'});assert.equal(order.cells.length,2);
 const action=planSkill.validate({jobs:[{blueprint:saved.key,on:{x:123,y:30,z:8}}]},{blueprints:room.blueprints.catalog(),pointableBlocks:[{pos:{x:123,y:30,z:8}}]});assert.equal(action.jobs[0].blueprint,saved.key);
 assert.throws(()=>room.blueprints.delete(bot,saved.key),/owner/);room.blueprints.delete(player,saved.key);
 room.claims.items.push({id:'large',ownerId:player.id,name:'Large',min:{x:4,y:0,z:4},max:{x:21,y:0,z:4},protectPlayers:true});
 assert.throws(()=>room.blueprints.save(player,{claimId:'large',name:'Too wide'}),/16×12×16/);
});
test('stockpile materials are withdrawn through actions before building and final blocks verify completion',t=>{
 const room=temp(t),bot=room.simulation.spawn('claude-companion');bot.position={...STOCKPILE_POSITION};bot.grounded=true;bot.inventory.fill(0);
 const plan=planBuild(room,{...bot,inventory:new Uint16Array(26).fill(65535)},{blueprint:'path',anchor:{x:54,y:20,z:96},facing:'west',params:{length:2}});
 room.stockpile.items[B.PLANKS]=2;
 const events=[];room.trace=(type,fields)=>events.push(type);
 const result=run(room,new SupplyBuildTask(room,bot,plan),60*120);
 assert.equal(result?.ok,true,result?.message);assert.equal(room.stockpile.items[B.PLANKS],0);assert.equal(bot.inventory[B.PLANKS],0);
 assert.ok(plan.cells.every(c=>room.world.get(c.x,c.y,c.z)===c.id));assert.ok(events.includes('order.materials.withdrawn'));
});

test('a posted order is assigned, built and completed only after its cells match; cancellation stops a running job',t=>{
 const {room,bot,player}=site(t);const trace=[];room.trace=type=>trace.push(type);bot.inventory[B.PLANKS]=8;const companion=new Companion(room,process.cwd(),PERSONAS.claude),foreman=new Foreman(room,[companion],{interval:.1});
 const order=room.orders.post(player,{blueprint:'path',params:{length:2},anchor:{x:120,y:31,z:8},facing:'east'});
 for(let i=0;i<60*90&&['open','running'].includes(room.jobs.find(order.jobId).status);i++){foreman.tick(1/60);companion.tick();room.simulation.tick(1/60);}
 const job=room.jobs.find(order.jobId);assert.equal(job.status,'done',job.result);assert.ok(order.cells.every(c=>room.world.get(c.x,c.y,c.z)===c.id));assert.deepEqual(room.extensionSnapshots().orders,[]);assert.ok(['order.posted','order.assigned','order.building','order.done'].every(type=>trace.includes(type)),trace.join(','));
 const second=room.orders.post(player,{blueprint:'path',params:{length:2},anchor:{x:120,y:31,z:11},facing:'east'});foreman.tick(1);assert.equal(room.jobs.find(second.jobId).status,'running');room.orders.cancel(player,second.id);companion.tick();assert.equal(room.jobs.find(second.jobId).status,'cancelled');assert.ok(trace.includes('order.cancelled'));
});

test('blueprints refuse more than 512 solid cells; the room-wide open-order cap is eight',t=>{
 const {room,player}=site(t);room.claims.items.push({id:'dense',ownerId:player.id,name:'Dense',min:{x:60,y:32,z:0},max:{x:75,y:43,z:15},protectPlayers:true,allowCompanions:true});
 let n=0;for(let x=60;x<=75&&n<513;x++)for(let z=0;z<=15&&n<513;z++)for(let y=32;y<=43&&n<513;y++){room.world.set(x,y,z,B.PLANKS);n++;}
 assert.throws(()=>room.blueprints.save(player,{claimId:'dense',name:'Too many'}),/1–512/);
 // Use distinct owners so the per-player cap does not mask the room cap.
 for(let i=0;i<8;i++){const p=room.simulation.spawn(`p${i}`);p.position={...player.position};room.orders.post(p,{blueprint:'path',params:{length:2},anchor:{x:114+(i%4)*2,y:31,z:5+Math.floor(i/4)*3},facing:'east'});}
 const another=room.simulation.spawn('another');another.position={...player.position};assert.throws(()=>room.orders.post(another,{blueprint:'path',params:{length:2},anchor:{x:122,y:31,z:12},facing:'east'}),/limit/);
});
test('a player may attempt one build order every few seconds, failures included',t=>{
 const room=temp(t);room.orders.cooldown=3000;const player=room.simulation.spawn('p');
 assert.throws(()=>room.orders.post(player,{blueprint:'nope'}));
 assert.throws(()=>room.orders.post(player,{blueprint:'nope'}),/Wait a moment/,'a failed attempt still starts the cooldown');
});
