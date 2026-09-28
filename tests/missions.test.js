import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateWorld,World } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { B } from '../src/blocks.js';
import { Room } from '../server/room.js';
import { Companion,PERSONAS } from '../server/companion.js';
import { memoryFor,MEMORY_LIMIT } from '../server/memory.js';
import { parseCompanionReply,validateChat } from '../server/chat.js';
import { GatherTask } from '../server/tasks/gather.js';
import { FollowTask } from '../server/tasks/follow.js';
import { IdleBehavior } from '../server/tasks/idle.js';
import { findTrees,treeTrunkAt } from '../server/tasks/trees.js';
import { standable } from '../server/navigation/pathfinder.js';
const ground=(w,x,z)=>{for(let y=46;y>0;y--){const p={x:x+.5,y,z:z+.5};if(standable(w,p)&&![5,6].includes(w.get(x,y-1,z)))return p;}};
const floor=(w,x,z)=>{for(let y=1;y<46;y++){const p={x:x+.5,y,z:z+.5};if(standable(w,p))return p;}};
function scene(world=generateWorld()){const simulation=new Simulation(world),room={world,simulation,phase:.24};return room;}
function run(room,task,limit=60*200){for(let i=0;i<limit&&!task.result;i++){task.tick(1/60);room.simulation.tick(1/60);}return task.result;}
function tempRoom(t){const directory=mkdtempSync(join(tmpdir(),'sky-mission-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));return new Room(directory);}

test('natural trees are recognised; shelter posts and plank-hugging wood are not',()=>{
 const w=generateWorld();
 assert.ok(treeTrunkAt(w,77,w.top(77,25)-6,25)??findTrees(w,{x:77,y:23,z:25},3).length,'Clover Rise tree');
 for(const [x,z] of [[83,32],[86,35]])for(let y=20;y<32;y++)assert.equal(treeTrunkAt(w,x,y,z),null,`nook post at ${x},${y},${z}`);
 const trunks=findTrees(w,{x:84.5,y:25,z:33.5},24);assert.ok(trunks.length>=3);
 assert.ok(trunks.every(t=>!t.trunk.some(p=>p.x>=83&&p.x<=86&&p.z>=32&&p.z<=35)));
 const tree=trunks[0].base;w.set(tree.x+1,tree.y+1,tree.z,B.PLANKS);assert.equal(treeTrunkAt(w,tree.x,tree.y,tree.z),null,'a tree built into a wall is protected');
});
test('gathering chops only natural trunks, then hands over exactly the wood it collected',()=>{
 const room=scene(),w=room.world,claude=room.simulation.spawn('claude-companion'),player=room.simulation.spawn('player');
 claude.position=ground(w,84,38);player.position=ground(w,80,30);claude.inventory[B.WOOD]=2;const playerWood=player.inventory[B.WOOD];
 const before=w.blocks.slice(),progress=[];
 const task=new GatherTask(room,claude,{requesterId:'player',count:3,onProgress:text=>progress.push(text)});
 const result=run(room,task);
 assert.equal(result?.ok,true,JSON.stringify(result));assert.equal(result.collected,3);
 assert.equal(player.inventory[B.WOOD],playerWood+3);assert.equal(claude.inventory[B.WOOD],2,'the companion keeps what it had before');
 const changed=[];for(let i=0;i<before.length;i++)if(before[i]!==w.blocks[i])changed.push({...w.position(i),from:before[i],to:w.blocks[i]});
 assert.equal(changed.length,3);assert.ok(changed.every(c=>c.from===B.WOOD&&c.to===0));
 assert.deepEqual(changed.map(({x,y,z})=>({x,y,z})).sort((a,b)=>a.y-b.y||a.x-b.x),result.mined.map(({x,y,z})=>({x,y,z})).sort((a,b)=>a.y-b.y||a.x-b.x));
 assert.ok(progress.some(p=>/Chopped wood 3\/3/.test(p)));
});
test('gathering with no natural tree in range edits nothing and says why',()=>{
 const w=new World();for(let x=0;x<20;x++)for(let z=0;z<20;z++)w.set(x,0,z,B.STONE);for(let y=1;y<4;y++)w.set(10,y,10,B.WOOD);w.set(10,4,10,B.PLANKS);
 const room=scene(w),e=room.simulation.spawn('claude-companion'),p=room.simulation.spawn('player');e.position={x:5.5,y:1,z:5.5};p.position={x:6.5,y:1,z:5.5};
 const before=w.blocks.slice(),result=run(room,new GatherTask(room,e,{requesterId:'player',count:2}));
 assert.equal(result.ok,false);assert.match(result.message,/natural tree/);assert.deepEqual(w.blocks,before);
});
test('give is all-or-nothing and needs arm’s reach',()=>{
 const room=scene(),a=room.simulation.spawn('a'),b=room.simulation.spawn('b');a.position={x:30.5,y:24,z:36.5};b.position={x:32.5,y:24,z:36.5};
 a.inventory[B.COAL]=2;a.actions.give('b',B.COAL,3);room.simulation.tick(1/60);assert.equal(b.inventory[B.COAL],0);
 a.actions.give('b',B.COAL,2);b.position={x:40.5,y:24,z:36.5};room.simulation.tick(1/60);assert.equal(a.inventory[B.COAL],2,'too far away');
 b.position={x:32.5,y:a.position.y,z:36.5};a.actions.give('b',B.COAL,2);room.simulation.tick(1/60);assert.equal(b.inventory[B.COAL],2);assert.equal(a.inventory[B.COAL],0);
 assert.throws(()=>a.actions.give('b',B.COAL,0));assert.throws(()=>a.actions.give('',B.COAL,1));
});
test('follow keeps close as the player walks away, and ends on its own',()=>{
 const room=scene(),w=room.world,e=room.simulation.spawn('claude-companion'),p=room.simulation.spawn('player');
 e.position=ground(w,30,36);p.position=ground(w,33,36);const task=new FollowTask(room,e,'player',{duration:20});
 for(let i=0;i<60;i++){task.tick(1/60);room.simulation.tick(1/60);}
 p.position=ground(w,26,40);for(let i=0;i<60*8;i++){task.tick(1/60);room.simulation.tick(1/60);}
 assert.ok(Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z)<3.6);assert.ok(task.arrivals>=1);
 assert.equal(run(room,task).ok,true);
});
test('idle Claude potters near home, faces a visiting player and greets them once',()=>{
 const room=scene(),w=room.world,e=room.simulation.spawn('claude-companion'),home=floor(w,84,33);e.position={...home};
 let seed=1;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const idle=new IdleBehavior(room,e,{home,lines:['Hi!'],random}),before=w.blocks.slice();
 for(let i=0;i<60*40;i++){idle.tick(1/60);room.simulation.tick(1/60);assert.ok(Math.hypot(e.position.x-home.x,e.position.z-home.z)<9);}
 assert.ok(Math.hypot(e.position.x-home.x,e.position.z-home.z)>.5,'it moved');assert.deepEqual(w.blocks,before);
 idle.walk?.cancel();idle.walk=null;for(let i=0;i<60;i++)room.simulation.tick(1/60);
 const p=room.simulation.spawn('player');p.position=[[2,0],[-2,0],[0,2],[0,-2],[2,2]].map(([dx,dz])=>({x:e.position.x+dx,y:Math.round(e.position.y),z:e.position.z+dz})).find(q=>standable(w,q));
 const says=[];const say=e.actions.say;e.actions={...e.actions,say:text=>{says.push(text);say(text);}};
 for(let i=0;i<60*5;i++){idle.tick(1/60);room.simulation.tick(1/60);}
 const dx=p.position.x-e.position.x,dz=p.position.z-e.position.z;assert.deepEqual(says,['Hi!']);assert.ok((e.direction.x*dx+e.direction.z*dz)/Math.hypot(dx,dz)>.9,'faces the player');
});
test('Claude lives at home from server start, persists, and idles without a model call',t=>{
 const room=tempRoom(t),claude=new Companion(room,process.cwd(),PERSONAS.claude);claude.think=()=>{throw Error('no model while idle');};
 const e=room.simulation.entities.get('claude-companion');assert.ok(e);assert.ok(Math.hypot(e.position.x-84.5,e.position.z-33.5)<1);
 for(let i=0;i<600;i++){claude.tick();room.tick(1/60);}
 room.save();const restored=new Room(room.directory);assert.ok(restored.simulation.entities.has('claude-companion'));
});
test('Claude runs a chat turn on a text observation, and a gather turn verifies delivery',async t=>{
 const room=tempRoom(t),claude=new Companion(room,process.cwd(),PERSONAS.claude),socket={readyState:1,send(){}},player=room.simulation.spawn('player');
 player.position=ground(room.world,82,38);room.clients.set(socket,{entity:player});room.save=()=>{};
 const payloads=[];claude.think=async payload=>{payloads.push(payload);return payload.mode==='talk'?'Sure! {"message":"Hi there ✻","action":null}':'{"message":"On it!","action":{"type":"gather","blockId":5,"count":2}}';};
 await claude.run(socket,{mode:'talk',text:'hello'});
 assert.equal(payloads[0].image,null);assert.equal(payloads[0].provider,'claude-cli');assert.equal(payloads[0].observation.you.island,'Clover Rise');assert.equal(payloads[0].observation.requester.id,'player');
 const timer=setInterval(()=>{claude.tick();room.simulation.tick(1/60);},1);t.after(()=>clearInterval(timer));
 const wood=player.inventory[B.WOOD];await claude.run(socket,{mode:'gather',text:'bring me two wood please'});
 assert.equal(player.inventory[B.WOOD],wood+2);assert.match(claude.status,/Delivered 2 wood/);
});
test('replies are parsed strictly: prose around JSON is tolerated, actions are not stretched',()=>{
 const o={requester:{id:'me'},reachableBlocks:[{pos:{x:1,y:2,z:3}}]};
 assert.deepEqual(parseCompanionReply('Here you go: {"message":"Coming!","action":{"type":"follow","targetId":"me","speed":99}}','talk',o).action,{type:'follow',targetId:'me'});
 assert.throws(()=>parseCompanionReply('{"message":"x","action":{"type":"follow","targetId":"someone-else"}}','talk',o),/requesting player/);
 assert.throws(()=>parseCompanionReply('{"message":"x","action":{"type":"gather","count":17}}','gather',o),/1–16/);
 assert.throws(()=>parseCompanionReply('{"message":"x","action":{"type":"gather","count":2,"blockId":7}}','gather',o),/Ore needs a mining trip/);
 assert.throws(()=>parseCompanionReply('{"message":"x","action":{"type":"breakBlock","pos":{"x":1,"y":2,"z":3}}}','gather',o));
 assert.throws(()=>parseCompanionReply('{"message":"x","action":{"type":"follow","targetId":"me"}}','build',o));
 assert.deepEqual(validateChat({mode:'gather',text:' wood ',agent:'claude'}),{mode:'gather',text:'wood',agent:'claude',agents:['claude']});
 assert.equal(validateChat({mode:'talk',text:'hi'}).agent,'codex');assert.throws(()=>validateChat({mode:'talk',text:'hi',agent:'gemini'}));
});
test('Claude can wave through the shared gesture task, verified by simulation',async t=>{
 const room=tempRoom(t),claude=new Companion(room,process.cwd(),PERSONAS.claude),socket={readyState:1,send(){}},player=room.simulation.spawn('player');
 player.position=ground(room.world,82,38);room.clients.set(socket,{entity:player});room.save=()=>{};
 claude.think=async()=>'{"message":"Hi! 👋","action":{"type":"emote","name":"wave"}}';
 const timer=setInterval(()=>{claude.tick();room.simulation.tick(1/60);},1);t.after(()=>clearInterval(timer));
 await claude.run(socket,{mode:'talk',text:'wave at me'});assert.match(claude.status,/Finished a wave/);
});
test('Claude hands over items it already carries, verified by the receiver’s inventory',async t=>{
 const room=tempRoom(t),claude=new Companion(room,process.cwd(),PERSONAS.claude),socket={readyState:1,send(){}},player=room.simulation.spawn('player');
 player.position=ground(room.world,80,38);room.clients.set(socket,{entity:player});room.save=()=>{};
 const e=room.simulation.entities.get('claude-companion');e.inventory[B.WOOD]=8;const before=player.inventory[B.WOOD];
 claude.think=async()=>'{"message":"Here, take them!","action":{"type":"give","blockId":5,"count":8}}';
 const timer=setInterval(()=>{claude.tick();room.simulation.tick(1/60);},1);t.after(()=>clearInterval(timer));
 await claude.run(socket,{mode:'auto',text:'bring me your wood'});
 assert.equal(player.inventory[B.WOOD],before+8);assert.equal(e.inventory[B.WOOD],0);assert.match(claude.status,/inventory confirms/);
 assert.throws(()=>parseCompanionReply('{"message":"x","action":{"type":"give","blockId":5,"count":17}}','auto',{inventory:[{id:5,count:8}]}),/only have 8/);
});
test('after arriving, a companion takes one talk-only look and reacts; actions in that reply are ignored',async t=>{
 const room=tempRoom(t),claude=new Companion(room,process.cwd(),PERSONAS.claude),socket={readyState:1,send(){}},player=room.simulation.spawn('player');
 player.position=ground(room.world,80,38);room.clients.set(socket,{entity:player});room.save=()=>{};const chat=[];room.chat={entries:[],add:(kind,name,text)=>chat.push({kind,name,text})};
 const payloads=[];claude.think=async payload=>{payloads.push(payload);return payloads.length===1?'{"message":"Coming!","action":{"type":"approach","targetId":"player"}}':'{"message":"Oh, you are right by the bridge!","action":{"type":"build","blueprint":"bench","near":"requester"}}';};
 const timer=setInterval(()=>{claude.tick();room.simulation.tick(1/60);},1);t.after(()=>clearInterval(timer));
 const blocks=room.world.revision;await claude.run(socket,{mode:'auto',text:'come check this out'});
 assert.equal(payloads.length,2);assert.match(payloads[1].policy,/FOLLOW-UP/);assert.match(payloads[1].policy,/Arrived beside you/);
 assert.ok(chat.some(c=>c.kind==='assistant'&&/bridge/.test(c.text)));assert.equal(room.world.revision,blocks,'the follow-up build proposal was ignored');
 assert.match(claude.status,/Arrived/);
});
test('companions keep a few short notes across restarts and read them back next turn',async t=>{
 const room=tempRoom(t),claude=new Companion(room,process.cwd(),PERSONAS.claude),socket={readyState:1,send(){}},player=room.simulation.spawn('player');
 player.position=ground(room.world,80,38);room.clients.set(socket,{entity:player});
 const seen=[];claude.think=async payload=>{seen.push(payload.observation.memory);return '{"message":"Nice to meet you, Sam!","action":null,"remember":"The player at the nook is called Sam and loves stairs."}';};
 await claude.run(socket,{mode:'talk',text:'hi, I am Sam'});await claude.run(socket,{mode:'talk',text:'remember me?'});
 assert.deepEqual(seen[0],[]);assert.deepEqual(seen[1],['The player at the nook is called Sam and loves stairs.']);
 room.save();const restored=new Room(room.directory),again=new Companion(restored,process.cwd(),PERSONAS.claude);
 assert.deepEqual(memoryFor(restored).notes('claude-companion'),['The player at the nook is called Sam and loves stairs.']);
 const memory=memoryFor(restored);for(let i=0;i<12;i++)memory.remember('claude-companion',`note ${i} `+'x'.repeat(200));
 const notes=memory.notes('claude-companion');assert.equal(notes.length,MEMORY_LIMIT);assert.ok(notes.every(n=>n.length<=120));assert.match(notes.at(-1),/^note 11/);
 memory.remember('claude-companion','NOTE 11 '+'x'.repeat(200));assert.equal(memory.notes('claude-companion').length,MEMORY_LIMIT);
});
test('at night Claude walks home to the nook and stays there',()=>{
 const room=scene(),w=room.world,e=room.simulation.spawn('claude-companion'),home=floor(w,84,33);e.position=ground(w,78,38);room.phase=.76;
 let seed=3;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const idle=new IdleBehavior(room,e,{home,sleepAtNight:true,lines:['Hi!'],random});
 for(let i=0;i<60*40;i++){idle.tick(1/60);room.simulation.tick(1/60);}
 assert.ok(Math.hypot(e.position.x-home.x,e.position.z-home.z)<1.6,'home by now');
 const settled={...e.position};for(let i=0;i<60*20;i++){idle.tick(1/60);room.simulation.tick(1/60);}
 assert.ok(Math.hypot(e.position.x-settled.x,e.position.z-settled.z)<.1,'dozing, not wandering');
});
