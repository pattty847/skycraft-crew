#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export function options(args){
 const opts={since:'15m'};
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(['--follow','--errors','--json','--summary'].includes(arg))opts[arg.slice(2)]=true;
  else if(['--since','--who','--type','--run','--grep'].includes(arg)){if(!args[i+1])throw Error(`Missing value for ${arg}`);opts[arg.slice(2)]=args[++i];}
  else throw Error(`Unknown option ${arg}`);
 }
 if(!/^\d+[mh]$/.test(opts.since))throw Error('--since must be like 10m or 2h');
 return opts;
}
export function cutoff(since,now=Date.now()){const [,n,unit]=since.match(/^(\d+)([mh])$/);return now-Number(n)*(unit==='h'?3600000:60000);}
export function match(row,opts,after){
 if(Date.parse(row.t)<after)return false;
 if(opts.who&&!JSON.stringify(row).toLowerCase().includes(opts.who.toLowerCase()))return false;
 if(opts.type&&!row.type?.startsWith(opts.type))return false;
 if(opts.run&&!String(row.run??'').startsWith(opts.run))return false;
 if(opts.errors&&!['warn','error'].includes(row.level))return false;
 if(opts.grep&&!JSON.stringify(row).toLowerCase().includes(opts.grep.toLowerCase()))return false;
 return true;
}
export async function readRows(directory,after,seen=new Set()){
 const rows=[];let files=[];try{files=(await readdir(directory)).filter(f=>/^\d{4}-\d\d-\d\d\.jsonl$/.test(f)).sort();}catch{return rows;}
 for(const file of files){if(Date.parse(file.slice(0,10)+'T23:59:59Z')<after)continue;
  let body;try{body=await readFile(join(directory,file),'utf8');}catch{continue;}
  const lines=body.split('\n');lines.pop();
  for(let i=0;i<lines.length;i++){const id=file+':'+i;if(seen.has(id))continue;seen.add(id);try{rows.push(JSON.parse(lines[i]));}catch{/* Torn or malformed records do not stop search. */}}
 }return rows;
}
// Files keep UTC; people read local time (sv-SE gives a sortable "YYYY-MM-DD HH:MM:SS").
export function format(row){return `${new Date(row.t).toLocaleString('sv-SE')} ${row.level.toUpperCase().padEnd(5)} ${row.type.padEnd(20)} ${row.who?row.who+' ':''}${row.msg??''}`;}
export function summary(rows){const count=new Map(),warnings=new Map();for(const r of rows){count.set(r.type,(count.get(r.type)??0)+1);if(r.level==='warn'||r.level==='error'){const key=`${r.type}: ${r.msg}`;warnings.set(key,(warnings.get(key)??0)+1);}}return ['Events by type:',...Array.from(count).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`  ${n} ${k}`),'Top warnings:',...Array.from(warnings).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,n])=>`  ${n} ${k}`)].join('\n');}
async function main(){const opts=options(process.argv.slice(2)),directory=join(process.env.SKY_DATA_DIR??resolve('data'),'trace'),after=cutoff(opts.since),seen=new Set();
 const show=async()=>{const rows=(await readRows(directory,after,seen)).filter(r=>match(r,opts,after));if(opts.summary)console.log(summary(rows));else for(const row of rows)console.log(opts.json?JSON.stringify(row):format(row));};
 await show();if(opts.follow){setInterval(show,1000);}
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)main().catch(error=>{console.error(error.message);process.exitCode=1;});
