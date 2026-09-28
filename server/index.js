import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { WorldChat,validateChat } from './chat.js';
import { Companion,PERSONAS } from './companion.js';
import { modeMenu } from './skills/index.js';
import { Foreman } from './jobs/foreman.js';
import { Access, GUEST_AI_LIMIT, PASS_OFF } from './access.js';
import { Room } from './room.js';
import { addressees } from './addressing.js';
import { Trace } from './trace.js';
import { grant, setCreative } from './admin.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const room=new Room(process.env.SKY_DATA_DIR??resolve(root,'data'));
const trace=new Trace(room.directory);room.trace=(type,fields)=>trace.record(type,fields);
if(room.sandboxMigrated)room.trace('terrain.sandbox',{msg:'Filled empty Sandbox cells on saved world'});
process.on('uncaughtExceptionMonitor',error=>trace.fatal('server.exception',{level:'error',msg:error?.message??String(error),stack:error?.stack}));
process.on('unhandledRejection',reason=>{trace.fatal('server.rejection',{level:'error',msg:reason?.message??String(reason),stack:reason?.stack});throw reason;});
room.chat=new WorldChat(room);room.modes=modeMenu();
const companions=Object.fromEntries(Object.entries(PERSONAS).map(([key,persona])=>[key,new Companion(room,root,persona)]));
const pick=agent=>companions[agent]??companions.codex;
const foreman=room.foreman=new Foreman(room,Object.values(companions));
const access=room.access=new Access(room);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 // No MIME sniffing, no referrer (pass links live in the fragment anyway), never framed.
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");
 try{const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,players:room.clients.size,revision:room.world.revision}));return;}
 const path=resolve(root,'dist','.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
 if(!path.startsWith(resolve(root,'dist')+'/')){res.writeHead(403);res.end();return;}
 const body=await readFile(path);res.setHeader('Content-Type',types[extname(path)]??'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
});
const sockets=new WebSocketServer({noServer:true,maxPayload:1_500_000});
server.on('upgrade',(req,socket,head)=>{
 try{if(req.url!=='/world'||new URL(req.headers.origin).host!==req.headers.host)throw Error('Origin');}
 catch{socket.destroy();return;}
 sockets.handleUpgrade(req,socket,head,ws=>sockets.emit('connection',ws));
});
const notice=(socket,text)=>room.notice(socket,text);
// Per-socket limits: a message budget per second (input frames arrive ~20/s), and one
// trace line per repeated error every 5 s so refusals cannot flood the log.
const MAX_SOCKETS=64,MESSAGES_PER_SECOND=80;
const flooding=socket=>{const now=Date.now(),r=socket.rate??={start:now,n:0};if(now-r.start>1000){r.start=now;r.n=0;}return ++r.n>MESSAGES_PER_SECOND;};
const repeated=(socket,text)=>{const now=Date.now(),seen=socket.errors??=new Map();if(now-(seen.get(text)??0)<5000)return true;if(seen.size>32)seen.clear();seen.set(text,now);return false;};
// Members see every guest pass with an on/off switch; resend when a guest comes, goes, or is switched.
const sendGuests=()=>{const raw=JSON.stringify({type:'guests',guests:access.guestList()});for(const [s,c] of room.clients)if(!access.isGuest(c.entity.id)&&s.readyState===1)s.send(raw);};
// One message from a joined browser: companion requests, then everything the room validates.
function handle(socket,m){
 const player=room.clients.get(socket).entity;
 if(m.type==='client-error'){const now=Date.now(),last=socket.lastClientError??0;if(now-last>10000){socket.lastClientError=now;room.trace('client.error',{level:'error',who:player.id,msg:m.message,stack:m.stack});}return;}
 access.check(player.id,m.type);
 if(m.type==='chat-send'){
  const request=validateChat(m);
  if(!access.allowAI(player.id)){room.trace('companion.rejected',{level:'warn',who:player.id,reason:'guest-limit',msg:'Guest companion limit reached'});throw Error(`Guests can ask companions ${GUEST_AI_LIMIT.turns} times every ${GUEST_AI_LIMIT.windowMs/60000} minutes. Try again soon.`);}
  // One message may be for several companions; the player's line is posted once.
  const targets=addressees(request.text,request.agents,Object.fromEntries(Object.entries(companions).map(([k,c])=>[k,c.name])));
  const together=targets.length>1?targets.map(k=>companions[k].name):null;
  room.trace('chat.addressed',{who:player.id,agents:targets,msg:`Message for ${targets.map(k=>companions[k].name).join(' and ')}`});
  targets.forEach((key,i)=>companions[key].run(socket,{...request,agent:key,together,echoed:i>0}).catch(e=>notice(socket,e.message)));
 }else if(m.type==='agent-stop'){for(const agent of m.agent?[pick(m.agent)]:Object.values(companions))agent.stop();}
 else if(m.type==='invite-create'){const invite=access.createInvite(player.id);room.trace('invite.created',{who:player.id,inviteCode:invite.code,maxUses:invite.maxUses,msg:`${player.id.slice(0,8)} created invite`});socket.send(JSON.stringify({type:'invite',code:invite.code,maxUses:invite.maxUses,expires:invite.expires}));}
 else if(m.type==='guest-pass'){access.setPass(player.id,m.id,m.on===true);room.trace('guest.pass',{who:player.id,guest:String(m.id).slice(0,8),on:m.on===true,msg:`${player.id.slice(0,8)} switched guest ${String(m.id).slice(0,8)} ${m.on===true?'on':'off'}`});if(m.on!==true)for(const [s,c] of room.clients)if(c.entity.id===m.id)s.close(4003,PASS_OFF);sendGuests();}
 else if(m.type==='admin-grant'){const g=grant(room,access,player,{targetId:m.targetId,blockId:m.blockId,count:m.count});notice(socket,`Granted ${g.added} ${g.item} to ${g.name}.`);}
 else if(m.type==='creative'){const on=setCreative(room,access,player,m.on);socket.send(JSON.stringify({type:'creative',on}));notice(socket,on?'Creative mode on: blocks break at once and placing keeps your stack.':'Creative mode off.');}
 else if(m.type==='capture')Object.values(companions).some(agent=>agent.screenshot(socket,m));
 else room.receive(socket,m);
 if(m.type!=='input'&&m.type!=='presence'&&m.type!=='client-error')room.touch(socket);
}
sockets.on('connection',socket=>{
 // A cap on open sockets, and before joining exactly one small join frame: anything else
 // closes the socket without a trace line or a reply (unjoined sockets cannot fill the disk).
 if(sockets.clients.size>MAX_SOCKETS){socket.close(1013,'Server busy');return;}
 const timeout=setTimeout(()=>socket.close(1008,'Join required'),5000);
 socket.on('message',(raw,binary)=>{
  if(!room.clients.has(socket)){let join=null;if(!binary&&raw.length<=4096)try{join=JSON.parse(raw);}catch{}if(join?.type!=='join'){socket.close(1008,'Join first');return;}}
  if(room.clients.has(socket)&&flooding(socket)){room.trace('handle.flood',{level:'warn',who:room.clients.get(socket).entity.id,msg:'Too many messages; disconnected'});socket.close(1008,'Too many messages');return;}
  try{
  const m=JSON.parse(raw);
  if(!room.clients.has(socket)){
   if(m?.type!=='join'){socket.close(1008,'Join first');return;}
   const admitted=access.admit(m.token,m.invite);
   if(!admitted.ok){room.trace('join.refused',{level:'warn',reason:admitted.reason,msg:admitted.reason});clearTimeout(timeout);socket.close(4003,admitted.reason.slice(0,120));return;}
   const entity=room.connect(socket,m.token,{compress:m.compress===true});clearTimeout(timeout);
   if(admitted.guest&&!access.isGuest(entity.id))access.markGuest(entity.id,admitted.by,admitted.code);
   room.trace('join.accepted',{who:entity.id,role:access.isGuest(entity.id)?'guest':'member',msg:`${access.isGuest(entity.id)?'Guest':'Member'} ${entity.id.slice(0,8)} joined`});
   socket.send(JSON.stringify({type:'access',role:access.isGuest(entity.id)?'guest':'member',admin:access.isAdmin(entity.id),requireInvite:access.requireInvite}));
   if(access.isGuest(entity.id))sendGuests();else socket.send(JSON.stringify({type:'guests',guests:access.guestList()}));
   return;
  }
  handle(socket,m);
 }catch(error){if(!repeated(socket,error.message))room.trace('handle.error',{level:error instanceof TypeError||error instanceof ReferenceError||error instanceof RangeError?'error':'warn',who:room.clients.get(socket)?.entity.id,msg:error.message,stack:error.stack});notice(socket,error.message);}});
 socket.on('close',()=>{clearTimeout(timeout);const c=room.clients.get(socket);room.disconnect(socket);if(c&&access.isGuest(c.entity.id))sendGuests();});socket.on('error',()=>{});
});
// Fixed 60 Hz steps driven by the real clock: setInterval alone drifts (about 59.6 Hz
// here), which made browsers' 60 Hz input pile up on the server.
let lastStep=performance.now(),owed=0;
const step=()=>{const now=performance.now();owed=Math.min(owed+(now-lastStep)/1000,.25);lastStep=now;while(owed>=1/60){room.searchDeadline=performance.now()+1.5;for(const agent of Object.values(companions))agent.tick();room.searchDeadline=null;foreman.tick(1/60);room.tick(1/60);owed-=1/60;}};
const tick=setInterval(step,1000/120),broadcast=setInterval(()=>room.broadcast(),50);
server.listen(Number(process.env.PORT??5173),process.env.HOST??'127.0.0.1',()=>{console.log(`Sky Block shared server on ${JSON.stringify(server.address())}`);room.trace('server.start',{port:server.address()?.port,msg:'Server started'});});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{room.trace('server.stop',{signal,msg:`Server stopping (${signal})`});for(const agent of Object.values(companions))agent.stop();clearInterval(tick);clearInterval(broadcast);room.save();for(const s of sockets.clients)s.close();server.close(async()=>{await trace.close();process.exit();});});
