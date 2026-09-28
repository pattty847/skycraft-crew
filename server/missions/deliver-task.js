import { B, BLOCKS } from '../../src/blocks.js';
import { GatherTask } from '../tasks/gather.js';
import { SurfaceGatherTask, SURFACE_MATERIALS } from '../tasks/surface-gather.js';
import { MineTripTask, ORES } from '../tasks/mine-trip.js';
import { NavigateTask } from '../navigation/approach.js';
import { STOCKPILE_POSITION } from '../stockpile.js';

// The model selects an observed ID. Each task action and the deposit receipt
// still pass through the shared simulation path.
export class MissionDeliverTask {
 constructor(room,entity,id,onProgress=()=>{}){
  Object.assign(this,{room,entity,id,onProgress});this.result=null;this.subtask=null;this.walk=null;this.state='start';this.elapsed=0;
 }
 finish(ok,message){this.walk?.cancel();this.subtask?.cancel();this.entity.actions.move({x:0,y:0,z:0});this.result={ok,message};}
 cancel(){if(!this.result)this.finish(false,'Mission delivery stopped.');}
 tick(dt){
  if(this.result)return;this.elapsed+=dt;
  const m=this.room.missions.items.find(m=>m.id===this.id);
  if(!m||!['open','accepted'].includes(m.status)){this.finish(m?.status==='done',m?.status==='done'?'Mission delivery verified and paid.':'Mission is no longer open.');return;}
  if(this.elapsed>240){this.finish(false,'Mission delivery timed out.');return;}
  const id=m.objective.blockId,remaining=m.objective.count-m.progress.count,e=this.entity;
  if(this.subtask){this.subtask.tick(dt);if(!this.subtask.result)return;const r=this.subtask.result;this.subtask=null;if(m.status==='done'){this.finish(true,'Mission delivery verified and paid.');return;}if(!r.ok){this.finish(false,r.message);return;}this.state='start';return;}
  if(this.walk){this.walk.tick(dt);if(!this.walk.result)return;const r=this.walk.result;this.walk=null;if(!r.ok){this.finish(false,r.message);return;}this.state='deposit';}
  if(this.state==='start'){
   const held=Math.min(remaining,e.inventory[id],64);
   if(held){this.amount=held;this.walk=new NavigateTask(this.room,e,{type:'point',pos:STOCKPILE_POSITION,radius:2},{timeout:70});this.state='walk';return;}
   const count=Math.min(remaining,id===B.WOOD?16:ORES.includes(id)?5:16);
   if(id===B.WOOD)this.subtask=new GatherTask(this.room,e,{requesterId:e.id,blockId:id,count,toStockpile:true,onProgress:this.onProgress});
   else if(SURFACE_MATERIALS.includes(id))this.subtask=new SurfaceGatherTask(this.room,e,{requesterId:e.id,blockId:id,count,toStockpile:true,onProgress:this.onProgress});
   else if(ORES.includes(id))this.subtask=new MineTripTask(this.room,e,{requesterId:e.id,blockId:id,count,toStockpile:true,onProgress:this.onProgress});
   else {this.finish(false,`I cannot gather ${BLOCKS[id].name.toLowerCase()} for this mission. Give me the items first.`);return;}
   this.state='gather';return;
  }
  if(this.state==='deposit'){this.receipt=this.room.simulation.receiptSequence;e.actions.deposit(id,this.amount);this.state='verify';this.wait=0;return;}
  if(this.state==='verify'){const r=e.stockpileReceipt;this.wait+=dt;if(r?.sequence>this.receipt&&r.action==='deposit'&&r.blockId===id&&r.count===this.amount){if(!r.ok)this.finish(false,'Stockpile refused the deposit.');else this.state='start';}else if(this.wait>1)this.finish(false,'Deposit was not confirmed.');}
 }
}
