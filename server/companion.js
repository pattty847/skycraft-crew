import { standable } from './navigation/pathfinder.js';
import { IdleBehavior } from './tasks/idle.js';
import { observe, forModel } from './observation.js';
import { memoryFor, MEMORY_POLICY } from './memory.js';
import { goalsFor, parseReflection, REFLECT_POLICY, REFLECT_EVERY, REFLECT_MIN_GAP } from './goals.js';
import { VOICE_POLICY, leaks, conversation } from './voice.js';
import { parseCompanionReply, parseMessageOnly } from './chat.js';
import { SKILLS, modeInfo, needsFor, policyFor, skillFor } from './skills/index.js';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { appendFileSync, existsSync } from 'node:fs';
import { collides } from '../src/physics.js';
import { B, isPlant } from '../src/blocks.js';
import { SIZE } from '../src/world.js';

export { PERSONAS } from './personas/index.js';
// Without a model bridge (CopeNet and uv) the world still runs; companions just cannot answer.
export const OFFLINE='Companions are offline: no model bridge is set up on this server. See "Companions" in the README.';
import { PERSONAS } from './personas/index.js';
const EVENTS='agent-events.jsonl';
// Something new near home (a build going up, a wall coming down) earns a look: Codex gets a
// screenshot, Claude the text scene. Leaves, plants and saplings do not count, since trees come and go.
export const HOME_RADIUS=10,HOME_CHANGE=8,HOME_LOOK_GAP=30*60*1000;
export function homeCounts(world,home){
 const counts=new Map(),cx=Math.floor(home.x),cz=Math.floor(home.z);
 for(let x=cx-HOME_RADIUS;x<=cx+HOME_RADIUS;x++)for(let z=cz-HOME_RADIUS;z<=cz+HOME_RADIUS;z++)for(let y=0;y<SIZE.y;y++){
  const id=world.get(x,y,z);if(!id||id===B.LEAVES||id===B.SAPLING||isPlant(id))continue;counts.set(id,(counts.get(id)??0)+1);
 }
 return counts;
}
export const homeDifference=(a,b)=>{let d=0;for(const id of new Set([...a.keys(),...b.keys()]))d+=Math.abs((a.get(id)??0)-(b.get(id)??0));return d;};
const LOOK='something changed near your home';
// Size of each part of a model turn, in characters (about four per token).
export function turnChars(payload){
 const size=value=>value===undefined||value===null?0:typeof value==='string'?value.length:JSON.stringify(value).length;
 const parts={persona:size(payload.persona?.prompt),policy:size(payload.policy),observation:size(payload.observation),history:size(payload.history),message:size(payload.message),imageBytes:payload.image?Math.round(payload.image.length*.75):0};
 return {...parts,text:parts.persona+parts.policy+parts.observation+parts.history+parts.message};
}
function groundAt(world,x,z){for(let y=1;y<46;y++){const p={x,y,z};if(standable(world,p))return p;}return null;}

