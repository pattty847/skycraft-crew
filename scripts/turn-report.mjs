// Summarize companion model turns from agent-events.jsonl: size by prompt part,
// provider-reported tokens, latency and outcomes, per companion and mode.
//   node scripts/turn-report.mjs [data-dir] [--since=ISO-date]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const args=process.argv.slice(2),dir=args.find(a=>!a.startsWith('--'))??process.env.SKY_DATA_DIR??'data';
const since=Date.parse(args.find(a=>a.startsWith('--since='))?.slice(8)??0)||0;
const file=join(dir,'agent-events.jsonl');
if(!existsSync(file)){console.log(`No ${file} yet.`);process.exit(0);}
const turns=readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(e=>e?.type==='turn'&&(e.time??0)>=since);
if(!turns.length){console.log('No model turns recorded yet.');process.exit(0);}
const median=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null;};
const mean=values=>{const v=values.filter(Number.isFinite);return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null;};
const groups=new Map();for(const t of turns){const k=`${t.agent} · ${t.mode}`;(groups.get(k)??groups.set(k,[]).get(k)).push(t);}
const rows=[];
for(const [key,list] of groups){
 const outcomes={};for(const t of list)outcomes[t.outcome]=(outcomes[t.outcome]??0)+1;
 rows.push({group:key,turns:list.length,medianSeconds:(median(list.map(t=>t.latencyMs))/1000).toFixed(1),
  meanPromptChars:mean(list.map(t=>t.promptChars??t.chars?.text)),observationChars:mean(list.map(t=>t.chars?.observation)),policyChars:mean(list.map(t=>t.chars?.policy)),historyChars:mean(list.map(t=>t.chars?.history)),
  inputTokens:mean(list.map(t=>t.usage?.inputTokens)),cachedTokens:mean(list.map(t=>t.usage?.cachedInputTokens)),outputTokens:mean(list.map(t=>t.usage?.outputTokens)),
  leakyReplies:`${list.filter(t=>t.leaks?.length).length}/${list.filter(t=>t.leaks).length}`,
  outcomes:Object.entries(outcomes).map(([k,v])=>`${k}:${v}`).join(' ')});
}
console.table(rows);
