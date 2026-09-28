import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { World } from '../src/world.js';
import { B } from '../src/blocks.js';
import { planPath, PATH_MAX_CELLS } from '../src/path-plan.js';
import { Room } from '../server/room.js';
import { JobBoard } from '../server/jobs/board.js';
import { Companion, PERSONAS } from '../server/companion.js';
import { Foreman } from '../server/jobs/foreman.js';
import { BuildTask } from '../server/building/build-task.js';
import pathSkill from '../server/skills/path-to.js';

const strip=(w,min=2,max=8)=>{for(let x=min;x<=max;x++)for(let z=2;z<=8;z++)w.set(x,5,z,B.STONE);};
test('shared path planner follows ground, bridges gaps and handles one-block terrain changes',()=>{
 const w=new World();strip(w);
 let p=planPath(w,{x:2,y:5,z:5},{x:8,y:5,z:5});assert.equal(p.ok,true);assert.equal(p.cells.length,7);assert.equal(p.replace.length,7);
 for(let z=2;z<=8;z++)for(let x of [4,5])w.set(x,5,z,B.AIR);
 p=planPath(w,{x:2,y:5,z:5},{x:8,y:5,z:5});assert.equal(p.ok,true,p.reason);assert.ok(p.cells.some(c=>c.x===4&&c.id===B.PLANKS));assert.equal(p.replace.length,5);
 for(let z=2;z<=8;z++)w.set(7,6,z,B.STONE);
 p=planPath(w,{x:2,y:5,z:5},{x:8,y:6,z:5});assert.equal(p.ok,true,p.reason);assert.ok(p.route.some((at,i)=>i&&at.y>p.route[i-1].y));
 p=planPath(w,{x:8,y:6,z:5},{x:2,y:5,z:5});assert.equal(p.ok,true,p.reason);
});
test('natural ground is paved, existing planks stay, and odd solid floors stay outside the build cells',()=>{
 const w=new World();for(let x=2;x<=8;x++)w.set(x,5,5,B.GRASS);
 w.set(4,5,5,B.WOOD);w.set(5,5,5,B.LAMP);w.set(6,5,5,B.PLANKS);
 const ghost=planPath(w,{x:2,y:5,z:5},{x:8,y:5,z:5},{maxCells:7});
 assert.equal(ghost.ok,true,ghost.reason);assert.deepEqual(ghost.route.map(p=>p.x),[2,3,4,5,6,7,8]);
 assert.deepEqual(ghost.cells.map(c=>c.x),[2,3,6,7,8]);assert.deepEqual(ghost.replace.map(c=>c.x),[2,3,7,8]);
});
test('path planner respects length, claim checks, solid obstructions and step height',()=>{
 const w=new World();strip(w,2,70);
 assert.match(planPath(w,{x:2,y:5,z:5},{x:70,y:5,z:5}).reason,/exceed/);
 for(let z=2;z<=8;z++)w.set(4,5,z,B.AIR);
 assert.equal(planPath(w,{x:2,y:5,z:5},{x:8,y:5,z:5},{canEdit:p=>p.x!==4}).ok,false);
 for(let z=2;z<=8;z++)for(let y=6;y<=8;y++)w.set(4,y,z,B.STONE);
 assert.equal(planPath(w,{x:2,y:5,z:5},{x:8,y:5,z:5},{maxCells:7}).ok,false);
 const high=new World();high.set(2,5,5,B.STONE);for(let y=5;y<=7;y++)high.set(3,y,5,B.STONE);
 assert.equal(planPath(high,{x:2,y:5,z:5},{x:3,y:7,z:5},{maxCells:2}).ok,false);
 assert.equal(PATH_MAX_CELLS,64);
});
test('named path skill rejects raw positions and accepts observation names',()=>{
 const o={places:['Sandbar','Lookout Rock','where you are standing now']};
 assert.throws(()=>pathSkill.validate({from:{x:2,y:3,z:4},to:'Lookout Rock'},o),/named places/);
 assert.deepEqual(pathSkill.validate({from:'Sandbar',to:'Lookout Rock'},o),{type:'path-to',from:'Sandbar',to:'Lookout Rock'});
});
test('a builder mines and replaces each flat grass cell through actions',t=>{
 const directory=mkdtempSync(join(tmpdir(),'sky-path-grass-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const room=new Room(directory);
 for(let x=116;x<=123;x++)for(let z=6;z<=10;z++){for(let y=30;y<=35;y++)room.world.set(x,y,z,B.AIR);room.world.set(x,30,z,B.GRASS);}
 const bot=room.simulation.spawn('claude-companion');bot.position={x:117.5,y:31,z:8.5};bot.grounded=true;bot.inventory[B.PLANKS]=4;
 const route=planPath(room.world,{x:118,y:30,z:8},{x:121,y:30,z:8},{maxCells:4});assert.equal(route.ok,true,route.reason);
 const edits=[];room.trace=(type,fields)=>{if(type.startsWith('edit.'))edits.push({type,fields});};
 const task=new BuildTask(room,bot,{blueprint:'path-to',label:'Walkway',cells:route.cells,clear:route.clear,replace:route.replace,todo:4});
 for(let i=0;i<60*90&&!task.result;i++){task.tick(1/60);room.simulation.tick(1/60);}
 assert.equal(task.result?.ok,true,task.result?.message);assert.equal(route.replace.length,4);
 assert.deepEqual(route.cells.map(c=>room.world.get(c.x,c.y,c.z)),[B.PLANKS,B.PLANKS,B.PLANKS,B.PLANKS]);
 assert.equal(bot.inventory[B.GRASS],4);assert.equal(bot.inventory[B.PLANKS],0);
 assert.deepEqual(edits.map(e=>e.type),Array.from({length:4},()=>['edit.break','edit.place']).flat());
});
test('two-point path order is built by crew actions and verified from world',t=>{
 const directory=mkdtempSync(join(tmpdir(),'sky-path-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const room=new Room(directory);room.orders.cooldown=0;
 for(let x=114;x<=124;x++)for(let z=4;z<=14;z++){for(let y=30;y<=36;y++)room.world.set(x,y,z,B.AIR);room.world.set(x,30,z,B.STONE);}
 for(let z=4;z<=14;z++)room.world.set(120,30,z,B.AIR);
 room.world.set(119,30,8,B.WOOD);room.world.set(121,30,8,B.LAMP);
 room.world.set(120,31,8,B.LEAVES);
 const bot=room.simulation.spawn('claude-companion'),player=room.simulation.spawn('player');bot.position={x:117.5,y:31,z:8.5};player.position={x:118.5,y:31,z:8.5};bot.grounded=player.grounded=true;bot.inventory[B.PLANKS]=8;
 room.jobs=new JobBoard(room);const events=[];room.trace=(type,fields)=>events.push({type,fields});
 const companion=new Companion(room,process.cwd(),PERSONAS.claude),foreman=new Foreman(room,[companion],{interval:.1});
 const order=room.orders.post(player,{blueprint:'path-to',from:{x:118,y:30,z:8},to:{x:122,y:30,z:8},params:{width:1}});
 assert.equal(order.cells.length,3);assert.equal(order.replace.length,2);assert.ok(order.clear.some(c=>c.x===120&&c.y===31));assert.equal(room.extensionSnapshots().orders[0].from.x,118);
 assert.deepEqual(room.extensionSnapshots().orders[0].replace,order.replace);
 assert.deepEqual(order.cells,planPath(room.world,{x:118,y:30,z:8},{x:122,y:30,z:8}).cells);
 for(let i=0;i<60*90&&['open','running'].includes(room.jobs.find(order.jobId).status);i++){foreman.tick(1/60);companion.tick();room.simulation.tick(1/60);}
 const job=room.jobs.find(order.jobId);assert.equal(job.status,'done',job.result);assert.ok(order.cells.every(c=>room.world.get(c.x,c.y,c.z)===B.PLANKS));assert.equal(room.world.get(120,31,8),B.AIR);assert.equal(room.world.get(119,30,8),B.WOOD);assert.equal(room.world.get(121,30,8),B.LAMP);
 const edits=events.filter(e=>['edit.break','edit.place'].includes(e.type)&&e.fields.pos?.z===8&&e.fields.pos?.y===30);
 for(const c of order.replace){const at=edits.findIndex(e=>e.type==='edit.break'&&e.fields.pos.x===c.x);assert.ok(at>=0);assert.ok(edits.slice(at+1).some(e=>e.type==='edit.place'&&e.fields.pos.x===c.x));}
 assert.equal(events.find(e=>e.type==='path.planned').fields.replaced,2);assert.equal(events.find(e=>e.type==='path.planned').fields.bridged,1);
 assert.ok(events.some(e=>e.type==='order.done'));
});
test('a claimed natural start refuses the whole walkway order',t=>{
 const directory=mkdtempSync(join(tmpdir(),'sky-path-claim-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const room=new Room(directory);room.orders.cooldown=0;room.jobs=new JobBoard(room);
 for(let x=118;x<=121;x++){for(let y=30;y<=35;y++)room.world.set(x,y,8,B.AIR);room.world.set(x,30,8,B.GRASS);}
 const bot=room.simulation.spawn('claude-companion'),player=room.simulation.spawn('player');bot.position={x:117.5,y:31,z:8.5};player.position={x:118.5,y:31,z:8.5};
 room.claims.items.push({id:'path-test',ownerId:player.id,name:'Path test',min:{x:118,y:30,z:8},max:{x:118,y:30,z:8},allowCompanions:true});
 assert.throws(()=>room.orders.post(player,{blueprint:'path-to',from:{x:118,y:30,z:8},to:{x:121,y:30,z:8},params:{width:1}}),/protected/);
 assert.equal(room.jobs.jobs.length,0);assert.equal(room.world.get(118,30,8),B.GRASS);
});
