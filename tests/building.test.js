import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { World,generateWorld } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { B } from '../src/blocks.js';
import { BLUEPRINTS,toWorld,checkParams } from '../server/building/blueprints.js';
import { planBuild,planStairsTo,placementOrder,reachableAfter } from '../server/building/planner.js';
import { findStructures } from '../server/building/structures.js';
import { forModel } from '../server/observation.js';
import { planFor } from '../server/skills/build.js';
import { BuildTask } from '../server/building/build-task.js';
import { PathSearch,pointGoal,standable } from '../server/navigation/pathfinder.js';
import { parseCompanionReply } from '../server/chat.js';
import { Room } from '../server/room.js';
import { Companion,PERSONAS } from '../server/companion.js';
function flat(){const world=new World();for(let x=0;x<30;x++)for(let z=0;z<30;z++)world.set(x,0,z,B.STONE);const simulation=new Simulation(world),room={world,simulation};const e=simulation.spawn('claude');e.position={x:5.5,y:1,z:5.5};e.grounded=true;e.inventory[B.PLANKS]=60;e.inventory[B.WOOD]=10;return {world,simulation,room,e};}
function run(room,task){let worst=0;for(let i=0;i<60*120&&!task.result;i++){const t=performance.now();task.tick(1/60);worst=Math.max(worst,performance.now()-t);room.simulation.tick(1/60);}return {...task.result,worst};}
const walkable=(world,from,to)=>new PathSearch(world,from,pointGoal(to,.6)).step().ok;
const diff=(before,world)=>{const out=[];for(let i=0;i<before.length;i++)if(before[i]!==world.blocks[i])out.push({...world.position(i),from:before[i],to:world.blocks[i]});return out;};

