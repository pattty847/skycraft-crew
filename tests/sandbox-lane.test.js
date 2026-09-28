import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { B } from '../src/blocks.js';
import { World, SANDBOX, insideSandbox, sandboxCircle, sandboxRing, addSandbox, generateWorld } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { Room } from '../server/room.js';
import { CraftTask } from '../server/skills/craft.js';
import craft from '../server/skills/craft.js';
import { TreeScan } from '../server/tasks/trees.js';
import { GatherTask } from '../server/tasks/gather.js';
import { SupplyBuildTask } from '../server/jobs/supply-build.js';
import { surfaceTargets } from '../server/tasks/surface-gather.js';
import { Ecology } from '../server/ecology.js';
import { tempRoom, fakeSocket, runTask } from './helpers.js';
import { Companion, PERSONAS } from '../server/companion.js';
import { forModel } from '../server/observation.js';
import { planPath } from '../src/path-plan.js';
import { performance } from 'node:perf_hooks';
import { GotoTask } from '../server/navigation/goto.js';
import { standingPoint } from '../server/navigation/places.js';

test('Sandbox is 40 square, level and empty inside its circle; trees and forage stay in corners',()=>{
 const w=generateWorld();assert.equal(SANDBOX.maxX-SANDBOX.minX+1,40);assert.equal(SANDBOX.maxZ-SANDBOX.minZ+1,40);
 let trees=0;
 for(let x=SANDBOX.minX;x<=SANDBOX.maxX;x++)for(let z=SANDBOX.minZ;z<=SANDBOX.maxZ;z++){
  assert.equal(w.get(x,SANDBOX.y,z),sandboxRing(x,z)?B.SAND:B.GRASS);
  const above=w.get(x,SANDBOX.y+1,z);
  if(sandboxCircle(x,z))assert.equal(above,B.AIR,`circle at ${x},${z}`);
  if(above===B.WOOD)trees++;
 }
 assert.equal(trees,4);assert.equal(w.get(29,27,47),B.PLANKS);
 for(const [x,z] of [[1,68],[40,68],[20,49],[20,88]])assert.equal(sandboxRing(x,z),true,'ring reaches each side');
});

test('the Origin plank approach gives the Sandbox a walkable named route',()=>{
 const world=generateWorld(),simulation=new Simulation(world),agent=simulation.spawn('codex-companion');
 agent.position=standingPoint(world,30,30);agent.grounded=true;
 const task=new GotoTask({world,simulation},agent,'the Sandbox');
 for(let i=0;i<2400&&!task.result;i++){task.tick(1/60);simulation.tick(1/60);}
 assert.equal(task.result?.ok,true,task.result?.message);
 assert.equal(insideSandbox(Math.floor(agent.position.x),Math.floor(agent.position.z)),true);
});

test('only companions place for free inside Sandbox; outside needs inventory',()=>{
 const w=new World();addSandbox(w);w.set(50,27,50,B.GRASS);
 const s=new Simulation(w),agent=s.spawn('codex-companion'),player=s.spawn('player');
 agent.position={x:20.5,y:28,z:68.5};player.position={x:60.5,y:28,z:60.5};
 assert.equal(s.place(agent,{x:21,y:28,z:68},B.STONE),true);assert.equal(agent.inventory[B.STONE],0);
 agent.position={x:50.5,y:28,z:51.5};assert.equal(s.place(agent,{x:50,y:28,z:50},B.STONE),false);
 player.position={x:22.5,y:28,z:68.5};assert.equal(s.place(player,{x:22,y:28,z:68},B.STONE),false);
});

test('Sandbox migration fills only air once, records version and preserves later mining',t=>{
 const room=tempRoom(t),p={x:20,y:27,z:68},q={x:21,y:27,z:68},ring={x:20,y:27,z:49};room.save();
 const saved=JSON.parse(readFileSync(room.file)),blocks=Buffer.from(saved.blocks,'base64');
 blocks[room.world.index(p.x,p.y,p.z)]=0;blocks[room.world.index(q.x,q.y,q.z)]=B.PLANKS;
 blocks[room.world.index(ring.x,ring.y,ring.z)]=0;
 saved.blocks=blocks.toString('base64');saved.extensions.terrain.frontier=3;writeFileSync(room.file,JSON.stringify(saved));
 const migrated=new Room(room.directory);assert.equal(migrated.sandboxMigrated,true);assert.equal(migrated.world.get(p.x,p.y,p.z),B.GRASS);assert.equal(migrated.world.get(q.x,q.y,q.z),B.PLANKS);assert.equal(migrated.world.get(ring.x,ring.y,ring.z),B.SAND);
 assert.equal(JSON.parse(readFileSync(room.file)).extensions.terrain.frontier,4);
 migrated.world.set(p.x,p.y,p.z,B.AIR);migrated.save();const restarted=new Room(room.directory);
 assert.equal(restarted.world.get(p.x,p.y,p.z),B.AIR);assert.equal(restarted.sandboxMigrated,undefined);
 assert.equal(readdirSync(room.directory).filter(f=>f.startsWith('before-sandbox-')).length,1);
});

