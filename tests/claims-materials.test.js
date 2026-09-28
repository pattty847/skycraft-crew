import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { BLOCK_COUNT, B } from '../src/blocks.js';
import { observe } from '../server/observation.js';
import { tempRoom,restart,join,input } from './helpers.js';
function setup(t){const room=tempRoom(t,{prefix:'sky-claims-'}),{socket:a,entity:owner}=join(room),{socket:b,entity:other}=join(room);return {room,a,b,owner,other};}
function claim(room,a,protectPlayers=true){room.receive(a,{type:'claim',operation:'create',name:'Shelter',min:{x:32,y:20,z:37},max:{x:37,y:30,z:41},protectPlayers});return room.claims.items.find(c=>c.name==='Shelter');}
test('claims reject companion edits and other players; owners retain editing rights',t=>{
 const {room,a,owner,other}=setup(t);claim(room,a);const bot=room.simulation.spawn('codex-companion'),p={x:33,y:room.world.top(33,39),z:39};bot.position={...owner.position};
 assert.equal(room.simulation.canEdit(bot,p,'break'),false);assert.equal(room.simulation.canEdit(other,p,'place'),false);assert.equal(room.simulation.canEdit(owner,p,'place'),true);
 const before=room.world.get(p.x,p.y,p.z);for(let i=0;i<200;i++){bot.actions.breakBlock(p);room.tick(1/60);}assert.equal(room.world.get(p.x,p.y,p.z),before);
 const empty={x:33,y:p.y+1,z:39};bot.inventory[B.PLANKS]=5;assert.equal(room.simulation.place(bot,empty,B.PLANKS),false);assert.equal(bot.inventory[B.PLANKS],5);
 assert.ok(observe(room,bot,owner).claims.some(c=>c.name==='Shelter'));assert.ok(!observe(room,bot,owner).reachableBlocks.some(b=>b.pos.x===p.x&&b.pos.y===p.y&&b.pos.z===p.z));
});
test('only owners manage claims; overlap, oversized, remote and malformed claims fail',t=>{
 const {room,a,b}=setup(t),c=claim(room,a);assert.throws(()=>room.receive(b,{type:'claim',operation:'remove',id:c.id}));assert.throws(()=>claim(room,b));
 for(const max of [{x:80,y:30,z:41},{x:37.5,y:30,z:41}])assert.throws(()=>room.receive(a,{type:'claim',operation:'create',name:'Bad',min:{x:32,y:20,z:37},max,protectPlayers:true}));
 room.receive(a,{type:'claim',operation:'remove',id:c.id});assert.equal(room.claims.items.length,1);
});
test('claims persist, reach joining clients, and can allow other human players',t=>{
 const {room,a,other}=setup(t);const c=claim(room,a,false);assert.equal(room.simulation.canEdit(other,c.min,'break'),true);
 const restored=restart(room);assert.deepEqual(restored.claims.items,room.claims.items);assert.deepEqual(join(restored).welcome.extensions.claims,room.claims.items);
});
test('crew claim allows companions and blocks players; only an owner can enable companion building',t=>{
 const {room,a,b,owner,other}=setup(t),bot=room.simulation.spawn('codex-companion'),crew={x:56,y:20,z:96};
 assert.equal(room.simulation.canEdit(bot,crew,'place'),true);
 assert.equal(room.simulation.canEdit(other,crew,'place'),false);
 assert.throws(()=>room.receive(a,{type:'claim',operation:'remove',id:'crew-isle'}));
 const c=claim(room,a),p=c.min;
 assert.equal(room.simulation.canEdit(bot,p,'place'),false);
 assert.throws(()=>room.receive(b,{type:'claim',operation:'authorize',id:c.id,allowCompanions:true}));
 assert.throws(()=>room.receive(a,{type:'claim',operation:'authorize',id:c.id,allowCompanions:'true'}));
 assert.equal(room.simulation.canEdit(bot,p,'place'),false);
 room.receive(a,{type:'claim',operation:'authorize',id:c.id,allowCompanions:true});
 assert.equal(room.simulation.canEdit(bot,p,'place'),true);
 assert.equal(room.simulation.canEdit(bot,p,'break'),false);
 assert.equal(room.simulation.canEdit(owner,p,'break'),true);
 const restored=restart(room);assert.equal(restored.claims.items.find(x=>x.id===c.id).allowCompanions,true);
});
test('browser give is bound to sender, conserves inventory, validates target and reports refusal',t=>{
 const {room,a,owner,other}=setup(t),bot=room.simulation.spawn('claude-companion');bot.position={...owner.position,x:owner.position.x+1};
 const before=bot.inventory[9];input(room,a,0,{type:'give',entityId:other.id,targetId:bot.id,blockId:9,count:4});
 assert.equal(owner.inventory[9],20);assert.equal(other.inventory[9],24);assert.equal(bot.inventory[9],before+4);assert.equal(a.messages.at(-1).ok,true);
 bot.position.x+=20;input(room,a,1,{type:'give',targetId:bot.id,blockId:9,count:4});assert.equal(a.messages.at(-1).ok,false);assert.equal(owner.inventory[9],20);
 assert.throws(()=>room.receive(a,{type:'input',frames:[{sequence:2,actions:[{type:'give',targetId:other.id,blockId:9,count:1}]}]}));
});
test('old inventory stacks expand once; Clay and Lamp roundtrip and craft conservatively',t=>{
 const {room,a,owner}=setup(t);room.save();const d=JSON.parse(readFileSync(room.file));d.players[0][1].inventory=d.players[0][1].inventory.slice(0,10);writeFileSync(room.file,JSON.stringify(d));const restored=restart(room),{entity:player}=join(restored,{token:a.messages[0].token});
 assert.equal(player.inventory.length,BLOCK_COUNT);assert.equal(player.inventory[9],24);assert.equal(player.inventory[11],0);
 player.inventory[2]=2;player.inventory[4]=1;player.inventory[7]=1;assert.equal(restored.simulation.craftMaterial(player,B.CLAY),true);assert.equal(player.inventory[10],4);assert.equal(player.inventory[2],0);assert.equal(player.inventory[4],0);assert.equal(restored.simulation.craftMaterial(player,B.LAMP),true);assert.equal(player.inventory[7],0);assert.equal(player.inventory[9],23);
 restored.world.set(0,1,0,B.CLAY);restored.world.set(0,2,0,B.LAMP);restored.save();const again=restart(restored);assert.equal(again.world.get(0,1,0),10);assert.equal(again.world.get(0,2,0),11);
 assert.equal(restored.simulation.craftMaterial(player,B.LAMP),false);
});