// The model proposes one action; this controller limits its duration and Simulation validates it.
// When one message is for several companions, each answers for itself and knows the others will too.
const together=(name,names)=>names?.length>1?`\nThis message was addressed to ${names.join(' and ')} together; ${names.filter(n=>n!==name).join(' and ')} will answer separately. Answer only for yourself, keep it short, do not speak for the others, and leave a task to whoever the player named for it.`:'';
export class Companion {
 constructor(room,root,persona=PERSONAS.codex){
  this.room=room;this.root=root;this.persona=persona;this.id=persona.id;this.name=persona.name;
  memoryFor(room);goalsFor(room);
  // Reflection clock: the first pass waits a little (Codex a little longer, so they don't think in unison).
  this.lastReflect=Date.now()-REFLECT_EVERY+(persona.key==='codex'?7:3)*60*1000;this.reflectCheck=0;this.wasNight=null;this.hadHumans=false;this.lastDawn=0;this.lastGm=0;this.homeSeen=null;this.homeCheck=0;this.lastHomeLook=0;this.thinking=false;this.thinkingWhy=null;
  room.extend?.(`dawn-${persona.key}`,{save:()=>({lastDawn:this.lastDawn,lastGm:this.lastGm}),load:data=>{this.lastDawn=Number.isFinite(data?.lastDawn)?data.lastDawn:0;this.lastGm=Number.isFinite(data?.lastGm)?data.lastGm:0;}});
  this.active=null;this.job=null;this.pending=null;this.capture=null;this.child=null;this.status=`${persona.name} idle`;this.task=null;this.idle=null;
  if(persona.resident)this.idle=new IdleBehavior(room,this.entity(),{home:this.home(),night:persona.night??(persona.sleepAtNight?'sleep':null),lines:persona.lines,nightLines:persona.nightLines,homeLine:persona.homeLine,nightLine:persona.nightLine,lookOut:persona.lookOut});
 }
 get approach(){return this.task;}
 home(){const h=this.persona.home;return h?groundAt(this.room.world,h.x,h.z)??{...h,y:24}:null;}
 entity(){
  let e=this.room.simulation.entities.get(this.id);if(e)return e;
  e=this.room.simulation.spawn(this.id);
  const home=this.home();
  if(home&&!collides(this.room.world,home)){e.position={...home};e.speech='';e.speechUntil=0;return e;}
  for(const dx of [2,-2,3,-3]){const x=Math.floor(e.position.x)+dx,z=Math.floor(e.position.z),p={x:x+.5,y:this.room.world.top(x,z)+1,z:z+.5};if(p.y>0&&!collides(this.room.world,p)){e.position=p;break;}}
  return e;
 }
 announce(text){
  this.status=text;const status={agent:this.persona.key,name:this.name,text,busy:!!this.active,thinking:this.thinking,why:this.thinkingWhy};
  this.room.agents={...this.room.agents,[this.persona.key]:status};
  for(const s of this.room.clients.keys())if(s.readyState===1)s.send(JSON.stringify({type:'agent-status',...status}));
 }
 log(record){appendFileSync(resolve(this.room.directory,EVENTS),JSON.stringify({agent:this.persona.key,time:Date.now(),...record})+'\n');}
 stop(){
  if(this.pending){this.room.trace?.('companion.dropped',{who:this.pending.playerId,agent:this.persona.key,run:this.pending.run,reason:'stopped',msg:`${this.name} pending message stopped`});this.room.chat?.add('system','World',`${this.name}'s queued message was cancelled.`);this.pending=null;}
  if(this.job)this.job.task.cancel();if(!this.active)return;this.room.trace?.('companion.end',{who:this.id,run:this.active,agent:this.persona.key,result:'stopped',msg:`${this.name} stopped`});this.active=null;this.task?.cancel();this.task=null;this.child?.kill('SIGTERM');this.capture?.reject(Error('Stopped'));this.capture=null;this.announce(`${this.name} stopped`);this.room.chat?.add('system','World',`${this.name} stopped.`);}
 tick(){
  this.task?.tick(1/60);
  if(++this.reflectCheck>=60){this.reflectCheck=0;this.considerReflecting();}
  if(this.job){const {task,onDone,job}=this.job;task.tick(1/60);if(task.result){this.room.trace?.('skill.end',{who:this.id,job:job.id,skill:job.kind,result:task.result.ok?'ok':'failed',msg:task.result.message});this.job=null;onDone(task.result);this.dequeue();}}
  if(this.available()&&this.idle&&this.room.simulation.entities.get(this.id)===this.idle.entity)this.idle.tick(1/60);
 }
 // Free for a job: no model request, no task and no job in progress.
 available(){return !this.active&&!this.task&&!this.job;}
 // Run a board job's task (no model call); onDone receives the verified result.
 startJob(job,task,onDone){this.idle?.cancel();this.job={job,task,onDone};this.room.trace?.('skill.start',{who:this.id,job:job.id,skill:job.kind,msg:`${this.name} started ${job.label}`});this.announce(`${this.name} is working on: ${job.label}`);}
 dequeue(){
  if(!this.pending||this.active||this.job||this.task)return;
  const next=this.pending;this.pending=null;
  this.room.trace?.('companion.dequeued',{who:next.playerId,agent:this.persona.key,run:next.run,msg:`${this.name} started queued message`});
  this.execute(next.socket,next.request,next.run).catch(error=>this.room.notice?.(next.socket,error.message));
 }
 screenshot(socket,m){const c=this.capture;if(!c||socket!==c.socket||m.request!==c.request)return false;
  if(m.revision!==c.revision||typeof m.image!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(m.image)||m.image.length>1e6){c.reject(Error('Screenshot was stale or invalid; retry the mission.'));this.capture=null;return true;}
  c.resolve(m.image);this.capture=null;return true;
 }
 names(){return Object.fromEntries(Object.values(PERSONAS).map(p=>[p.id,p.name]));}
 async observe(socket,e){
  const requester=this.room.clients.get(socket)?.entity;
  const observation=observe(this.room,e,requester,{names:this.names()});
  if(!this.persona.vision)return {observation,image:null};
  // Flush block deltas before the capture request; WebSocket ordering preserves the snapshot.
  this.room.broadcast();
  const image=await new Promise((resolve,reject)=>{const request=randomUUID(),timer=setTimeout(()=>{this.capture=null;reject(Error('No screenshot received. Keep the world tab open and try again.'));},8000);
   this.capture={socket,request,revision:observation.revision,resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};
   socket.send(JSON.stringify({type:'capture',request,agent:this.persona.key,entityId:e.id,revision:observation.revision,position:e.position,direction:e.direction}));
  });
  return {observation,image};
 }
 // Run a walking/gathering skill to completion (or until stopped) and report the verified result.
 // quiet: a companion's own errand (a reflection) is traced but kept out of the chat.
 async runTask(run,task,{turn,action,targetId,model,quiet=false}){
  this.idle?.cancel();this.task=task;
  this.room.trace?.('skill.start',{who:this.id,run,skill:action.type,turn,msg:`${this.name} started ${action.type}`});
  while(!task.result&&this.active===run)await new Promise(resolve=>setTimeout(resolve,50));
  if(this.active!==run)return null;
  this.task=null;this.announce(task.result.message);
  this.room.trace?.('skill.end',{who:this.id,run,skill:action.type,turn,result:task.result.ok?'ok':'failed',msg:task.result.message});
  if(!quiet)this.room.chat?.add(task.result.ok?'action':'system','World',(task.result.ok?'Confirmed: ':'')+task.result.message);
  const e=this.room.simulation.entities.get(this.id);
  this.log({run,turn,model,action,result:task.result,position:e?.position,targetId,revision:this.room.world.revision});
  this.room.markDirty?.();return task.result;
 }
 async run(socket,request){
  const player=this.room.clients.get(socket)?.entity;
  const run=randomUUID();
  if(!request.echoed)this.room.chat?.add('user',player?`Player ${player.id.slice(0,4)}`:'Player',request.text,player?.id);
  if(this.active||this.job){
   if(this.pending){this.room.trace?.('companion.dropped',{who:this.pending.playerId,agent:this.persona.key,run:this.pending.run,replacedBy:run,reason:'replaced',msg:`${this.name} replaced pending message`});this.room.chat?.add('system','World',`${this.name}'s earlier queued message was replaced by the latest one.`);}
   this.pending={socket,request,run,playerId:player?.id};
   const work=this.job?this.job.job.label:this.task?'walking':this.status.replace(/^.*? is /,'');
   this.room.trace?.('companion.queued',{who:player?.id,agent:this.persona.key,run,after:this.active??this.job?.job.id,msg:`${this.name} queued message`});
   this.room.chat?.add('system','World',`${this.name} will answer after ${work}.`);
   return;
  }
  return this.execute(socket,request,run);
 }
 async execute(socket,request,run){
  const player=this.room.clients.get(socket)?.entity;
  this.active=run;
  this.room.trace?.('companion.start',{who:player?.id,agent:this.persona.key,run,mode:request.mode,msg:`${this.name} started ${request.mode}`});let outcome='ok';
  const e=this.entity();this.idle?.cancel();
  const model=this.persona.model();
  this.announce(`${this.name} is looking around · ${model}`);
  let feedback='';
  try{for(let turn=0;turn<3&&this.active===run;turn++){
   const view=await this.observe(socket,e);if(this.active!==run)return;
   this.announce(turn?`${this.name} thinking · turn ${turn+1}/3`:`${this.name} is thinking…`);
   const payload={...view,observation:{...forModel(view.observation,{needs:needsFor(request.mode)}),memory:memoryFor(this.room).notes(this.id),goals:goalsFor(this.room).list(this.id)},mode:request.mode,policy:policyFor(request.mode)+MEMORY_POLICY+'\n'+VOICE_POLICY+together(this.name,request.together),message:request.text+(feedback?`\n[Game: your previous action was refused: ${feedback} Choose differently or reply with action null.]`:''),history:conversation(this.room.chat?.entries??[]),session:`sky-${this.persona.key}-${run}`,model,provider:this.persona.provider,persona:{name:this.name,prompt:this.persona.prompt,vision:this.persona.vision}};
   const started=Date.now();this.lastTurn=null;
   const answer=await this.think(payload);if(this.active!==run)return;
   const turnRecord={run,turn,mode:request.mode,model,latencyMs:Date.now()-started,chars:turnChars(payload),...(this.lastTurn??{})};
   let reply;try{reply=parseCompanionReply(answer,request.mode,view.observation);}catch(error){
    // A refused proposal is feedback, not a crash: the model gets another turn to choose again or just talk.
    this.log({type:"turn",...turnRecord,outcome:"rejected",detail:error.message});this.room.trace?.('companion.refused',{level:'warn',who:this.id,run,turn,msg:error.message});
    if(turn<2){feedback=error.message;continue;}throw error;}
   this.log({type:"turn",...turnRecord,outcome:reply.action?.type??"talk",leaks:leaks(reply.message),...(reply.remember?{remembered:reply.remember}:{})});
   if(reply.remember)memoryFor(this.room).remember(this.id,reply.remember);
   this.room.chat?.add('assistant',this.name,reply.message,e.id);e.actions.say(reply.message);
   const action=reply.action;
   if(!action){this.announce(`${this.name} replied · no action`);this.room.markDirty?.();return;}
   const skill=skillFor(action.type);
   if(skill.requester&&(!player||this.room.simulation.entities.get(player.id)!==player))throw Error('The requesting player disconnected.');
   const context={room:this.room,entity:e,player,action,name:this.name,who:player?`Player ${player.id.slice(0,4)}`:'the player',progress:text=>this.announce(`${this.name}: ${text}`),receipt:text=>this.room.chat?.add('action','World',text)};
   const {status,receipt}=skill.announce?.(context)??{};
   if(status)this.announce(status);if(receipt)this.room.chat?.add('action','World',receipt);
   const result=await this.runTask(run,skill.start(context),{turn,model,action,targetId:player?.id});
   if(result?.ok&&skill.followUp&&this.active===run&&process.env.SKY_FOLLOW_UPS!=='0')await this.followUp(run,socket,e,request,result,model);
   if(!result?.retry)return;feedback=result.message;
  }this.announce(`${this.name} stopped after three attempts; nothing verified.`);this.room.chat?.add('system','World',`${this.name} couldn't find a way to do that after three tries.`);
  }catch(error){outcome='error';if(this.active===run){this.announce(`${this.name}: ${error.message}`);this.room.chat?.add('system','World',error.message);this.room.trace?.('companion.error',{level:'error',who:this.id,run,msg:error.message});}}finally{if(this.active===run){this.room.trace?.('companion.end',{who:this.id,run,agent:this.persona.key,result:outcome,msg:`${this.name} run ended: ${outcome}`});this.active=null;this.task?.cancel();this.task=null;this.announce(this.status);this.dequeue();}}
 }
 // After finishing something, one more look and a sentence about it: the companion
 // reacts to where it now is (a fresh screenshot for vision personas). Talk only:
 // any action in the reply is ignored, and there is never more than one per request.
 // Once a second: reflect when it has been a while, when night falls, or when someone
 // arrives after a quiet spell — only while a person is on the island and nothing else runs.
 considerReflecting(){
  if(process.env.SKY_REFLECT==='0')return;
  const here=this.room.present?.()??[...this.room.clients.values()],humans=here.length>0,night=Math.sin((this.room.phase??.24)*Math.PI*2)<-.2,now=Date.now(),since=now-this.lastReflect;
  const memberOnline=here.some(c=>c.entity&&!this.room.access?.isGuest(c.entity.id));
  const dawn=memberOnline&&this.wasNight===true&&!night&&now-this.lastDawn>=2*60*60*1000;
  // The home check scans about 20k cells, so it runs every tenth consideration (about 30 s).
  let home=null;
  if(this.persona.home&&++this.homeCheck%10===0){const now=homeCounts(this.room.world,this.persona.home);if(!this.homeSeen)this.homeSeen=now;else if(memberOnline&&Date.now()-this.lastHomeLook>=HOME_LOOK_GAP&&homeDifference(now,this.homeSeen)>=HOME_CHANGE)home=now;}
  const reason=dawn?'dawn':home?LOOK:!humans?null:since>=REFLECT_EVERY?'a quiet moment':this.wasNight===false&&night&&since>=REFLECT_MIN_GAP?'night has fallen':!this.hadHumans&&since>=REFLECT_MIN_GAP*2?'someone just arrived':null;
  this.wasNight=night;this.hadHumans=humans;
  if(reason&&this.available()&&!this.pending){if(reason==='dawn'){this.lastDawn=now;this.room.markDirty?.();}if(reason===LOOK){this.homeSeen=home;this.lastHomeLook=now;}this.reflect(reason).catch(()=>{});}
 }
 // A reflection speaks at most every 30 minutes, and only if a person is within 20 blocks.
 mayMuse(e){if(Date.now()-(this.lastMuse??0)<30*60*1000)return false;for(const c of this.room.present?.()??this.room.clients.values()){const p=c.entity.position;if(Math.hypot(p.x-e.position.x,p.z-e.position.z)<20)return true;}return false;}
 async reflect(reason){
  const run=randomUUID();this.active=run;this.lastReflect=Date.now();
  const e=this.entity(),model=this.persona.model(),goals=goalsFor(this.room);
  this.room.trace?.('companion.reflect',{who:this.id,run,reason,msg:`${this.name} reflects: ${reason}`});
  try{
   const looking=reason==='dawn'||reason===LOOK;
   const socket=looking?[...this.room.clients].find(([s,c])=>s.readyState===1&&!this.room.access?.isGuest(c.entity?.id))?.[0]:null;
   const view=looking&&this.persona.vision&&socket?await this.observe(socket,e):{observation:observe(this.room,e,null,{names:this.names()}),image:null};
   const observation=view.observation;
   const dawnPolicy='Mode: DAWN. You may say one short good-morning line to people here, or stay silent. Return ONLY JSON: {"goals":[],"message":"","action":null}. Keep existing goals. No travel or gesture.';
   const lookPolicy='Mode: LOOK. Something was built or changed near your home. Look at the scene'+(view.image?' and the screenshot':'')+'. If you notice something real (a new house, a missing wall), you may say one short line about it, or stay silent. You may add a goal about it. Return ONLY JSON: {"goals":[...],"message":"","action":null}. No travel or gesture.';
   const payload={observation:{...forModel(observation,{needs:[]}),memory:memoryFor(this.room).notes(this.id),goals:goals.list(this.id)},image:view.image,mode:'reflect',why:reason==='dawn'?'dawn':reason===LOOK?'look':'reflect',policy:(reason==='dawn'?dawnPolicy:reason===LOOK?lookPolicy:REFLECT_POLICY)+'\n'+VOICE_POLICY,message:`[Game: ${reason}.]`,history:conversation(this.room.chat?.entries??[]),session:`sky-${this.persona.key}-${run}-reflect`,model,provider:this.persona.provider,persona:{name:this.name,prompt:this.persona.prompt,vision:reason==='dawn'&&!!view.image}};
   const started=Date.now();this.lastTurn=null;
   const text=await this.think(payload);if(this.active!==run)return;
   const reply=parseReflection(text);
   this.log({type:'turn',run,turn:'reflect',mode:'reflect',model,latencyMs:Date.now()-started,chars:turnChars(payload),...(this.lastTurn??{}),outcome:reply.action?.type??'reflect'});
   const changed=reason==='dawn'?false:goals.set(this.id,reply.goals);
   this.room.trace?.('companion.goals',{who:this.id,run,goals:reply.goals.length,changed,msg:`${this.name} goals: ${reply.goals.join(' | ')||'none'}`});
   if(reply.message&&(reason==='dawn'?Date.now()-this.lastGm>=2*60*60*1000:reason===LOOK||this.mayMuse(e))){if(reason==='dawn'){this.lastGm=Date.now();this.room.markDirty?.();this.room.trace?.('companion.gm',{who:this.id,run,msg:`${this.name} greeted the crew at dawn`});}else this.lastMuse=Date.now();this.room.chat?.add('assistant',this.name,reply.message,e.id);e.actions.say(reply.message);}
   else if(reason==='dawn')this.room.trace?.('companion.gm',{who:this.id,run,silent:true,msg:`${this.name} stayed quiet at dawn`});
   if(reason===LOOK)this.room.trace?.('companion.look',{who:this.id,run,spoke:!!reply.message,msg:`${this.name} looked at a change near home`});
   if(reason==='dawn'||reason===LOOK)return;
   if(reply.action?.type==='emote')e.actions.emote(reply.action.name);
   if(reply.action?.type==='goto'){
    const skill=skillFor('goto');let action;
    try{action=skill.validate(reply.action,observation);}catch(error){this.room.trace?.('companion.refused',{level:'warn',who:this.id,run,msg:error.message});return;}
    // Going home is the nightly routine's job, not a reflection's.
    if(/home|nook|dock/i.test(action.place)&&action.place.startsWith(this.name)){this.room.trace?.('companion.refused',{level:'info',who:this.id,run,msg:`${this.name} reflection skipped going home`});return;}
    this.idle?.cancel();
    await this.runTask(run,skill.start({room:this.room,entity:e,player:null,action,name:this.name,who:'the crew',progress:text=>this.announce(`${this.name}: ${text}`),receipt:()=>{}}),{turn:'reflect',model,action,observation,quiet:true});
   }
  }catch(error){this.room.trace?.('companion.refused',{level:'warn',who:this.id,run,msg:`Reflection: ${error.message}`});}
  finally{if(this.active===run){this.active=null;this.task?.cancel();this.task=null;this.announce(this.status);this.dequeue();}}
 }
 async followUp(run,socket,e,request,result,model){
  try{
   this.announce(`${this.name} is looking around…`);
   const view=await this.observe(socket,e);if(this.active!==run)return;
   const payload={...view,observation:{...forModel(view.observation,{needs:[]}),memory:memoryFor(this.room).notes(this.id),goals:goalsFor(this.room).list(this.id)},mode:'talk',why:'follow-up',message:request.text,history:[],session:`sky-${this.persona.key}-${run}-after`,model,provider:this.persona.provider,persona:{name:this.name,prompt:this.persona.prompt,vision:this.persona.vision},
    policy:`Mode: FOLLOW-UP. The player asked: "${request.text.slice(0,300)}". The game showed the player this confirmation: "${result.message}" (in it, "you" means the player; you are ${this.name}, and it describes what you just did). Look at where you are now and react in one or two sentences, the way a friend who just arrived would: notice something real from the scene or screenshot, or offer a natural next step. action must be null.\n`+VOICE_POLICY};
   const started=Date.now();this.lastTurn=null;
   const text=await this.think(payload);if(this.active!==run)return;
   const reply=parseMessageOnly(text);if(reply.remember)memoryFor(this.room).remember(this.id,reply.remember);
   this.log({type:'turn',run,turn:'follow-up',mode:'follow-up',model,latencyMs:Date.now()-started,chars:turnChars(payload),...(this.lastTurn??{}),outcome:'follow-up'});
   this.room.chat?.add('assistant',this.name,reply.message,e.id);e.actions.say(reply.message);
  }catch{/* A missed reaction is fine; the task's receipt already stands. */}
  if(this.active===run)this.announce(result.message);
 }
 // One line telling everyone what this request may do, built from the skills allowed in that mode.
 intro(mode){
  const verbs=SKILLS.filter(s=>s.modes.includes(mode)&&s.verb).map(s=>s.verb);
  if(mode==='auto')return `${this.name} · can talk, ${verbs.join(', ')}; every action is checked by the server.`;
  if(mode!=='talk')return modeInfo(mode).intro(this.name);
  return `Chat with ${this.name} · can talk${verbs.length?`, ${verbs.join(', ')}`:''}; no block edits.`;
 }
 trackThinking(why,work){const prior=this.status;this.thinking=true;this.thinkingWhy=why;this.announce(`${this.name} is thinking…`);this.room.trace?.('companion.thinking',{who:this.id,why,msg:`${this.name} model call started`});return Promise.resolve().then(work).finally(()=>{this.thinking=false;this.announce(prior);this.room.trace?.('companion.thought',{who:this.id,why,msg:`${this.name} model call ended`});this.thinkingWhy=null;});}
 think(payload){return this.trackThinking(payload.why??'reply',()=>new Promise((resolveResult,reject)=>{
  const project=process.env.COPENET_PATH??resolve(this.root,'../CopeNet');
  if(!existsSync(project)){reject(Error(OFFLINE));return;}
  // One CopeNet session folder per companion: two companions answering at once ("hey both")
  // must never write the same session index, which corrupted it and stopped every turn.
  const child=spawn('uv',['run','--project',project,'python',resolve(this.root,'scripts/companion.py')],{cwd:project,env:{...process.env,...this.persona.env,SKY_SESSION_DIR:resolve(this.room.directory,'sessions',this.persona.key),COPNET_WORKDIR:this.root},stdio:['pipe','pipe','pipe']});this.child=child;
  let output='',error='';const timeout=setTimeout(()=>{child.kill('SIGTERM');reject(Error('CopeNet response timed out after 90 seconds'));},90000);
  child.stdout.on('data',b=>{output+=b;if(output.length>1e6)child.kill();});child.stderr.on('data',b=>{error=(error+b).slice(-2000);});
  child.on('error',e=>{clearTimeout(timeout);reject(e?.code==='ENOENT'?Error(OFFLINE):e);});child.on('close',code=>{clearTimeout(timeout);if(this.child===child)this.child=null;if(code!==0){reject(Error('CopeNet could not complete the turn. Check data/companion-error.log.'));appendFileSync(resolve(this.room.directory,'companion-error.log'),`[${this.persona.key}] `+error+'\n');}else{try{const result=JSON.parse(output.trim().split('\n').at(-1));if(result.error)reject(Error(result.error));else {this.lastTurn={usage:result.usage??null,resolvedModel:result.model??null,promptChars:result.promptChars??null};resolveResult(result.text);}}catch{reject(Error('Invalid CopeNet bridge response'));}}});
  child.stdin.end(JSON.stringify(payload));
 }));}
}
