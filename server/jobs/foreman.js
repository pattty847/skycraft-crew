import { randomUUID } from 'node:crypto';
import { B, BLOCK_COUNT } from '../../src/blocks.js';
import { JobBoard } from './board.js';
import { planFor } from '../skills/build.js';
import { buildBoard } from '../building/board.js';
import { GatherTask } from '../tasks/gather.js';
import { SurfaceGatherTask } from '../tasks/surface-gather.js';
import { SupplyBuildTask } from './supply-build.js';
const siteOf=job=>job.spec.fixedPlan?.anchor??job.spec.requester?.position??null;
// Deterministic crew foreman: once a second, hand open jobs to free companions.
// No model runs here. SupplyBuildTask obtains materials through actions before building.
export class Foreman {
 constructor(room,companions,{interval=1}={}){
  room.foreman=this;this.room=room;this.companions=companions;this.interval=interval;this.timer=0;
  this.board=room.jobs??=new JobBoard(room);
 }
 tick(dt){
  if((this.timer-=dt)>0)return;this.timer=this.interval;
  for(const job of this.board.jobs.filter(j=>j.status==='open')){
   const free=this.companions.filter(c=>c.available());if(!free.length)return;
   const site=siteOf(job),distance=c=>site?Math.hypot(c.entity().position.x-site.x,c.entity().position.z-site.z):0;
   const preferred=job.prefer&&this.companions.find(c=>c.persona.key===job.prefer);
   // A job waits for its preferred builder while they are busy (wood may be on its way to them).
   if(preferred&&!preferred.available()&&job.waitingFor!==undefined)continue;
   const pick=free.find(c=>c.persona.key===job.prefer)??free.sort((a,b)=>distance(a)-distance(b))[0];
   this.assign(job,pick);
  }
 }
 fail(job,message){this.board.update(job,{status:'failed',result:message});this.room.chat?.add('system','World',`Job “${job.label}” failed: ${message}`);this.resume(job,false);}
 // When a gather job that a build was waiting for ends, the build continues or fails.
 resume(job,ok){
  const parent=job.parent&&this.board.find(job.parent);
  if(parent&&parent.status==='waiting')ok?this.board.update(parent,{status:'open',waitingFor:null}):this.fail(parent,`the wood it needed never arrived (${job.result})`);
 }
 start(job,companion,task,onEnd=()=>{}){
  this.board.update(job,{status:'running',assignee:companion.persona.key});
  this.room.chat?.add('action','World',`${companion.name} took a job: ${job.label}.`);
  companion.startJob(job,task,result=>{
   onEnd();
   if(job.status!=='cancelled')this.board.update(job,{status:result.ok?'done':'failed',result:result.message});
   if(job.status!=='cancelled'){this.room.chat?.add(result.ok?'action':'system','World',`${result.ok?'Job done':'Job failed'} (${companion.name}): ${result.message}`);this.resume(job,result.ok);}this.room.markDirty?.();
  });
 }
 cancel(job){for(const companion of this.companions)if(companion.job?.job===job){companion.job.task.cancel();this.room.simulation.queue=this.room.simulation.queue.filter(a=>a.entityId!==companion.id);}}
 assign(job,companion){
  const room=this.room,e=companion.entity();
  if(job.kind==='gather'){
   if(!job.spec.toStockpile&&!room.simulation.entities.get(job.requesterId)){this.fail(job,'the receiver is gone');return;}
   const options={requesterId:job.requesterId,blockId:job.spec.blockId??B.WOOD,count:job.spec.count,toStockpile:job.spec.toStockpile===true,onProgress:text=>companion.announce(`${companion.name}: ${text}`)};
   this.start(job,companion,options.blockId===B.WOOD?new GatherTask(room,e,options):new SurfaceGatherTask(room,e,options));return;
  }
  let plan;
  try{plan=job.spec.fixedPlan??planFor(room,{...e,inventory:new Uint16Array(BLOCK_COUNT).fill(65535)},job.spec.action,job.spec.requester);}
  catch(error){this.fail(job,error.message);return;}
  const preview=buildBoard(room),id=randomUUID();preview.start(id,e.id,plan);
  this.start(job,companion,new SupplyBuildTask(room,e,plan,{onProgress:text=>companion.announce(`${companion.name}: ${text}`)}),()=>preview.end(id));
 }
}
