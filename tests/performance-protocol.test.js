import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Room } from '../server/room.js';
import { B } from '../src/blocks.js';
const socket=()=>({readyState:1,bufferedAmount:0,messages:[],send(raw){this.messages.push(JSON.parse(raw));},close(){}});
const setup=t=>{const dir=mkdtempSync(join(tmpdir(),'sky-perf-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return new Room(dir);};
test('dirty saves coalesce, rotate backup, and recover across a clean restart',async t=>{
 const room=setup(t),a=socket(),e=room.connect(a);room.save();const first=room.saveCount;
 room.world.set(1,1,1,B.PLANKS);room.world.set(1,2,1,B.WOOD);room.markDirty();
 assert.equal(room.saveCount,first);
 await new Promise(r=>setTimeout(r,1100));assert.equal(room.saveCount,first+1);assert.equal(room.flushSave(),false);
 assert.ok(existsSync(room.file+'.bak'));assert.equal(JSON.parse(readFileSync(room.file)).blocks.length>0,true);
 room.world.set(1,3,1,B.PLANKS);room.save();const restored=new Room(room.directory);
 assert.equal(restored.world.get(1,3,1),B.PLANKS);assert.ok(restored.players.has(a.messages[0].token));assert.equal(e.id,restored.players.get(a.messages[0].token).id);
});
test('state and welcome contain inventory only for the receiving player',t=>{
 const room=setup(t),a=socket(),b=socket(),one=room.connect(a),two=room.connect(b);
 assert.equal(a.messages[0].entities.find(x=>x.id===one.id).i[9],24);
 assert.equal(b.messages[0].entities.find(x=>x.id===two.id).i[9],24);
 assert.equal(b.messages[0].entities.find(x=>x.id===one.id).i,undefined);
 room.broadcast();for(const [s,own,other] of [[a,one,two],[b,two,one]]){const frame=s.messages.at(-1);assert.equal(frame.entities.find(x=>x.id===own.id).i[9],24);assert.equal(frame.entities.find(x=>x.id===other.id).i,undefined);assert.ok(frame.entities.find(x=>x.id===other.id).p);}
});
test('order cell edits send a progress message and unrelated edits send none',t=>{
 const room=setup(t),s=socket(),e=room.connect(s);room.orders.items=[{id:'o',jobId:'o',cells:[{x:1,y:1,z:1,id:B.PLANKS}],status:'open'}];room.orders.reindex();s.messages=[];
 room.world.set(2,1,1,B.PLANKS);assert.equal(s.messages.length,0);
 room.world.set(1,1,1,B.PLANKS);assert.deepEqual(s.messages,[{type:'order-progress',id:'o',placed:1}]);
});
test('import welcome carries extension snapshots',t=>{
 const room=setup(t),s=socket();room.connect(s);
 const save={version:1,seed:230925,blocks:Array(64*48*64).fill(0),phase:.24,inventory:Array(26).fill(0),selected:9,position:{x:32.5,y:20,z:38.5}};
 room.receive(s,{type:'import',save});assert.ok(s.messages.at(-1).extensions.orders);assert.ok(s.messages.at(-1).extensions.claims);
});

test('bench refuses a foreign block in a leg cell and schedules legs before seats',async()=>{
 const { World }=await import('../src/world.js');
 const { Simulation }=await import('../src/simulation.js');
 const { planBuild }=await import('../server/building/planner.js');
 const { BuildTask }=await import('../server/building/build-task.js');
 const world=new World();for(let x=7;x<=13;x++)for(let z=7;z<=13;z++)world.set(x,0,z,B.STONE);
 const simulation=new Simulation(world),room={world,simulation},builder=simulation.spawn('builder');builder.position={x:8.5,y:1,z:8.5};builder.grounded=true;builder.inventory.fill(20);
 const spec={blueprint:'bench',anchor:{x:10,y:1,z:10},facing:'north',params:{}};
 world.set(9,1,10,B.DIRT);assert.throws(()=>planBuild(room,builder,spec),/in the way/);
 world.set(9,1,10,B.AIR);const plan=planBuild(room,builder,spec),task=new BuildTask(room,builder,plan);
 assert.equal(task.next().y,1);assert.ok(plan.placement.slice(0,2).every(c=>c.y===1));
});

test('an interrupted backup rename restores the last complete save',t=>{
 const room=setup(t);room.world.set(4,1,4,B.PLANKS);room.save();
 renameSync(room.file,room.file+'.bak');writeFileSync(room.file+'.tmp','{incomplete');
 const restored=new Room(room.directory);assert.equal(restored.world.get(4,1,4),B.PLANKS);
});

test('SIGTERM flushes an acknowledged world change before restart',async t=>{
 const { spawn }=await import('node:child_process');
 const { WebSocket }=await import('ws');
 const dir=mkdtempSync(join(tmpdir(),'sky-perf-signal-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'0',SKY_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 const port=await new Promise((resolve,reject)=>{child.stdout.once('data',b=>resolve(JSON.parse(b.toString().split(' on ')[1]).port));child.once('error',reject);});
 const ws=new WebSocket(`ws://127.0.0.1:${port}/world`,{origin:`http://127.0.0.1:${port}`});await new Promise(resolve=>ws.once('open',resolve));
 const message=type=>new Promise(resolve=>{const on=raw=>{const m=JSON.parse(raw);if(m.type===type){ws.off('message',on);resolve(m);}};ws.on('message',on);});
 const welcome=message('welcome');ws.send(JSON.stringify({type:'join'}));await welcome;
 const state=message('state');ws.send(JSON.stringify({type:'day'}));const changed=await state;assert.ok(changed.phase>.5);
 child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));ws.terminate();
 const restored=new Room(dir);assert.ok(restored.phase>.5);
});