test('craft validates ingredients, crafts through actions, gives verified output and refuses missing station',t=>{
 const room=tempRoom(t),s=room.simulation,agent=s.spawn('claude-companion'),player=s.spawn('player');
 agent.position={x:30.5,y:room.world.top(30,30)+1,z:30.5};player.position={x:31.5,y:agent.position.y,z:30.5};agent.inventory[B.WOOD]=1;
 assert.equal(craft.validate({type:'craft',recipe:'planks',count:1,give:true},{inventory:[{id:B.WOOD,count:1}]}).recipe,'planks');
 assert.deepEqual(forModel({inventory:[{id:B.WOOD,name:'Wood',count:1}]},{needs:[]}).inventory,[{id:B.WOOD,name:'Wood',count:1}]);
 assert.throws(()=>craft.validate({recipe:'planks',count:2,give:true},{inventory:[{id:B.WOOD,count:1}]}),/Need 2 wood/);
 const before=player.inventory[B.PLANKS],woodBefore=agent.inventory[B.WOOD];const result=runTask(room,new CraftTask(room,agent,{recipe:'planks',count:1,give:true,requesterId:player.id}),{limit:300});
 assert.equal(result?.ok,true,result?.message);assert.equal(player.inventory[B.PLANKS],before+4);assert.equal(agent.inventory[B.WOOD],woodBefore-1);
 agent.inventory[B.PLANKS]=3;agent.inventory[B.STICK]=2;
 const missing=runTask(room,new CraftTask(room,agent,{recipe:'woodenPickaxe',count:1,give:false,requesterId:player.id}),{limit:5});
 assert.match(missing?.message??'',/crafting table/);
});

test('station recipe walks to a table and verifies the crafted item',()=>{
 const w=new World();for(let x=7;x<22;x++)for(let z=7;z<15;z++)w.set(x,20,z,B.GRASS);w.set(17,21,10,B.TABLE);
 const s=new Simulation(w),agent=s.spawn('claude-companion'),room={world:w,simulation:s,trace(){}};
 agent.position={x:10.5,y:21,z:10.5};agent.grounded=true;agent.inventory[B.PLANKS]=3;agent.inventory[B.STICK]=2;
 const before=agent.inventory[B.WOOD_PICKAXE],result=runTask(room,new CraftTask(room,agent,{recipe:'woodenPickaxe',count:1,give:false,requesterId:'player'}),{limit:5000});
 assert.equal(result?.ok,true,result?.message);assert.equal(agent.inventory[B.WOOD_PICKAXE],before+1);
});

test('wide tree scan stays incremental and finds a tree beyond 24 blocks',()=>{
 const w=new World();w.set(70,20,60,B.GRASS);for(let y=21;y<=24;y++)w.set(70,y,60,B.WOOD);w.set(70,25,60,B.LEAVES);
 const scan=new TreeScan(w,{x:35.5,y:21,z:60.5},40);assert.equal(scan.tick(10),false);
 for(let n=0;n<200&&!scan.done;n++)scan.tick();
 assert.equal(scan.done,true);assert.equal(scan.trees[0]?.base.x,70);
});

test('gather for self keeps mined wood in the companion inventory',()=>{
 const w=new World();for(let x=8;x<20;x++)for(let z=8;z<20;z++)w.set(x,20,z,B.GRASS);
 for(let y=21;y<=24;y++)w.set(13,y,10,B.WOOD);w.set(13,25,10,B.LEAVES);
 const s=new Simulation(w),agent=s.spawn('claude-companion'),room={world:w,simulation:s};agent.position={x:10.5,y:21,z:10.5};agent.grounded=true;
 const before=agent.inventory[B.WOOD],task=new GatherTask(room,agent,{requesterId:agent.id,count:1});
 const result=runTask(room,task,{limit:3000});assert.equal(result?.ok,true,result?.message);assert.equal(agent.inventory[B.WOOD],before+1);
});

