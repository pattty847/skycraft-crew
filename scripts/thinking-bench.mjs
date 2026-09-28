// Does the Claude CLI's hidden thinking cost us latency on game turns? Runs the
// real Auto-mode turn (policy, compact observation, a request) several times with
// the default thinking budget and with MAX_THINKING_TOKENS=0, then compares
// output tokens, latency and whether the chosen action still parses.
//   node scripts/thinking-bench.mjs [world.json] [--runs=3] [--message="…"]
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { observe, forModel } from '../server/observation.js';
import { needsFor, policyFor } from '../server/skills/index.js';
import { parseCompanionReply } from '../server/chat.js';
import { Companion } from '../server/companion.js';
import { PERSONAS } from '../server/personas/index.js';
import { MEMORY_POLICY } from '../server/memory.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),option=(name,fallback)=>args.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')??fallback;
const save=JSON.parse(readFileSync(args.find(a=>!a.startsWith('--'))??resolve(root,'data/world.json'),'utf8'));
const world=new World(save.seed);world.blocks.set(Buffer.from(save.blocks,'base64'));
const simulation=new Simulation(world),room={world,simulation,phase:.3,claims:{items:save.extensions?.claims??[]},directory:mkdtempSync(join(tmpdir(),'sky-think-')),clients:new Map(),chat:null};
const me=simulation.spawn('claude-companion'),player=simulation.spawn('player-bench');me.position={x:37.5,y:23,z:38.5};player.position={x:39.5,y:23,z:38.5};me.inventory[9]=24;
const observation=observe(room,me,player,{names:{'claude-companion':'Claude'}});
const agent=new Companion(room,root,PERSONAS.claude),runs=Number(option('runs',3)),message=option('message','can you build a bench and an arch near me?');
const payload=()=>({observation:forModel(observation,{needs:needsFor('auto')}),image:null,mode:'auto',policy:policyFor('auto')+MEMORY_POLICY+'\n',message,history:[],session:`think-${Date.now()}-${Math.random().toString(36).slice(2)}`,model:'claude-haiku-4-5',provider:'claude-cli',persona:{name:'Claude',prompt:PERSONAS.claude.prompt,vision:false}});
for(const budget of [undefined,'0']){
 if(budget===undefined)delete process.env.MAX_THINKING_TOKENS;else process.env.MAX_THINKING_TOKENS=budget;
 for(let i=0;i<runs;i++){
  const started=Date.now();agent.lastTurn=null;let action='?';
  try{const text=await agent.think(payload());action=parseCompanionReply(text,'auto',observation).action?.type??'null';}catch(error){action=`error: ${error.message.slice(0,80)}`;}
  console.log(`thinking=${budget??'default'}`,`${((Date.now()-started)/1000).toFixed(1)}s`,'output',agent.lastTurn?.usage?.outputTokens??'?','action',action);
 }
}
