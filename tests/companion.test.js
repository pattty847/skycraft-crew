import test from 'node:test';
import assert from 'node:assert/strict';
import { tempRoom,restart,companion,scriptModel,attachPlayer,drive,until } from './helpers.js';
function fixture(t){const room=tempRoom(t,{prefix:'sky-agent-'});return {room,agent:companion(room,'codex',{resident:false})};}
test('stopping an in-flight model response prevents its eventual action',async t=>{
 const {room,agent}=fixture(t);let answer;agent.observe=async()=>({observation:{pointableBlocks:[{pos:{x:33,y:22,z:39}}]},image:''});
 agent.think=()=>new Promise(resolve=>{answer=resolve;});const run=agent.run({},{mode:'auto',text:'Point at that block'});await until(()=>answer,{label:'the model call'});agent.stop();answer('{"message":"There","action":{"type":"pointAt","pos":{"x":33,"y":22,"z":39}}}');await run;
 assert.equal(agent.task,null);assert.equal(room.simulation.queue.length,0);
});
test('the model cannot point at a block outside its bounded observation',async t=>{
 const {room,agent}=fixture(t);scriptModel(agent,'{"message":"There", "action":{"type":"pointAt","pos":{"x":0,"y":0,"z":0}}}',{observation:{pointableBlocks:[]}});
 await agent.run({},{mode:'auto',text:'Point at a block'});assert.equal(agent.task,null);assert.equal(room.simulation.queue.length,0);assert.match(agent.status,/No action executed/);
});
test('companion inventory is durable without any connected human',t=>{
 const {room}=fixture(t);const e=room.simulation.spawn('codex-companion');e.inventory[1]=7;e.speech='Old news';e.speechUntil=9999;room.save();const restored=restart(room),back=restored.simulation.entities.get('codex-companion');assert.equal(back.inventory[1],7);assert.equal(back.speechUntil,0,'speech from a previous run does not reappear after restart');
});
test('repeated companion requests reuse one entity and queue concurrent messages',async t=>{
 const {room,agent}=fixture(t);scriptModel(agent,'{"message":"Hello","action":null}',{observation:{reachableBlocks:[]}});
 await agent.run({}, {mode:'talk',text:'Hi'});await agent.run({}, {mode:'talk',text:'Hi again'});
 assert.equal(room.simulation.entities.size,1);assert.ok(room.simulation.entities.has('codex-companion'));
 agent.active='in-progress';await agent.run({}, {mode:'talk',text:'While busy'});assert.equal(agent.pending.request.text,'While busy');assert.equal(room.simulation.entities.size,1);
});
test('chat approach runs through entity actions, verifies arrival and handles stop during walking',async t=>{
 const {room,agent}=fixture(t);room.save=()=>{};const {socket,player}=attachPlayer(room,{position:{x:30.5,y:24,z:36.5}});
 scriptModel(agent,'{"message":"Coming over!","action":{"type":"approach","targetId":"player"}}',{observation:{requester:{id:player.id},reachableBlocks:[]}});agent.announce=text=>{agent.status=text;};
 const terrain=room.world.blocks.slice();drive(t,room,{tick:()=>agent.tick()});
 await agent.run(socket,{mode:'talk',text:'mere'});assert.match(agent.status,/Arrived/);assert.deepEqual(room.world.blocks,terrain);
 player.position={x:20.5,y:room.world.top(20,32)+1,z:32.5};const second=agent.run(socket,{mode:'talk',text:'come here'});await until(()=>agent.task,{label:'walking'});agent.stop();await second;assert.equal(agent.task,null);assert.equal(agent.active,null);
});
