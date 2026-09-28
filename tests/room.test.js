import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { Room } from '../server/room.js';
import { BLOCK_COUNT } from '../src/blocks.js';
import { saveGame,legacyBlocks } from '../src/storage.js';
import { generateWorld,SIZE } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { PathSearch,pointGoal } from '../server/navigation/pathfinder.js';
const socket=()=>({readyState:1,bufferedAmount:0,messages:[],send(raw){this.messages.push(JSON.parse(raw));},close(){this.readyState=3;}});
function setup(t){const dir=mkdtempSync(join(tmpdir(),'sky-room-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return new Room(dir);}
test('two clients receive the same block edits and cannot control another entity',t=>{
 const room=setup(t),a=socket(),b=socket(),one=room.connect(a),two=room.connect(b);
 const pos={x:33,y:room.world.top(33,39),z:39},id=room.world.get(pos.x,pos.y,pos.z);
 for(let i=0;i<180;i++){room.receive(a,{type:'input',frames:[{sequence:i,actions:[{entityId:two.id,type:'breakBlock',pos}]}]});room.tick(1/60);if(i%3===0)room.broadcast();}
 assert.equal(room.world.get(pos.x,pos.y,pos.z),0);assert.equal(one.inventory[id],1);assert.equal(two.inventory[id],0);
 room.broadcast();assert.deepEqual(a.messages.at(-1).changes,b.messages.at(-1).changes);assert.ok(a.messages.some(m=>m.changes?.length));
});
test('expired movement and mining intents stop; replayed sequences are rejected',t=>{
 const room=setup(t),s=socket(),e=room.connect(s);const before={...e.position};
 room.receive(s,{type:'input',frames:[{sequence:5,actions:[{type:'move',dir:{x:1,y:0,z:0}}]}]});room.clients.get(s).expires=0;room.tick(1/60);
 assert.equal(e.position.x,before.x);assert.throws(()=>room.receive(s,{type:'input',frames:[{sequence:5,actions:[]}]}));assert.equal(e.breaking,null);
});
test('inventory, edits and identity survive disconnect and server restart',t=>{
 const room=setup(t),s=socket(),e=room.connect(s);room.simulation.craftPlanks(e);room.world.set(0,1,0,9);const token=s.messages[0].token,id=e.id;
 room.disconnect(s);room.flushSave();const restored=new Room(room.directory),next=socket(),player=restored.connect(next,token);
 assert.equal(player.id,id);assert.equal(player.inventory[9],28);assert.equal(player.inventory[5],2);assert.equal(restored.world.get(0,1,0),9);
});
test('local import backs up server state and locks after edits',t=>{
 const room=setup(t),s=socket();room.connect(s);room.save();
 const device=generateWorld(),stored={setItem:(k,v)=>{stored.value=v;}};device.set(1,0,0,9);saveGame(device,new Simulation(device).spawn(),.3,stored);const save=JSON.parse(stored.value);
 room.receive(s,{type:'import',save});assert.ok(readdirSync(room.directory).some(f=>f.startsWith('before-import-')));assert.equal(room.world.blocks[1],9);assert.throws(()=>room.receive(s,{type:'import',save}));
});
test('invalid actions cannot mutate blocks or grant inventory',t=>{
 const room=setup(t),s=socket(),e=room.connect(s),before=room.world.revision;
 assert.throws(()=>room.receive(s,{type:'input',frames:[{sequence:0,actions:[{type:'placeBlock',pos:{x:1,y:1,z:1},blockId:99}]}]}));
 assert.equal(room.world.revision,before);assert.equal(e.inventory[9],24);
});
test('input batches acknowledge simulated frames and preserve mining between packets',t=>{
 const room=setup(t),s=socket(),e=room.connect(s);const pos={x:33,y:room.world.top(33,39),z:39};
 room.receive(s,{type:'input',frames:[0,1,2].map(sequence=>({sequence,actions:[{type:'breakBlock',pos}]}))});
 room.tick(1/60);room.tick(1/60);room.tick(1/60);room.tick(1/60);room.broadcast();
 assert.equal(s.messages.at(-1).ack,2);assert.ok(e.breaking.elapsed>3/60);
 room.receive(s,{type:'input',frames:[{sequence:3,actions:[]}]});room.tick(1/60);assert.equal(e.breaking,null);
});

test('a v1 server save migrates once: edits, players and Codex survive; the original is kept aside',t=>{
 const dir=mkdtempSync(join(tmpdir(),'sky-legacy-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const old=generateWorld(230925,{frontier:false});old.set(33,24,39,9);old.set(40,22,38,5);
 const blocks=legacyBlocks(old),player={id:'p-1',position:{x:34.5,y:24,z:39.5},velocity:{x:0,y:0,z:0},direction:{x:0,y:0,z:1},grounded:true,inventory:[0,1,0,0,0,3,0,0,0,24],selected:9};
 const v1={world:{version:1,seed:230925,blocks,phase:.4,inventory:player.inventory,selected:9,position:player.position},players:[['token-1',player]],imported:true,edited:true,companion:{...player,id:'codex-companion',inventory:[0,0,0,0,0,0,0,0,0,7]}};
 writeFileSync(join(dir,'world.json'),JSON.stringify(v1));
 const room=new Room(dir);
 assert.equal(room.world.get(33,24,39),9,'placed block kept');assert.equal(room.world.get(40,22,38),5,'a saved block wins over a new bridge plank');
 assert.equal(room.world.get(60,22,38),9,'bridge planks fill empty sky');assert.ok(room.world.top(86,90)>20,'Ironcrag exists');
 assert.equal(room.simulation.entities.get('codex-companion').inventory[9],7);assert.equal(room.players.get('token-1').id,'p-1');
 const backups=readdirSync(dir).filter(f=>f.startsWith('before-frontier-'));assert.equal(backups.length,1);assert.deepEqual(JSON.parse(readFileSync(join(dir,backups[0]))),v1);
 const saved=JSON.parse(readFileSync(join(dir,'world.json')));assert.equal(saved.format,2);assert.deepEqual(saved.size,SIZE);
 const again=new Room(dir);assert.deepEqual(again.world.blocks,room.world.blocks);assert.equal(readdirSync(dir).filter(f=>f.startsWith('before-frontier-')).length,1);
});
test('a corrupt v2 save stops startup instead of replacing the world',t=>{
 const dir=mkdtempSync(join(tmpdir(),'sky-bad-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(join(dir,'world.json'),JSON.stringify({format:2,seed:1,size:SIZE,blocks:'AAAA',phase:.2,players:[]}));
 assert.throws(()=>new Room(dir),/invalid/);assert.equal(JSON.parse(readFileSync(join(dir,'world.json'))).blocks,'AAAA');
});
test('joining clients that support it get a compressed snapshot of the same blocks',t=>{
 const room=setup(t),plain=socket(),packed=socket();room.connect(plain);room.connect(packed,undefined,{compress:true});
 const a=plain.messages[0],b=packed.messages[0];assert.equal(b.encoding,'deflate-raw');assert.ok(b.blocks.length*10<a.blocks.length);
 assert.deepEqual(inflateRawSync(Buffer.from(b.blocks,'base64')),Buffer.from(a.blocks,'base64'));
});

test('room extensions persist, reach joining browsers, and unknown extensions survive a save',t=>{
 const room=setup(t);let claims=[{id:'house'}];
 room.extend('test-feature',{save:()=>claims,load:data=>{claims=data;},snapshot:()=>({count:claims.length})});
 room.extend('jobs',{save:()=>['build stairs']});room.save();
 const next=new Room(room.directory);let loaded=null;next.extend('test-feature',{save:()=>loaded,load:data=>{loaded=data;}});
 assert.deepEqual(loaded,[{id:'house'}]);next.save();
 const saved=JSON.parse(readFileSync(next.file)).extensions;assert.deepEqual(saved.jobs,['build stairs'],'an extension this server did not register is kept');
 const s=socket();room.connect(s);assert.deepEqual(s.messages[0].extensions,{terrain:{frontier:4},claims:room.claims.items,stockpile:{position:{x:56.5,y:20,z:96.5},items:Array(BLOCK_COUNT).fill(0)},blueprints:room.blueprints.catalog(),orders:[],missions:[],'test-feature':{count:1}});
 assert.throws(()=>room.extend('test-feature',{}),/already registered/);
});

test('Crew Isle migration fills empty cells once and preserves later mining',t=>{
 const room=setup(t),file=room.file;room.save();const save=JSON.parse(readFileSync(file));
 const occupied={x:56,y:19,z:96},cleared={x:57,y:19,z:96};
 save.extensions.terrain={frontier:1};
 const blocks=Buffer.from(save.blocks,'base64');
 blocks[room.world.index(occupied.x,occupied.y,occupied.z)]=9;
 blocks[room.world.index(cleared.x,cleared.y,cleared.z)]=0;
 save.blocks=blocks.toString('base64');writeFileSync(file,JSON.stringify(save));
 const migrated=new Room(room.directory);
 const route=new PathSearch(migrated.world,{x:37.5,y:migrated.world.top(37,96)+1,z:96.5},{...pointGoal({x:56.5,y:20,z:96.5},.6),maxExpanded:2500});
 assert.equal((route.result??route.step()).ok,true,'Sandbar joins Crew Isle by a physically walkable route');
 assert.equal(migrated.world.get(occupied.x,occupied.y,occupied.z),9);
 assert.notEqual(migrated.world.get(cleared.x,cleared.y,cleared.z),0);
 assert.equal(readdirSync(room.directory).filter(f=>f.startsWith('before-forage-')).length,1);
 migrated.world.set(cleared.x,cleared.y,cleared.z,0);migrated.save();
 const restarted=new Room(room.directory);
 assert.equal(restarted.world.get(cleared.x,cleared.y,cleared.z),0);
 assert.equal(restarted.savedExtensions.terrain.frontier,4);
 assert.equal(readdirSync(room.directory).filter(f=>f.startsWith('before-forage-')).length,1);
});

test('a browser slightly faster than the server never builds an input backlog',t=>{
 const room=setup(t),s=socket(),e=room.connect(s),c=room.clients.get(s);let sequence=0,maxBacklog=0,serverTime=0;
 // Three minutes of a 60 Hz client (batches of 3) against a server ticking at 59.6 Hz.
 for(let clientTick=0;clientTick<60*180;clientTick+=3){
  room.receive(s,{type:'input',frames:[0,1,2].map(()=>({sequence:sequence++,actions:[{type:'move',dir:{x:0,y:0,z:0}}]}))});c.count=0;
  while(serverTime<(clientTick+3)/60){room.tick(1/60);serverTime+=1/59.6;}
  maxBacklog=Math.max(maxBacklog,c.frames.length);
 }
 assert.ok(maxBacklog<=6,`backlog reached ${maxBacklog} frames`);assert.equal(c.ack,sequence-1-c.frames.length);
});