test('an unreachable tree is skipped before gathering gives up',()=>{
 const w=new World();for(const x of [12,16]){w.set(x,20,10,B.GRASS);w.set(x,21,10,B.WOOD);w.set(x,22,10,B.LEAVES);}
 const s=new Simulation(w),agent=s.spawn('claude-companion'),room={world:w,simulation:s};agent.position={x:10.5,y:21,z:10.5};
 const task=new GatherTask(room,agent,{requesterId:agent.id,count:1});
 const trees=[12,16].map(x=>({base:{x,y:21,z:10},trunk:[{x,y:21,z:10}]}));
 task.scan={done:true,trees,tick:()=>true};task.tree=trees[0];task.state='approach';task.walk={result:{ok:false,message:'blocked'},tick(){},cancel(){}};
 task.tick(1/60);assert.equal(task.state,'find');task.tick(1/60);assert.equal(task.tree?.base.x,16);
});

test('path planning handles a full 4096-expansion budget promptly',()=>{
 const w=new World();for(let x=1;x<70;x++)for(let z=1;z<70;z++)w.set(x,4,z,B.STONE);
 w.set(32,5,32,B.STONE);
 const start=performance.now(),result=planPath(w,{x:2,y:4,z:2},{x:32,y:4,z:32},{maxCells:64,maxExpanded:4096});
 assert.match(result.reason,/budget/);assert.ok(performance.now()-start<500,'path search exceeded 500 ms');
});

test('a wholly Sandbox build order skips supplies; natural leaves are gatherable',t=>{
 const room=tempRoom(t),agent=room.simulation.spawn('claude-companion');
 const plan={blueprint:'test',label:'Test',anchor:{x:20,y:28,z:68},facing:'north',cells:[{x:20,y:28,z:68,id:B.LEAVES}],clear:[]};
 const task=new SupplyBuildTask(room,agent,plan);assert.equal(task.state,'build');assert.deepEqual(task.plan.need,{});
 const leaf={x:5,y:32,z:52};agent.position={x:5.5,y:28,z:52.5};
 assert.ok(surfaceTargets(room,agent,B.LEAVES,10).some(p=>p.x===leaf.x&&p.z===leaf.z));
});

test('orphan leaves are scheduled at 2–3 seconds and two can fall each second',()=>{
 const w=new World(),s=new Simulation(w),room={world:w,simulation:s,extend(){},trace(){}};const ecology=new Ecology(room);
 for(let x=10;x<13;x++){const p={x,y:20,z:10};w.set(x,20,10,B.LEAVES);ecology.scheduleLeaf(p);}
 assert.ok([...ecology.leaves.values()].every(d=>d>=2&&d<=3));ecology.tick(3.1);
 assert.ok([10,11,12].filter(x=>w.get(x,20,10)===B.AIR).length>=2);
});

test('dawn waits for a member, has a two-hour turn cadence, and status pairs close on success and refusal',async t=>{
 const room=tempRoom(t),agent=new Companion(room,new URL('../',import.meta.url).pathname,{...PERSONAS.claude,resident:false});
 agent.reflect=async reason=>{agent.seenReason=reason;};agent.wasNight=true;room.phase=0;agent.considerReflecting();assert.equal(agent.seenReason,undefined);
 room.clients.set(fakeSocket(),{entity:{id:'guest',position:{x:30,y:23,z:30}}});room.access={isGuest:id=>id==='guest'};agent.wasNight=true;agent.considerReflecting();assert.notEqual(agent.seenReason,'dawn');
 room.clients.set(fakeSocket(),{entity:{id:'member',position:{x:30,y:23,z:30}}});agent.wasNight=true;agent.considerReflecting();assert.equal(agent.seenReason,'dawn');
 agent.seenReason=null;agent.wasNight=true;agent.considerReflecting();assert.notEqual(agent.seenReason,'dawn');
 const socket=[...room.clients.keys()][0];for(const why of ['reply','follow-up','reflect','dawn']){
  await agent.trackThinking(why,()=>Promise.resolve('ok'));
  const pair=socket.messages.filter(m=>m.type==='agent-status').slice(-2);assert.deepEqual(pair.map(m=>m.thinking),[true,false]);assert.equal(pair[0].why,why);
 }
 await assert.rejects(agent.trackThinking('reflect',()=>Promise.reject(Error('refused'))));
 assert.equal(socket.last('agent-status').thinking,false);
});
