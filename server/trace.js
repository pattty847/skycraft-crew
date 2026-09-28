import { mkdir, appendFile, readdir, unlink } from 'node:fs/promises';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT=512, RETAIN=14;
const short=value=>typeof value==='string'?value.slice(0,LIMIT):value;
function clean(value,key='',depth=0){
 if(/token|credential|secret|password/i.test(key))return undefined;
 if(/invite|code/i.test(key))return typeof value==='string'?value.slice(0,4):undefined;
 if(typeof value==='string')return short(value);
 if(value===null||typeof value==='number'||typeof value==='boolean')return value;
 if(depth>=3)return '[nested]';
 if(Array.isArray(value))return value.slice(0,20).map(v=>clean(v,'',depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,30).map(([k,v])=>[k,clean(v,k,depth+1)]).filter(([,v])=>v!==undefined));
 return undefined;
}
export class Trace {
 constructor(directory,{interval=1000,now=()=>new Date()}={}){
  this.directory=join(directory,'trace');this.now=now;this.pending=[];this.writing=Promise.resolve();this.closed=false;
  this.timer=setInterval(()=>this.flush(),interval);this.timer.unref?.();
 }
 record(type,fields={}){
  try{
   if(this.closed)return;
   const t=this.now().toISOString(),safe=clean(fields);
   const row={t,type:short(type),level:safe.level??'info',...safe,msg:short(safe.msg??type)};
   if(typeof row.who==='string')row.who=row.who.slice(0,8);
   this.pending.push(JSON.stringify(row)+'\n');
  }catch{/* Diagnostics must never affect play. */}
 }
 flush(){
  if(!this.pending.length)return this.writing;
  const batch=this.pending.splice(0);
  this.writing=this.writing.catch(()=>{}).then(async()=>{
   try{
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const byDay=new Map();for(const line of batch){const day=line.slice(6,16);byDay.set(day,(byDay.get(day)??'')+line);}
    for(const [day,lines] of byDay)await appendFile(join(this.directory,day+'.jsonl'),lines,{mode:0o600});
    const cutoff=this.now().getTime()-RETAIN*864e5;
    for(const file of await readdir(this.directory))if(/^\d{4}-\d\d-\d\d\.jsonl$/.test(file)&&Date.parse(file.slice(0,10)+'T00:00:00Z')<cutoff)await unlink(join(this.directory,file));
   }catch{/* Trace IO is best effort. */}
  });return this.writing;
 }
 fatal(type,fields){
  this.record(type,fields);const line=this.pending.pop();if(!line)return;
  try{mkdirSync(this.directory,{recursive:true,mode:0o700});appendFileSync(join(this.directory,line.slice(6,16)+'.jsonl'),line,{mode:0o600});}catch{/* The process keeps its normal crash behavior. */}
 }
 async close(){this.closed=true;clearInterval(this.timer);await this.flush();}
}
