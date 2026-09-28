import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, World } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { standingPoint, resolvePlace, placeNames } from '../server/navigation/places.js';
import { GotoTask } from '../server/navigation/goto.js';
import { ApproachTask } from '../server/navigation/approach.js';
import { parseCompanionReply } from '../server/chat.js';
import { tempRoom, companion, scriptModel, attachPlayer, until } from './helpers.js';

test('place names resolve on the server, including a fixed snapshot of the requester',t=>{
 const room=tempRoom(t,{prefix:'sky-place-'}),player=room.simulation.spawn('pat'),observer=room.simulation.spawn('codex-companion');player.position=standingPoint(room.world,30,30);observer.position=standingPoint(room.world,31,30);
 assert.equal(resolvePlace(room,'ironcrag').name,'Ironcrag');
 assert.equal(resolvePlace(room,"Claude's home").name,"Claude's home");
 assert.ok(placeNames(room,player).includes('Crew stockpile'));
 const snapshot=resolvePlace(room,'where you are standing now',player);player.position=standingPoint(room.world,80,30);
 assert.notDeepEqual(snapshot.pos,player.position);
 player.position=standingPoint(room.world,30,30);
 assert.ok(placeNames(room,player,observer).includes('where Player pat is standing now'));
 assert.deepEqual(resolvePlace(room,'where Player pat is standing now',player,observer).pos,player.position);
 assert.throws(()=>resolvePlace(room,'a made-up place'),/Try:.*Ironcrag/);
 assert.deepEqual(parseCompanionReply('{"message":"Going","action":{"type":"goto","place":"Ironcrag","pos":{"x":1,"y":1,"z":1}}}','talk',{places:['Ironcrag']}).action,{type:'goto',place:'Ironcrag'});
});

test('named trips cross generated island links through actions within a tick budget',()=>{
 for(const [name,limit] of [['Ironcrag',3000],['Crew Isle',2500]]){
  const world=generateWorld(),simulation=new Simulation(world),entity=simulation.spawn('codex-companion');
  entity.position=standingPoint(world,30,30);entity.grounded=true;
  const task=new GotoTask({world,simulation},entity,name);let ticks=0;
  for(;ticks<limit&&!task.result;ticks++){task.tick(1/60);simulation.tick(1/60);}
  assert.equal(task.result?.ok,true,`${name}: ${task.result?.message}`);
  assert.ok(entity.position.x>50);assert.ok(ticks<limit);
 }
});

test('approach keeps walking while its player target changes position',()=>{
 const world=new World();for(let x=4;x<40;x++)for(let z=4;z<8;z++)world.set(x,0,z,3);
 const simulation=new Simulation(world),entity=simulation.spawn('codex-companion'),player=simulation.spawn('player');
 entity.position={x:5.5,y:1,z:5.5};player.position={x:15.5,y:1,z:5.5};entity.grounded=player.grounded=true;
 const task=new ApproachTask({world,simulation},entity,player.id,{timeout:90});
 for(let tick=0;tick<4000&&!task.result;tick++){
  if(tick%90===0&&player.position.x<34)player.position={...player.position,x:player.position.x+2};
  task.tick(1/60);simulation.tick(1/60);
 }
 assert.equal(task.result?.ok,true,task.result?.message);assert.ok(task.replans>1);
});

test('busy messages appear immediately, latest replaces, dequeue runs, and stop drops pending',async t=>{
 const room=tempRoom(t,{prefix:'sky-queue-',chat:true}),agent=companion(room,'claude'),{socket}=attachPlayer(room);
 const trace=[];room.trace=(type,fields)=>trace.push({type,...fields});
 let release;const {payloads}=scriptModel(agent,(_,turn)=>turn===0?new Promise(resolve=>{release=resolve;}):'{"message":"Done","action":null}',{observation:{places:['Ironcrag']}});
 const seen=()=>payloads.map(p=>p.message);
 const first=agent.run(socket,{mode:'talk',text:'first'});await until(()=>release,{label:'the first model call'});
 await agent.run(socket,{mode:'talk',text:'older'});await agent.run(socket,{mode:'talk',text:'newer'});
 assert.deepEqual(room.chat.entries.filter(e=>e.kind==='user').map(e=>e.text),['first','older','newer']);
 assert.ok(room.chat.entries.some(e=>e.kind==='system'&&/replaced by the latest/.test(e.text)));
 assert.equal(agent.pending.request.text,'newer');assert.ok(trace.some(e=>e.type==='companion.dropped'&&e.reason==='replaced'));
 release('{"message":"First done","action":null}');await first;
 await until(()=>seen().includes('newer'),{label:'the queued message'});
 assert.deepEqual(seen(),['first','newer']);assert.ok(trace.some(e=>e.type==='companion.dequeued'));
 agent.active='busy';await agent.run(socket,{mode:'talk',text:'stop this'});agent.stop();
 assert.equal(agent.pending,null);assert.ok(trace.some(e=>e.type==='companion.dropped'&&e.reason==='stopped'));
 assert.ok(room.chat.entries.some(e=>e.kind==='system'&&/queued message was cancelled/.test(e.text)));
});

test('a message queued behind a board job runs after the job completes',async t=>{
 const room=tempRoom(t,{prefix:'sky-job-queue-',chat:true}),agent=companion(room,'claude'),{socket}=attachPlayer(room);
 const {payloads}=scriptModel(agent,'{"message":"Ready","action":null}',{observation:{places:['Ironcrag']}}),seen=()=>payloads.map(p=>p.message);
 const jobTask={result:null,tick(){this.result={ok:true,message:'Job complete'};},cancel(){}};
 agent.startJob({id:'job-1',kind:'build',label:'Build a bench'},jobTask,()=>{});
 await agent.run(socket,{mode:'talk',text:'after your bench'});
 assert.equal(seen().length,0);agent.tick();
 await until(()=>seen().length,{label:'the queued message'});
 assert.deepEqual(seen(),['after your bench']);assert.equal(agent.pending,null);
});
