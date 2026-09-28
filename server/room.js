import { registerTerrain } from './terrain.js';
import { Ecology } from './ecology.js';
import { BLOCK_COUNT, restoreInventory } from '../src/blocks.js';
import { Claims } from './claims.js';
import { Stockpile } from './stockpile.js';
import { BlueprintLibrary } from './building/library.js';
import { BuildOrders } from './jobs/orders.js';
import { MissionBoard } from './missions/board.js';
import { createActions } from '../src/actions.js';
import { randomUUID } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { generateWorld, World, SIZE } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { loadGame } from '../src/storage.js';

import { isCompanionId } from '../src/presence.js';
export { isCompanionId };
// Input frames a client may queue before the server catches up in one tick.
export const INPUT_BACKLOG=4;
export function entityState(e) {
 return {id:e.id,position:e.position,velocity:e.velocity,direction:e.direction,grounded:e.grounded,inventory:Array.from(e.inventory),selected:e.selected,breaking:e.breaking,speech:e.speech,speechUntil:e.speechUntil,gesture:e.gesture};
}
// Days last about 10 minutes and nights about 4, so the crew stays up while people build.
// Night is when sin(2π·phase) < -0.2 (the same test companions use), about 43.6% of the phase.
export const DAY_SECONDS=600,NIGHT_SECONDS=240,NIGHT_FRACTION=0.5-Math.asin(0.2)/Math.PI;
export const advancePhase=(phase,dt)=>{const night=Math.sin(phase*Math.PI*2)<-.2;return (phase+dt*(night?NIGHT_FRACTION/NIGHT_SECONDS:(1-NIGHT_FRACTION)/DAY_SECONDS))%1;};
const round=n=>Math.round(n*100)/100;
export function compactEntity(e,owner=false){
 const state={id:e.id,p:[round(e.position.x),round(e.position.y),round(e.position.z)],v:[round(e.velocity.x),round(e.velocity.y),round(e.velocity.z)],d:[round(e.direction.x),round(e.direction.y),round(e.direction.z)],g:e.grounded?1:0,s:e.selected};
 if(owner)state.i=Array.from(e.inventory);
 if(e.breaking)state.b=e.breaking;if(e.speech&&e.speechUntil>0){state.t=e.speech;state.u=e.speechUntil;}if(e.gesture)state.ge=e.gesture;return state;
}
// Gestures are ephemeral: replicated live, never saved.
function savedEntity(e){const {gesture,...state}=entityState(e);return state;}
// Format 2 stores the grid as base64 with its size. Format 1 (the original
// 64×48×64 JSON array) is migrated once, after copying the file aside.
function readSave(file,directory) {
 const d=JSON.parse(readFileSync(file,'utf8'));
 if(d.format===2){
  const blocks=Buffer.from(typeof d.blocks==='string'?d.blocks:'','base64');
  if(!d.size||d.size.x!==SIZE.x||d.size.y!==SIZE.y||d.size.z!==SIZE.z||blocks.length!==SIZE.x*SIZE.y*SIZE.z||blocks.some(id=>id>=BLOCK_COUNT)||!Number.isInteger(d.seed)||!Number.isFinite(d.phase)||!Array.isArray(d.players))throw Error('Server save is invalid; preserved on disk. Restore a backup before starting.');
  const world=new World(d.seed);world.blocks.set(blocks);world.markAllDirty();
  return {world,phase:d.phase,players:d.players,imported:!!d.imported,edited:!!d.edited,companions:d.companions??{},extensions:d.extensions??{}};
 }
 const loaded=loadGame({getItem:()=>JSON.stringify(d.world)});
 if(loaded.status!=='loaded'||!Array.isArray(d.players))throw Error('Server save is invalid; preserved on disk. Restore a backup before starting.');
 copyFileSync(file,join(directory,`before-frontier-${new Date().toISOString().replaceAll(':','-')}.json`));
 return {world:loaded.world,phase:loaded.phase,players:d.players,imported:d.imported,edited:d.edited,companions:d.companion?{'codex-companion':d.companion}:{},migrated:true};
}
export const AWAY_AFTER=5*60*1000;
export class Room {
 constructor(directory) {
  this.directory=directory;mkdirSync(directory,{recursive:true,mode:0o700});this.file=join(directory,'world.json');if(!existsSync(this.file)&&existsSync(this.file+'.bak'))renameSync(this.file+'.bak',this.file);const hadSave=existsSync(this.file);
  this.world=generateWorld();this.simulation=new Simulation(this.world);this.players=new Map();this.clients=new Map();this.phase=.24;this.imported=false;this.edited=false;this.changes=new Map();this.packed=null;this.extensions=new Map();this.savedExtensions={};this.dirty=false;this.saveTimer=null;this.lastSave=0;this.saveCount=0;
  this.trace=()=>{};this.simulation.trace=(type,fields)=>this.trace(type,fields);
  if(existsSync(this.file)) {
   const d=readSave(this.file,directory);
   this.world=d.world;this.simulation=new Simulation(this.world);this.simulation.trace=(type,fields)=>this.trace(type,fields);this.phase=d.phase;this.imported=d.imported;this.edited=d.edited;this.migrated=!!d.migrated;
   this.players=new Map(d.players);this.savedExtensions=d.extensions??{};
   for(const [id,state] of Object.entries(d.companions)){if(!isCompanionId(id))continue;const e=this.simulation.spawn(id);Object.assign(e,state,{id,inventory:restoreInventory(state.inventory),speech:"",speechUntil:0,breaking:null,gesture:null});}
  }
  const set=this.world.set.bind(this.world);
  this.world.set=(x,y,z,id)=>{const before=this.world.get(x,y,z);const result=set(x,y,z,id);if(result){this.changes.set(this.world.index(x,y,z),id);this.edited=true;this.markDirty();this.ecology?.changed({x,y,z},before,id);this.orders?.cellChanged({x,y,z});}return result;};
  this.simulation.onChange=()=>this.markDirty();
  this.simulation.onTransfer=(e,result)=>{for(const [socket,c] of this.clients)if(c.entity===e)socket.send(JSON.stringify({type:'transfer-result',...result}));};
  const terrainMigrated=registerTerrain(this,{fresh:!hadSave});
  this.ecology=new Ecology(this);
  this.simulation.onPlace=(pos,id)=>this.ecology.placed(pos,id);
  this.claims=new Claims(this);
  this.stockpile=new Stockpile(this);
  this.blueprints=new BlueprintLibrary(this);
  this.orders=new BuildOrders(this);
  this.missions=new MissionBoard(this);
  if(this.migrated||terrainMigrated)this.save();
 }
 // A feature that needs its own durable or replicated state registers here instead
 // of editing save() and the welcome message: extend(key, {save(), load(data), snapshot()}).
 // Saved data for keys no running code registered is kept untouched.
 extend(key,extension){
  if(this.extensions.has(key))throw Error(`Room extension ${key} already registered`);
  this.extensions.set(key,extension);
  if(key in this.savedExtensions)extension.load?.(this.savedExtensions[key]);
  return extension;
 }
 extensionSnapshots(){return Object.fromEntries([...this.extensions].filter(([,x])=>x.snapshot).map(([k,x])=>[k,x.snapshot()]));}
 // Send one message to every connected browser.
 sendAll(message){const raw=JSON.stringify(message);for(const s of this.clients.keys())if(s.readyState===1)s.send(raw);}
 connect(socket,credential,{compress=false}={}) {
  let token=typeof credential==='string'&&this.players.has(credential)?credential:randomUUID();
  // Close a tab this player already has open first: disconnect() stores its live state,
  // so the new tab continues from that rather than from the last save.
  for(const [other,c] of this.clients)if(c.token===token){this.trace('join.replaced',{who:c.entity.id,level:'warn',msg:'Player opened in another tab'});other.close(4001,'Opened in another tab');this.disconnect(other);}
  const saved=this.players.get(token);const id=saved?.id??randomUUID();
  const e=this.simulation.spawn(id);
  if(saved){Object.assign(e,{position:saved.position,selected:saved.selected});e.inventory=restoreInventory(saved.inventory);}
  this.players.set(token,savedEntity(e));this.markDirty();this.clients.set(socket,{token,entity:e,frames:[],expires:0,sequence:-1,ack:-1,count:0,compress,active:Date.now(),away:false});
  this.missions?.retryPayouts(id);
  socket.send(JSON.stringify({type:'welcome',token,you:id,chat:this.chat?.entries??[],agentStatus:this.agentStatus??null,agents:this.agents??{},modes:this.modes??[],extensions:this.extensionSnapshots(),...this.snapshot(compress,id)}));return e;
 }
 // Most of the sky is air; raw deflate turns ~1 MB of blocks into tens of KB.
 packedBlocks(){if(this.packed?.revision!==this.world.revision)this.packed={revision:this.world.revision,data:deflateRawSync(this.world.blocks).toString('base64')};return this.packed.data;}
 snapshot(compress=false,ownerId=null){return {seed:this.world.seed,size:SIZE,encoding:compress?'deflate-raw':'raw',blocks:compress?this.packedBlocks():Buffer.from(this.world.blocks).toString('base64'),revision:this.world.revision,phase:this.phase,time:this.simulation.time,entities:[...this.simulation.entities.values()].map(e=>compactEntity(e,e.id===ownerId)),canImport:!this.imported&&!this.edited};}
 disconnect(socket){const c=this.clients.get(socket);if(!c)return;this.trace('join.leave',{who:c.entity.id,msg:`${c.entity.id.slice(0,8)} left`});this.players.set(c.token,savedEntity(c.entity));this.simulation.entities.delete(c.entity.id);this.simulation.queue=this.simulation.queue.filter(a=>a.entityId!==c.entity.id);this.clients.delete(socket);this.markDirty();}
 notice(socket,text){this.trace('notice',{who:this.clients.get(socket)?.entity.id,text,msg:text});socket.send(JSON.stringify({type:'notice',text}));}
 // A player is here when they have played in the last five minutes and their browser is
 // not in island view, a hidden tab or the title screen. Companions think on their own
 // (reflect, greet, look) only while someone is here.
 touch(socket){const c=this.clients.get(socket);if(c)c.active=Date.now();}
 present(now=Date.now()){return [...this.clients.values()].filter(c=>!c.away&&now-(c.active??now)<AWAY_AFTER);}
 receive(socket,m) {
  const c=this.clients.get(socket);if(!c)throw Error('Join first');
  if(++c.count>100)throw Error('Too many messages');
  if(m.type==='input') {
   if(!Array.isArray(m.frames)||m.frames.length<1||m.frames.length>6||c.frames.length+m.frames.length>30)throw Error('Invalid input frames');
   const validated=[];let sequence=c.sequence;
   for(const frame of m.frames){
    if(!Number.isSafeInteger(frame.sequence)||frame.sequence<=sequence||!Array.isArray(frame.actions)||frame.actions.length>12)throw Error('Invalid input');
    const actions=[],api=createActions(c.entity.id,a=>actions.push(a));
    for(const a of frame.actions){
     if(!a||!['move','jump','lookAt','breakBlock','placeBlock','say','emote','pointAt','give','deposit','withdraw'].includes(a.type))throw Error('Unknown action');
     if(a.type==='give'&&!isCompanionId(a.targetId))throw Error('Choose Codex or Claude to receive items');
     const args=a.type==='give'?[a.targetId,a.blockId,a.count]:['deposit','withdraw'].includes(a.type)?[a.blockId,a.count]:a.type==='emote'?[a.name]:a.type==='pointAt'?[a.pos]:a.type==='move'?[a.dir]:a.type==='lookAt'?[a.target]:a.type==='placeBlock'?[a.pos,a.blockId]:a.type==='breakBlock'?[a.pos]:a.type==='say'?[a.text]:[];
     api[a.type](...args);
    }
    validated.push({sequence:frame.sequence,actions});sequence=frame.sequence;
   }
   c.sequence=sequence;c.frames.push(...validated);c.expires=Date.now()+300;
   // Walking, jumping, mining or placing counts as playing; standing still does not.
   if(validated.some(f=>f.actions.some(a=>a.type==='move'?a.dir&&(a.dir.x||a.dir.z):a.type!=='lookAt')))c.active=Date.now();
   if(Number.isInteger(m.selected)&&m.selected>=1&&m.selected<BLOCK_COUNT)c.entity.selected=m.selected;
  }else if(m.type==='presence')c.away=m.away===true;
  else if(m.type==='claim')this.claims.receive(c.entity,m);
  else if(m.type==='blueprint-save')this.blueprints.save(c.entity,m);
  else if(m.type==='blueprint-delete')this.blueprints.delete(c.entity,m.key);
  else if(m.type==='build-order')this.orders.post(c.entity,m);
  else if(m.type==='build-order-cancel')this.orders.cancel(c.entity,m.id);
  else if(m.type==='mission-post')this.missions.post(c.entity,m);
  else if(m.type==='mission-cancel')this.missions.cancel(c.entity,m.id);
  else if(m.type==='mission-accept')this.missions.accept(c.entity,m.id);
  else if(m.type==='craft')this.simulation.craft(c.entity,'planks');
  else if(m.type==='craft-material'){const ok=this.simulation.craft(c.entity,m.recipe??m.blockId);this.notice(socket,ok?this.simulation.notice:this.simulation.notice||'Unknown recipe.');}
  else if(m.type==='day'){this.phase=this.phase<.5?.76:.24;this.markDirty();}
  else if(m.type==='save'){this.save();this.notice(socket,'Shared world saved on the Mac.');}
  else if(m.type==='import'){
   if(this.imported||this.edited)throw Error('Import is locked because this shared world already has edits. Your local save is still safe.');
   const d=loadGame({getItem:()=>JSON.stringify(m.save)});if(d.status!=='loaded')throw Error('Invalid local save');
   this.flushSave();copyFileSync(this.file,join(this.directory,`before-import-${Date.now()}.json`));
   this.world.blocks.set(d.world.blocks);this.world.seed=d.world.seed;this.world.revision++;this.world.edits=[];this.world.markAllDirty();this.ecology.resetForImport();this.phase=d.phase;this.imported=true;
   c.entity.inventory=d.inventory;c.entity.position=d.position;c.entity.selected=d.selected;
   this.markDirty();this.flushSave();for(const [s,p] of this.clients)s.send(JSON.stringify({type:'welcome',you:p.entity.id,token:p.token,chat:this.chat?.entries??[],agentStatus:this.agentStatus??null,agents:this.agents??{},modes:this.modes??[],extensions:this.extensionSnapshots(),...this.snapshot(p.compress,p.entity.id)}));
  }else throw Error('Unknown message');
 }
 tick(dt){for(const c of this.clients.values()){
  if(Date.now()>=c.expires)c.frames=[];
  // One frame per tick, but a browser whose clock runs a little faster than ours
  // builds a backlog; fold the excess into this tick so input latency stays bounded.
  // Moves and looks are last-wins within a tick; one-shot actions all still apply.
  const take=c.frames.length>INPUT_BACKLOG?c.frames.length-INPUT_BACKLOG+1:1;
  const frames=c.frames.splice(0,take);
  if(frames.length){for(const frame of frames)this.simulation.queue.push(...frame.actions);const last=frames.at(-1);c.ack=last.sequence;c.breaking=last.actions.find(a=>a.type==='breakBlock')??null;}
  else if(Date.now()<c.expires&&c.breaking)c.entity.actions.breakBlock(c.breaking.pos);
 }this.simulation.tick(dt);this.ecology.tick(dt);this.missions.tick();this.phase=advancePhase(this.phase,dt);}
 broadcast(){const base={type:'state',revision:this.world.revision,changes:[...this.changes],phase:this.phase,time:this.simulation.time,canImport:!this.imported&&!this.edited};this.changes.clear();const entities=[...this.simulation.entities.values()];const publicEntities=entities.map(e=>compactEntity(e));for(const [s,c] of this.clients){if(s.readyState===1&&s.bufferedAmount<2e6){const states=publicEntities.map((state,i)=>entities[i]===c.entity?compactEntity(entities[i],true):state);s.send(JSON.stringify({...base,entities:states,ack:c.ack}));}else s.close(1013,'Reconnect for a fresh snapshot');c.count=0;}}
 markDirty(){this.dirty=true;if(this.saveTimer)return;const delay=1000;this.saveTimer=setTimeout(()=>{this.saveTimer=null;try{this.flushSave();}catch(error){this.trace('save.failed',{level:'error',msg:error.message});}},delay);this.saveTimer.unref?.();}
 flushSave(){if(this.saveTimer){clearTimeout(this.saveTimer);this.saveTimer=null;}if(!this.dirty&&existsSync(this.file))return false;this.writeSave();this.dirty=false;this.lastSave=Date.now();this.saveCount++;return true;}
 save(){this.dirty=true;return this.flushSave();}
 writeSave(){for(const c of this.clients.values())this.players.set(c.token,savedEntity(c.entity));
  const companions=Object.fromEntries([...this.simulation.entities.values()].filter(e=>isCompanionId(e.id)).map(e=>[e.id,savedEntity(e)]));
  const extensions={...this.savedExtensions};for(const [key,x] of this.extensions)if(x.save)extensions[key]=x.save();this.savedExtensions=extensions;
  const data={format:2,seed:this.world.seed,size:SIZE,blocks:Buffer.from(this.world.blocks).toString('base64'),phase:this.phase,players:[...this.players],imported:this.imported,edited:this.edited,companions,extensions};
  const temp=this.file+'.tmp',fd=openSync(temp,'w',0o600);try{writeFileSync(fd,JSON.stringify(data));fsyncSync(fd);}finally{closeSync(fd);}if(existsSync(this.file))renameSync(this.file,this.file+'.bak');renameSync(temp,this.file);
 }
}
