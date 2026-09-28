import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { B } from '../src/blocks.js';
import { Foreman } from '../server/jobs/foreman.js';
import { parseCompanionReply } from '../server/chat.js';
import { tempRoom,restart,ground,companion,scriptModel,attachPlayer } from './helpers.js';
function crew(t){
 const room=tempRoom(t,{prefix:'sky-crew-'}),chat=[];room.chat={entries:[],add:(kind,name,text)=>chat.push({kind,name,text})};
 const claude=companion(room,'claude'),codex=companion(room,'codex');
 const foreman=new Foreman(room,[claude,codex],{interval:.2});
 return {room,chat,claude,codex,foreman};
}
function run(room,parts,until,limit=60*240){for(let i=0;i<limit&&!until();i++){for(const p of parts)p.tick(1/60);room.simulation.tick(1/60);}}
test('a build short of materials: one companion gathers wood for the other, who crafts and builds',t=>{
 const {room,chat,claude,codex,foreman}=crew(t),w=room.world;
 const player=room.simulation.spawn('player');player.position=ground(w,80,38);player.direction={x:0,y:0,z:1};
 const c=claude.entity(),x=codex.entity();c.position=ground(w,82,38);x.position=ground(w,78,38);
 c.inventory.fill(0);x.inventory.fill(0);
 const job=room.jobs.post({kind:'build',spec:{action:{type:'build',blueprint:'stairs',near:'requester',params:{height:4,width:1}},requester:{position:{...player.position},direction:{...player.direction}}},label:'Stairs for Sam',postedBy:'test',requesterId:player.id,prefer:'claude'});
 const before=w.blocks.slice();
 run(room,[foreman,claude,codex],()=>['done','failed'].includes(job.status));
 assert.equal(job.status,'done',`${job.result} | ${chat.map(c=>c.text).join(' / ')}`);
 assert.equal(job.assignee,'claude');assert.ok(chat.some(c=>/took a job/.test(c.text)));
 const placed=[],chopped=[];for(let i=0;i<before.length;i++)if(before[i]!==w.blocks[i])(w.blocks[i]?placed:chopped).push(w.position(i));
 assert.equal(placed.length,7);assert.ok(chopped.length>=2&&chopped.every(p=>before[w.index(p.x,p.y,p.z)]===B.WOOD),'only tree trunks were removed');
});
test('jobs persist; a job that was running when the server stopped goes back on the board',t=>{
 const {room}=crew(t);
 const job=room.jobs.post({kind:'gather',spec:{count:2},label:'Gather 2 wood',postedBy:'test',requesterId:'someone'});room.jobs.update(job,{status:'running',assignee:'codex'});room.save();
 const restored=restart(room);new Foreman(restored,[]);
 assert.equal(restored.jobs.find(job.id).status,'open');assert.equal(JSON.parse(readFileSync(join(room.directory,'world.json'))).extensions.jobs.length,1);
});
test('Foreman builds on Crew Isle but refuses an owner claim without companion access',t=>{
 const {room,claude}=crew(t),w=room.world,bot=claude.entity();
 bot.position=ground(w,56,96);bot.inventory[B.WOOD]=8;bot.inventory[B.PLANKS]=8;
 // Forage is now a real block; clear the bench footprint in this building test.
 for(let x=56;x<=59;x++)for(let z=94;z<=98;z++){const y=w.top(x,z);if(w.get(x,y,z)>=B.SAPLING)w.set(x,y,z,B.AIR);}
 const foreman=new Foreman(room,[claude],{interval:.2}),site={x:57,y:w.top(57,96),z:96};
 const job=room.jobs.post({kind:'build',spec:{action:{type:'build',blueprint:'bench',on:site,facing:'north',params:{}},requester:{position:{...bot.position},direction:{x:0,y:0,z:1}}},label:'Crew bench',postedBy:'test',requesterId:'test',prefer:'claude'});
 run(room,[foreman,claude],()=>['done','failed'].includes(job.status),60*80);
 assert.equal(job.status,'done',job.result);
 const owner=room.simulation.spawn('owner');owner.position=ground(w,34,39);
 room.claims.receive(owner,{operation:'create',name:'Home',min:{x:32,y:19,z:37},max:{x:37,y:30,z:41},protectPlayers:true});
 const home={x:34,y:w.top(34,39),z:39};
 const refused=room.jobs.post({kind:'build',spec:{action:{type:'build',blueprint:'bench',on:home,facing:'north',params:{}},requester:{position:{...owner.position},direction:{x:0,y:0,z:1}}},label:'Home bench',postedBy:'test',requesterId:owner.id,prefer:'claude'});
 run(room,[foreman,claude],()=>['done','failed'].includes(refused.status),60*5);
 assert.equal(refused.status,'failed');assert.match(refused.result,/protected/);
});
test('a plan posts several validated builds; nothing is placed by the plan itself',async t=>{
 const {room,claude}=crew(t),{socket}=attachPlayer(room,{position:ground(room.world,80,38)});room.save=()=>{};
 scriptModel(claude,'{"message":"Here is the plan!","action":{"type":"plan","jobs":[{"blueprint":"bench","near":"requester"},{"blueprint":"arch","near":"requester","facing":"east","who":"codex"}]}}');
 const revision=room.world.revision;await claude.run(socket,{mode:'build',text:'decorate here'});
 assert.equal(room.jobs.jobs.length,2);assert.equal(room.jobs.jobs[1].prefer,'codex');assert.equal(room.world.revision,revision);assert.match(claude.status,/Posted 2 jobs/);
 assert.throws(()=>parseCompanionReply('{"message":"x","action":{"type":"plan","jobs":[]}}','build',{pointableBlocks:[]}),/1 to 6/);
});
