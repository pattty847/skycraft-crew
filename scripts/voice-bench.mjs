// Do companions talk like someone in the world, or like someone reading a report?
// Replays casual requests through real models with the current perception and
// voice, and optionally a baseline observation module, scoring replies for leaks
// (coordinates, "observation", screenshots, modes, tool words, receipts).
//   node scripts/voice-bench.mjs [world.json] [--models=haiku,gpt] [--baseline=server/observation-before.js]
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { World } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import * as current from '../server/observation.js';
import { needsFor, policyFor } from '../server/skills/index.js';
import { parseCompanionReply } from '../server/chat.js';
import { Companion } from '../server/companion.js';
import { PERSONAS } from '../server/personas/index.js';
import { MEMORY_POLICY } from '../server/memory.js';
import { VOICE_POLICY, leaks, conversation } from '../server/voice.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),option=(name,fallback)=>args.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')??fallback;
const save=JSON.parse(readFileSync(args.find(a=>!a.startsWith('--'))??resolve(root,'data/world.json'),'utf8'));
const chatLog=(()=>{try{return readFileSync(resolve(root,'data/chat.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l));}catch{return [];}})();
const baselinePath=option('baseline',null),baseline=baselinePath?await import(pathToFileURL(resolve(root,baselinePath))):null;
const MODELS={haiku:{persona:PERSONAS.claude,provider:'claude-cli',model:'claude-haiku-4-5'},gpt:{persona:PERSONAS.codex,provider:'openai-codex',model:'gpt-5.5'}};
const models=option('models','haiku,gpt').split(',').map(k=>[k,MODELS[k]]);
const PROMPTS=['hey! how’s it going?','what do you think of my house?','what’s around here?','where are you right now?','come here!','is there any wood nearby?','where’s the other companion?'];
const world=new World(save.seed);world.blocks.set(Buffer.from(save.blocks,'base64'));
const simulation=new Simulation(world),room={world,simulation,phase:.3,claims:{items:save.extensions?.claims??[]},directory:mkdtempSync(join(tmpdir(),'sky-voice-')),clients:new Map(),chat:null};
const me=simulation.spawn('claude-companion'),player=simulation.spawn('3f77-player'),codex=simulation.spawn('codex-companion');
me.position={x:36.5,y:23,z:36.5};player.position={x:38.5,y:23,z:37.5};codex.position={x:44.5,y:23,z:38.5};me.inventory[9]=24;
const names={'claude-companion':'Claude','codex-companion':'Codex','3f77-player':'Player 3f77'};
const oldHistory=chatLog.filter(e=>['user','assistant','action'].includes(e.kind)).slice(-12).map(({kind,name,text})=>({kind,name,text}));
const VARIANTS={
 ...(baseline?{before:obs=>({observation:baseline.forModel(baseline.observe(room,me,player,{names}),{needs:needsFor('auto')}),history:oldHistory,voice:''})}:{}),
 after:()=>({observation:current.forModel(current.observe(room,me,player,{names}),{needs:needsFor('auto')}),history:conversation(chatLog),voice:VOICE_POLICY}),
};
const agent=new Companion(room,root,PERSONAS.claude),results=[];
for(const [modelName,model] of models)for(const [variant,build] of Object.entries(VARIANTS))for(const message of PROMPTS){
 const {observation,history,voice}=build();agent.lastTurn=null;const started=Date.now();
 try{
  const text=await agent.think({observation,image:null,mode:'auto',policy:policyFor('auto')+MEMORY_POLICY+'\n'+voice,message,history,session:`voice-${Date.now()}-${Math.random().toString(36).slice(2)}`,model:model.model,provider:model.provider,persona:{name:model.persona.name,prompt:model.persona.prompt,vision:false}});
  let reply;try{reply=parseCompanionReply(text,'auto',current.observe(room,me,player,{names}));}catch{reply={message:text,action:{type:'invalid'}}}
  const found=leaks(reply.message);results.push({model:modelName,variant,message,leaks:found,action:reply.action?.type??null,seconds:(Date.now()-started)/1000});
  console.log(`${modelName} ${variant.padEnd(6)} ${found.length?'LEAK '+found.join(','):'clean'.padEnd(10)} ${(reply.action?.type??'-').padEnd(8)} “${message}” → ${reply.message.slice(0,130)}`);
 }catch(error){console.log(modelName,variant,message,'ERROR',error.message.slice(0,100));}
}
const table={};for(const r of results){const k=`${r.model} · ${r.variant}`;const row=table[k]??={replies:0,leaky:0,approachOnComeHere:'-'};row.replies++;if(r.leaks.length)row.leaky++;if(/come here/.test(r.message))row.approachOnComeHere=r.action==='approach'?'yes':r.action;}
for(const row of Object.values(table))row.leakRate=`${Math.round(100*row.leaky/row.replies)}%`;
console.table(table);
