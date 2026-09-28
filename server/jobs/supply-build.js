import { B, BLOCKS } from '../../src/blocks.js';
import { NavigateTask } from '../navigation/approach.js';
import { STOCKPILE_POSITION } from '../stockpile.js';
import { GatherTask } from '../tasks/gather.js';
import { SurfaceGatherTask, SURFACE_MATERIALS } from '../tasks/surface-gather.js';
import { BuildTask } from '../building/build-task.js';
import { planBuild } from '../building/planner.js';
import { insideSandbox } from '../../src/world.js';
import { isCompanionId } from '../../src/presence.js';
import { NATURAL_PATH_FLOOR } from '../../src/path-plan.js';
const missing=(plan,e)=>Object.entries(plan.need).map(([id,n])=>({id:+id,count:Math.max(0,n-e.inventory[id])})).filter(x=>x.count>0);
const stockShort=(plan,e)=>{const short=missing(plan,e);const planks=short.find(x=>x.id===B.PLANKS)?.count??0;const wood=Math.max(0,(plan.need[B.WOOD]??0)+Math.ceil(planks/4)-e.inventory[B.WOOD]);if(wood&&!short.some(x=>x.id===B.WOOD))short.push({id:B.WOOD,count:wood});return short;};
export class SupplyBuildTask {
 constructor(room,entity,plan,{onProgress=()=>{},onChange=()=>{}}={}){
  const creative=isCompanionId(entity.id)&&plan.cells.length>0&&plan.cells.every(c=>insideSandbox(c.x,c.z));
  plan={...plan,creative,need:creative?{}:plan.cells.filter(c=>room.world.get(c.x,c.y,c.z)!==c.id).reduce((need,c)=>(need[c.id]=(need[c.id]??0)+1,need),{})};Object.assign(this,{room,entity,plan,onProgress,onChange});this.state=creative?'build':'stockpile';this.result=null;this.walk=null;this.subtask=null;this.attempts=new Map();this.elapsed=0;this.pending=null;this.withdrawn={};
  if(creative)room.trace?.('order.sandbox',{who:entity.id,blueprint:plan.blueprint,msg:'Sandbox order needs no supplies'});
 }
 finish(ok,message){this.walk?.cancel();this.subtask?.cancel();this.entity.actions.move({x:0,y:0,z:0});this.result={ok,message};this.onChange(this);return this.result;}
 cancel(){if(!this.result)this.finish(false,'Build order cancelled.');}
 tick(dt){
  if(this.result)return;this.elapsed+=dt;if(this.elapsed>120+this.plan.cells.length*8){this.finish(false,'Build order timed out.');return;}
  const e=this.entity,room=this.room;
  if(this.walk){this.walk.tick(dt);if(!this.walk.result)return;const result=this.walk.result;this.walk=null;if(!result.ok){this.finish(false,`Could not reach the stockpile: ${result.message}`);return;}this.state='withdraw';}
  if(this.subtask){this.subtask.tick(dt);if(!this.subtask.result)return;const result=this.subtask.result;this.subtask=null;if(this.state!=='building'&&result.ok)this.room.trace('order.materials.gathered',{who:e.id,blockId:this.gatheringId,count:result.collected,msg:`Gathered ${result.collected} ${BLOCKS[this.gatheringId].name} for build`});if(this.state==='building'){this.finish(result.ok,result.message);return;}if(!result.ok){this.finish(false,result.message);return;}this.state='supply';return;}
  if(this.state==='stockpile'){
   if(!stockShort(this.plan,e).some(({id})=>room.stockpile?.items[id]>0)){this.state='supply';return;}
   this.walk=new NavigateTask(room,e,{type:'point',pos:STOCKPILE_POSITION,radius:2},{timeout:90});return;
  }
  if(this.state==='withdraw'){
   if(this.pending){const r=e.stockpileReceipt;if(r?.sequence>this.pending.sequence&&r.action==='withdraw'&&r.blockId===this.pending.id&&r.count===this.pending.count){
    if(r.ok){this.withdrawn[r.blockId]=(this.withdrawn[r.blockId]??0)+r.count;room.trace('order.materials.withdrawn',{who:e.id,blockId:r.blockId,count:r.count,msg:`Withdrew ${r.count} ${BLOCKS[r.blockId].name} for build`});this.onProgress(`Withdrew ${r.count} ${BLOCKS[r.blockId].name.toLowerCase()} from stockpile.`);this.pending=null;}
    else{this.finish(false,`Stockpile refused ${BLOCKS[this.pending.id].name.toLowerCase()} withdrawal.`);return;}
   }else if((this.pending.wait+=dt)>1){this.finish(false,'Stockpile withdrawal was not confirmed.');return;}else return;}
   const next=stockShort(this.plan,e).find(({id})=>room.stockpile.items[id]>0);
   if(!next){this.state='supply';return;}
   const count=Math.min(next.count,room.stockpile.items[next.id],64);this.pending={id:next.id,count,sequence:room.simulation.receiptSequence,wait:0};e.actions.withdraw(next.id,count);return;
  }
  if(this.state==='supply'){
   const short=missing(this.plan,e);
   if(!short.length){this.state='build';return;}
   // Planks are made through the same craft action as players use.
   const planks=short.find(x=>x.id===B.PLANKS),woodNeeded=this.plan.need[B.WOOD]??0;
   if(planks&&e.inventory[B.WOOD]>woodNeeded){const before=e.inventory[B.PLANKS];e.actions.craft('planks');this.pending={id:B.PLANKS,before,wait:0};this.state='craft';return;}
   let next=short.find(x=>x.id!==B.PLANKS);
   if(!next&&planks)next={id:B.WOOD,count:Math.ceil(planks.count/4)};
   if(!next)return;
   const tries=(this.attempts.get(next.id)??0)+1;this.attempts.set(next.id,tries);
   if(tries>Math.min(40,Math.ceil((this.plan.need[next.id]??0)/16)+4)){this.finish(false,`Could not obtain enough ${BLOCKS[next.id].name.toLowerCase()}.`);return;}
   if(next.id!==B.WOOD&&!SURFACE_MATERIALS.includes(next.id)){this.finish(false,`Cannot gather ${BLOCKS[next.id].name.toLowerCase()}; put it in the stockpile.`);return;}
   const count=Math.min(next.count,16);this.onProgress(`Gathering ${count} ${BLOCKS[next.id].name.toLowerCase()} for the build.`);
   room.trace('order.materials.gathering',{who:e.id,blockId:next.id,count,msg:`Gathering ${count} ${BLOCKS[next.id].name} for build`});
   this.gatheringId=next.id;this.subtask=next.id===B.WOOD?new GatherTask(room,e,{requesterId:e.id,count,onProgress:this.onProgress}):new SurfaceGatherTask(room,e,{requesterId:e.id,blockId:next.id,count,onProgress:this.onProgress});return;
  }
  if(this.state==='craft'){
   this.pending.wait+=dt;
   if(e.inventory[B.PLANKS]>this.pending.before){this.pending=null;this.state='supply';}
   else if(this.pending.wait>1)this.finish(false,'Could not craft planks.');return;
  }
  if(this.state==='build'){
   if(room.blueprints?.get(this.plan.blueprint)){try{planBuild(room,e,{blueprint:this.plan.blueprint,anchor:this.plan.anchor,facing:this.plan.facing,params:this.plan.params});}catch(error){this.finish(false,error.message);return;}}
   for(const c of this.plan.clear??[]){const id=room.world.get(c.x,c.y,c.z);if(id&&(!(this.plan.blueprint==='path-to'&&(id===B.LEAVES||[B.SAPLING,B.RED_MUSHROOM,B.BROWN_MUSHROOM,B.YELLOW_FLOWER,B.WHITE_FLOWER].includes(id)))||!room.simulation.canEdit(e,c,'break'))){this.finish(false,'The build headroom is blocked or protected.');return;}}
   for(const c of this.plan.cells){const id=room.world.get(c.x,c.y,c.z),replacing=(this.plan.replace??[]).some(v=>v.x===c.x&&v.y===c.y&&v.z===c.z);
    if(!room.simulation.canEdit(e,c,'place')||replacing&&id!==c.id&&(!NATURAL_PATH_FLOOR.has(id)||!room.simulation.canEdit(e,c,'break'))||id&&id!==c.id&&!replacing&&!(this.plan.blueprint==='path-to'&&(id===B.LEAVES||[B.SAPLING,B.RED_MUSHROOM,B.BROWN_MUSHROOM,B.YELLOW_FLOWER,B.WHITE_FLOWER].includes(id))&&(this.plan.clear??[]).some(v=>v.x===c.x&&v.y===c.y&&v.z===c.z))){this.finish(false,'The site changed or became protected.');return;}}
   this.onProgress(`Building ${this.plan.label.toLowerCase()}.`);room.trace('order.building',{who:e.id,blueprint:this.plan.blueprint,msg:`Building ${this.plan.label}`});
   this.subtask=new BuildTask(room,e,this.plan,{onProgress:this.onProgress,onChange:this.onChange});this.state='building';return;
  }
  if(this.state==='building')this.finish(false,'Build task ended unexpectedly.');
 }
}
