// How often do companion replies in a chat log leak the machinery (coordinates,
// "observation", screenshots, modes, tool words, receipts)?
//   node scripts/voice-report.mjs [data-dir]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leaks, LEAKS } from '../server/voice.js';
const dir=process.argv[2]??process.env.SKY_DATA_DIR??'data';
const entries=readFileSync(join(dir,'chat.jsonl'),'utf8').trim().split('\n').map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(e=>e?.kind==='assistant');
const by={};
for(const e of entries){const row=by[e.name]??={replies:0,leaky:0,...Object.fromEntries(LEAKS.map(([n])=>[n,0]))};row.replies++;const found=leaks(e.text);if(found.length)row.leaky++;for(const n of found)row[n]++;}
for(const row of Object.values(by))row.leakRate=`${Math.round(100*row.leaky/row.replies)}%`;
console.table(by);
const examples=entries.filter(e=>leaks(e.text).length).slice(-5);
for(const e of examples)console.log(`${e.name}: ${e.text.slice(0,180)}\n   → ${leaks(e.text).join(', ')}`);