test('blueprints rotate to all four facings and keep their shape',()=>{
 const cells=BLUEPRINTS.stairs.blocks({height:3,width:1}).filter(p=>p.y===p.z);
 const at=facing=>cells.map(p=>toWorld({x:10,y:1,z:10},facing,p));
 assert.deepEqual(at('north').map(p=>[p.x,p.z]).slice(0,3),[[10,10],[10,9],[10,8]]);
 assert.deepEqual(at('east').map(p=>[p.x,p.z]).slice(0,3),[[10,10],[11,10],[12,10]]);
 assert.equal(new Set(at('west').map(p=>`${p.x},${p.y},${p.z}`)).size,cells.length);
 assert.throws(()=>checkParams('stairs',{height:9}),/1 to 8/);assert.deepEqual(checkParams('stairs',{}),{height:3,width:1});
});
test('placement order attaches every block to something solid, lowest first; floating plans are refused',()=>{
 const {world}=flat(),cells=[{x:5,y:3,z:5,id:9},{x:5,y:1,z:5,id:9},{x:5,y:2,z:5,id:9}];
 assert.deepEqual(placementOrder(world,cells).order.map(c=>c.y),[1,2,3]);
 assert.equal(placementOrder(world,[{x:5,y:4,z:5,id:9}]).ok,false);
});
test('stairs are built only through placeBlock, match the plan exactly and can be climbed',()=>{
 const {world,room,e}=flat(),before=world.blocks.slice(),planks=e.inventory[B.PLANKS];
 const plan=planBuild(room,e,{blueprint:'stairs',anchor:{x:10,y:1,z:10},facing:'north',params:{height:4}});
 const result=run(room,new BuildTask(room,e,plan));
 assert.equal(result.ok,true,result.message);assert.ok(result.worst<100,`worst build tick ${result.worst.toFixed(1)} ms`);
 const changed=diff(before,world);assert.equal(changed.length,7);assert.ok(changed.every(c=>c.from===0&&c.to===B.PLANKS));
 assert.equal(e.inventory[B.PLANKS],planks-7,'every block came out of the builder’s inventory');
 assert.ok(walkable(world,{x:10.5,y:1,z:12.5},{x:10.5,y:5,z:7.5}),'the top step is reachable on foot');
});
test('stairs-to reaches a roof: the roof becomes walkable and the house is untouched',()=>{
 const {world,room,e}=flat();
 for(let x=14;x<19;x++)for(let z=14;z<19;z++){world.set(x,4,z,B.PLANKS);if(x===14||x===18||z===14||z===18)for(let y=1;y<4;y++)world.set(x,y,z,B.PLANKS);}
 const house=[];for(let x=14;x<19;x++)for(let y=1;y<5;y++)for(let z=14;z<19;z++)house.push(world.get(x,y,z));
 assert.equal(walkable(world,e.position,{x:16.5,y:5,z:16.5}),false);
 const plan=planStairsTo(room,e,{x:14,y:4,z:16},{near:e.position});assert.equal(plan.params.height,4);
 assert.equal(run(room,new BuildTask(room,e,plan)).ok,true);
 assert.equal(walkable(world,e.position,{x:16.5,y:5,z:16.5}),true);
 const after=[];for(let x=14;x<19;x++)for(let y=1;y<5;y++)for(let z=14;z<19;z++)after.push(world.get(x,y,z));assert.deepEqual(after,house);
});
test('every decorative blueprint builds on flat ground',()=>{
 for(const name of ['bench','arch','fence','path']){
  const {room,e}=flat(),plan=planBuild(room,e,{blueprint:name,anchor:{x:8,y:1,z:10},facing:'east',params:{}});
  assert.equal(run(room,new BuildTask(room,e,plan)).ok,true,name);
 }
});
test('plans are refused before anything is placed: blocked, headroom, materials, protection',()=>{
 const {world,room,e}=flat();
 world.set(10,2,9,B.STONE);assert.throws(()=>planBuild(room,e,{blueprint:'stairs',anchor:{x:10,y:1,z:10},facing:'north',params:{height:3}}),/in the way|headroom/);
 e.inventory[B.PLANKS]=2;assert.throws(()=>planBuild(room,e,{blueprint:'path',anchor:{x:3,y:1,z:3},facing:'east',params:{length:6}}),/Not enough materials: I need 6 planks \(I have 2\)/);
 e.inventory[B.PLANKS]=60;room.simulation.canEdit=(who,p)=>!(p.x===4&&p.z===3);
 assert.throws(()=>planBuild(room,e,{blueprint:'path',anchor:{x:3,y:1,z:3},facing:'east',params:{length:6}}),/protected/);
 room.simulation.canEdit=()=>true;assert.throws(()=>planBuild(room,e,{blueprint:'path',anchor:{x:3,y:9,z:3},facing:'east',params:{length:6}}),/float/);
});
test('a builder never breaks a block that appears in its way',()=>{
 const {world,room,e}=flat(),plan=planBuild(room,e,{blueprint:'path',anchor:{x:8,y:1,z:10},facing:'east',params:{length:8}});
 world.set(13,1,10,B.STONE);const result=run(room,new BuildTask(room,e,plan));
 assert.equal(result.ok,false);assert.match(result.message,/rather than break/);assert.equal(world.get(13,1,10),B.STONE);
});
test('the model may only build on blocks it can see, with known blueprints and bounded params',()=>{
 const o={requester:{id:'me'},pointableBlocks:[{pos:{x:1,y:2,z:3}}],reachableBlocks:[]};
 const parse=action=>parseCompanionReply(JSON.stringify({message:'On it',action}),'build',o).action;
 assert.deepEqual(parse({type:'build',blueprint:'stairs',on:{x:1,y:2,z:3},facing:'north',params:{height:4},extra:1}),{type:'build',blueprint:'stairs',on:{x:1,y:2,z:3},facing:'north',params:{height:4,width:1}});
 assert.deepEqual(parse({type:'build',blueprint:'stairs-to',target:{x:1,y:2,z:3}}),{type:'build',blueprint:'stairs-to',target:{x:1,y:2,z:3}});
 assert.equal(parse({type:'build',blueprint:'bench',near:'requester'}).near,'requester');
 assert.throws(()=>parse({type:'build',blueprint:'stairs',on:{x:9,y:9,z:9}}),/pointableBlocks/);
 assert.throws(()=>parse({type:'build',blueprint:'castle',near:'requester'}),/Unknown blueprint/);
 assert.throws(()=>parse({type:'build',blueprint:'stairs',near:'requester',params:{height:40}}),/1 to 8/);
 assert.throws(()=>parseCompanionReply('{"message":"x","action":{"type":"build","blueprint":"bench","near":"requester"}}','talk',o),/Talk mode rejected/);
});
test('Claude builds stairs from chat, and a refused plan goes back to the model as feedback',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'sky-build-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const room=new Room(directory),claude=new Companion(room,process.cwd(),PERSONAS.claude),socket={readyState:1,send(){}},player=room.simulation.spawn('player');
 const e=room.simulation.entities.get('claude-companion');
 // An open stone platform in empty sky, so nothing but materials can limit the build.
 for(let x=112;x<126;x++)for(let z=4;z<18;z++)room.world.set(x,30,z,B.STONE);
 player.position={x:118.5,y:31,z:8.5};player.direction={x:0,y:0,z:1};room.clients.set(socket,{entity:player});room.save=()=>{};e.position={x:116.5,y:31,z:8.5};
 const messages=[];claude.think=async payload=>{messages.push(payload.message);return messages.length===1
  ?'{"message":"Stairs coming up!","action":{"type":"build","blueprint":"stairs","near":"requester","params":{"height":8,"width":3}}}'
  :'{"message":"Smaller then!","action":{"type":"build","blueprint":"stairs","near":"requester","params":{"height":2}}}';};
 e.inventory[B.PLANKS]=10;
 const timer=setInterval(()=>{claude.tick();room.simulation.tick(1/60);},1);t.after(()=>clearInterval(timer));
 await claude.run(socket,{mode:'build',text:'build me some stairs'});
 assert.match(messages[1],/refused: Not enough materials/);assert.match(claude.status,/Built stairs: 3 blocks/);
});

