// How should the world be shown to a model? Scripted scenes from a copy of a world
// save, questions with known answers, several observation formats, real models.
// Scores accuracy against prompt size, provider-reported tokens and latency.
//   node scripts/perception-bench.mjs [world.json] [--models=haiku,gpt] [--repeat=1]
// Needs COPENET_PATH (or ../CopeNet). Every call is one real model turn.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { observe, forModel, describeScene } from '../server/observation.js';
import { needsFor } from '../server/skills/index.js';
import { Companion } from '../server/companion.js';
import { PERSONAS } from '../server/personas/index.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),option=(name,fallback)=>args.find(a=>a.startsWith(`--${name}=`))?.split('=')[1]??fallback;
const save=JSON.parse(readFileSync(args.find(a=>!a.startsWith('--'))??resolve(root,'data/world.json'),'utf8'));
const MODELS={haiku:{persona:PERSONAS.claude,provider:'claude-cli',model:'claude-haiku-4-5'},sonnet:{persona:PERSONAS.claude,provider:'claude-cli',model:'claude-sonnet-4-6'},gpt:{persona:PERSONAS.codex,provider:'openai-codex',model:'gpt-5.5'}};
const systemPrompt=option('system',null)?'You are a character in a voxel game. Answer only from the observation, as JSON.':undefined;
const models=option('models','haiku,gpt').split(',').map(m=>[m,MODELS[m]]);const repeat=Number(option('repeat',1));
const world=new World(save.seed);world.blocks.set(Buffer.from(save.blocks,'base64'));
const simulation=new Simulation(world),room={world,simulation,phase:.3,claims:{items:save.extensions?.claims??[]},directory:mkdtempSync(join(tmpdir(),'sky-bench-'))};
const names={'claude-companion':'Claude','codex-companion':'Codex'};
// Scenes: where the companion stands and who is talking to it.
const SCENES=[
 {name:'shelter',me:{x:36.5,y:23,z:36.5},player:{x:38.5,y:23,z:36.5}},
 {name:'clover-nook',me:{x:80.5,y:25,z:38.5},player:{x:80.5,y:25,z:40.5}},
];
// Formats under test. `obs` is the full observation the server builds.
const ONLY=option('formats',null)?.split(',');
const FORMATS_ALL={
 full:obs=>JSON.stringify(obs),
 lists:obs=>{const {scene,...rest}=forModel(obs);return JSON.stringify(rest);},
 'scene+needs':obs=>JSON.stringify(forModel(obs,{needs:needsFor('auto')})),
 scene:obs=>JSON.stringify(forModel(obs,{needs:[]})),
};
const FORMATS=Object.fromEntries(Object.entries(FORMATS_ALL).filter(([k])=>!ONLY||ONLY.includes(k)));
const same=(a,b)=>a&&b&&['x','y','z'].every((k,i)=>Number(a[k]??a[i])===b[k]);
function questions(obs){
 const house=obs.structures.find(s=>s.kind==='building'),grass=obs.pointableBlocks.filter(b=>b.name==='Grass');
 const dir=(()=>{const m=describeScene(obs).match(/talking to you\) is \d+ blocks? ([a-z-]+)/);return m?.[1];})();
 const planks=obs.inventory.find(i=>i.name==='Planks')?.count??0;
 return [
  {id:'island',ask:'Which island are you on?',check:a=>String(a).toLowerCase().includes(obs.you.island.toLowerCase())},
  {id:'direction',ask:'In which compass direction (north, south, east, west, north-east, …) is the player talking to you?',check:a=>dir&&String(a).toLowerCase().replace(/\s+/g,'-').includes(dir)},
  {id:'planks',ask:'How many planks do you carry? Answer with a number.',check:a=>Number(a)===planks},
  {id:'house',ask:'Which structure id (like S1) is most likely a house or shelter? Answer null if none.',check:a=>house?String(a).trim()===house.id:a===null||a==='null'},
  {id:'roof',ask:'What is the y coordinate of the top of that house? Answer with a number or null.',check:a=>house?Number(a)===house.roofY:a===null||a==='null'},
  {id:'grass',ask:'Give the [x,y,z] of one grass block you can see, or null if you cannot tell.',check:a=>Array.isArray(a)?grass.some(b=>same(a,b.pos)):false},
 ];
}
const agent=new Companion({...room,clients:new Map(),simulation,chat:null},root,PERSONAS.claude);
async function ask(model,body,qs){
 const prompt=`You are a character in a voxel game. Answer from the observation only. Return ONLY a JSON object {${qs.map(q=>`"${q.id}": …`).join(', ')}}.\n${qs.map(q=>`${q.id}: ${q.ask}`).join('\n')}\nObservation: ${body}`;
 const started=Date.now();agent.lastTurn=null;
 const text=await agent.think({raw:true,prompt,policy:'',message:'',observation:{},history:[],session:`bench-${Date.now()}-${Math.random().toString(36).slice(2)}`,model:model.model,provider:model.provider,persona:{name:model.persona.name,prompt:'',vision:false},systemPrompt});
 const json=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));
 return {json,latencyMs:Date.now()-started,usage:agent.lastTurn?.usage,promptChars:prompt.length};
}
const results=[];
for(const scene of SCENES){
 const me=simulation.spawn(`claude-companion-${scene.name}`),player=simulation.spawn(`player-${scene.name}`);
 me.id='claude-companion';me.position={...scene.me};player.position={...scene.player};me.inventory[9]=24;me.inventory[5]=3;
 const obs=observe(room,me,player,{names});simulation.entities.delete(`claude-companion-${scene.name}`);simulation.entities.delete(`player-${scene.name}`);
 const qs=questions(obs);
 for(const [modelName,model] of models)for(const [format,render] of Object.entries(FORMATS))for(let r=0;r<repeat;r++){
  try{
   const {json,latencyMs,usage,promptChars}=await ask(model,render(obs),qs);
   const scores=Object.fromEntries(qs.map(q=>[q.id,q.check(json[q.id])?1:0]));
   results.push({scene:scene.name,model:modelName,format,promptChars,inputTokens:usage?.inputTokens??null,cachedTokens:usage?.cachedInputTokens??null,latencyMs,...scores,score:Object.values(scores).reduce((a,b)=>a+b,0)});
   console.log(scene.name,modelName,format,`${results.at(-1).score}/${qs.length}`,`${promptChars} chars`,usage?.inputTokens??'?','tokens',`${(latencyMs/1000).toFixed(1)}s`,JSON.stringify(json).slice(0,160));
  }catch(error){console.log(scene.name,modelName,format,'ERROR',error.message);results.push({scene:scene.name,model:modelName,format,error:error.message});}
 }
}
const out=join(room.directory,'perception-bench.json');writeFileSync(out,JSON.stringify(results,null,1));
const table={};for(const r of results.filter(r=>!r.error)){const k=`${r.model} · ${r.format}`;(table[k]??=[]).push(r);}
console.table(Object.fromEntries(Object.entries(table).map(([k,list])=>[k,{runs:list.length,accuracy:`${Math.round(100*list.reduce((a,r)=>a+r.score,0)/(list.length*6))}%`,meanChars:Math.round(list.reduce((a,r)=>a+r.promptChars,0)/list.length),meanInputTokens:Math.round(list.reduce((a,r)=>a+(r.inputTokens??0),0)/list.length)||'?',meanCachedTokens:Math.round(list.reduce((a,r)=>a+(r.cachedTokens??0),0)/list.length)||'?',meanSeconds:(list.reduce((a,r)=>a+r.latencyMs,0)/list.length/1000).toFixed(1)}])));
console.log('raw results:',out);
