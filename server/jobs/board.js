import { randomUUID } from 'node:crypto';
// Shared work any companion can take: posted jobs with a status, an assignee and
// a verified result. Persisted and replicated through room.extend('jobs').
// Statuses: open → running → done | failed; a build short of materials waits
// for the gather job it filed.
export const JOB_KINDS=['build','gather'];
const OPEN=['open','running','waiting'];
export class JobBoard {
 constructor(room){
  this.room=room;this.jobs=[];
  room.extend('jobs',{save:()=>this.jobs.slice(-40),snapshot:()=>this.view(),
   // Tasks do not survive a restart; unfinished jobs go back on the board.
   load:data=>{if(Array.isArray(data))this.jobs=data.filter(j=>j&&JOB_KINDS.includes(j.kind)).map(j=>({...j,status:j.status==='running'?'open':j.status,assignee:j.status==='running'?null:j.assignee}));}});
 }
 get open(){return this.jobs.filter(j=>OPEN.includes(j.status));}
 post({kind,spec,label,postedBy,requesterId,prefer=null,parent=null}){
  if(!JOB_KINDS.includes(kind))throw Error('Unknown job kind');
  if(this.open.length>=24)throw Error('The job board is full. Let some jobs finish first.');
  const job={id:randomUUID().slice(0,8),kind,spec,label,postedBy,requesterId,prefer,parent,status:'open',assignee:null,result:null,createdAt:Date.now(),updatedAt:Date.now()};
  this.jobs.push(job);this.room.trace?.('job.posted',{who:requesterId,job:job.id,kind,label,msg:`Job posted: ${label}`});this.changed();return job;
 }
 update(job,patch){Object.assign(job,patch,{updatedAt:Date.now()});const order=this.room.orders?.items.find(o=>o.jobId===job.id);if(order&&patch.status)order.status=patch.status;if(order&&patch.status&&patch.status!=='cancelled')this.room.trace?.(`order.${patch.status==='running'?'assigned':patch.status==='done'?'done':patch.status}`,{who:job.requesterId,order:job.id,assignee:job.assignee,level:patch.status==='failed'?'warn':'info',msg:`Build order ${patch.status}: ${job.label}${job.result?` — ${job.result}`:''}`});if(order?.blueprint==='path-to'&&patch.status==='done')this.room.trace?.('path.built',{who:job.requesterId,order:job.id,assignee:job.assignee,cells:order.cells.length,msg:`Walkway built: ${job.label}`});if(patch.status==='running')this.room.trace?.('job.assigned',{who:job.requesterId,job:job.id,assignee:job.assignee,msg:`Job assigned: ${job.label} to ${job.assignee}`});else if(['done','failed'].includes(patch.status))this.room.trace?.(`job.${patch.status==='done'?'completed':'failed'}`,{level:patch.status==='failed'?'warn':'info',who:job.requesterId,job:job.id,assignee:job.assignee,result:job.result,msg:`Job ${patch.status}: ${job.label}${job.result?` — ${job.result}`:''}`});if(patch.status==='done')this.room.missions?.orderDone(job);this.changed();return job;}
 find(id){return this.jobs.find(j=>j.id===id)??null;}
 view(){return this.jobs.slice(-20).map(({id,kind,label,status,assignee,result,postedBy,waitingFor})=>({id,kind,label,status,assignee,result,postedBy,waitingFor:waitingFor??null}));}
 changed(){this.room.sendAll?.({type:'jobs',jobs:this.view()});this.room.orders?.changed();}
}