test('structures are player builds, not trees; each reports its roof',()=>{
 const {world,e}=flat();
 for(let x=14;x<19;x++)for(let z=14;z<19;z++){world.set(x,4,z,B.PLANKS);if(x===14||x===18||z===14||z===18)for(let y=1;y<4;y++)world.set(x,y,z,B.PLANKS);}
 for(let y=1;y<5;y++)world.set(3,y,3,B.WOOD);world.set(3,5,3,B.LEAVES);
 const [house,...rest]=findStructures(world,{x:10,y:1,z:10});
 assert.equal(rest.length,0,'the tree is not a structure');assert.equal(house.kind,'building');assert.equal(house.max.y,4);assert.equal(house.roof.length,25);
});
test('stairs are only planned when they would let the requester walk up, and not when they already can',()=>{
 const {world,room,e}=flat();
 for(let x=14;x<19;x++)for(let z=14;z<19;z++)for(let y=1;y<5;y++)world.set(x,y,z,B.PLANKS);
 const plan=planStairsTo(room,e,{x:14,y:4,z:16},{from:e.position});assert.ok(reachableAfter(world,plan,e.position,{x:14,y:4,z:16}));
 for(let i=0;i<4;i++)for(let y=1;y<=4-i;y++)world.set(13-i,y,16,B.PLANKS);
 assert.throws(()=>planStairsTo(room,e,{x:14,y:4,z:16},{from:e.position}),/already walk up/);
});
test('the model reads compact block lists; validation keeps the full observation',()=>{
 const o={reachableBlocks:[{pos:{x:1,y:2,z:3},id:9,name:'Planks',hardness:.8}],pointableBlocks:[{pos:{x:1,y:2,z:3},id:9,name:'Planks'},{pos:{x:4,y:5,z:6},id:3,name:'Stone'}]};
 const compact=forModel(o);assert.deepEqual(compact.pointableBlocks,{Planks:[[1,2,3]],Stone:[[4,5,6]]});assert.match(compact.blockFormat,/\[x,y,z\]/);
 assert.equal(o.pointableBlocks.length,2,'the original is untouched');
});

test('“near me” at an island edge builds at the nearest spot that works instead of over the void',()=>{
 const w=generateWorld(),simulation=new Simulation(w),room={world:w,simulation},e=simulation.spawn('claude');e.inventory[B.PLANKS]=30;e.inventory[B.WOOD]=10;
 let y=0;for(let yy=46;yy>0&&!y;yy--)if(standable(w,{x:39.5,y:yy,z:40.5}))y=yy;
 const player={position:{x:39.5,y,z:40.5},direction:{x:.7,y:0,z:.7}};
 const plan=planFor(room,e,{type:'build',blueprint:'bench',near:'requester',params:{}},player);
 assert.ok(Math.hypot(plan.anchor.x+.5-player.position.x,plan.anchor.z+.5-player.position.z)<=6);
 assert.ok(plan.cells.every(c=>!w.get(c.x,c.y,c.z)));
});

test('Clay and Lamp builds are structures too',()=>{
 const {world}=flat();for(let x=10;x<13;x++)for(let y=1;y<4;y++)world.set(x,y,10,B.CLAY);world.set(11,4,10,B.LAMP);
 const [s]=findStructures(world,{x:8,y:1,z:8});assert.ok(s);assert.equal(s.cells.length,10);assert.equal(s.kind,'building');
});
