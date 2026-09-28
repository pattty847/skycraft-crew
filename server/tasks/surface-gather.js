import { B, BLOCKS } from '../../src/blocks.js';
import { blockAccess, BLOCK_REACH } from '../../src/block-access.js';
import { canMine } from '../../src/tools.js';
import { NavigateTask } from '../navigation/approach.js';
import { STOCKPILE_POSITION } from '../stockpile.js';
export const SURFACE_MATERIALS=[B.STONE,B.DIRT,B.SAND,B.CLAY,B.LEAVES];
export const SURFACE_LIMIT=16;
const key=p=>`${p.x},${p.y},${p.z}`;
const center=p=>({x:p.x+.5,y:p.y+.5,z:p.z+.5});
export function surfaceTargets(room,e,id,radius=24){
 const p=e.position,out=[];
 for(let x=Math.max(0,Math.floor(p.x)-radius);x<=Math.min(127,Math.floor(p.x)+radius);x++)for(let z=Math.max(0,Math.floor(p.z)-radius);z<=Math.min(127,Math.floor(p.z)+radius);z++)for(let y=Math.max(1,Math.floor(p.y)-10);y<=Math.min(46,Math.floor(p.y)+10);y++){
  const pos={x,y,z};if(room.world.get(x,y,z)!==id||!room.simulation.canEdit(e,pos,'break')||id===B.LEAVES&&room.ecology?.placedLeaves.has(room.world.index(x,y,z)))continue;
  if([...room.simulation.entities.values()].some(other=>Math.abs(other.position.x-(x+.5))<.8&&Math.abs(other.position.z-(z+.5))<.8&&Math.abs(other.position.y-y-1)<.2))continue;
  if(![[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([dx,dy,dz])=>room.world.get(x+dx,y+dy,z+dz)===0))continue;
  if(!blockAccess(room.world,e,pos,false,radius).ok)continue;
  out.push(pos);
 }
 return out.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z)-Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z));
}
export class SurfaceGatherTask {
 constructor(room,entity,{requesterId,blockId,count,toStockpile=false,timeout=240,onProgress=()=>{}}){
  if(!SURFACE_MATERIALS.includes(blockId)||!Number.isInteger(count)||count<1||count>SURFACE_LIMIT)throw Error('Gather accepts 1–16 stone, dirt, sand, clay or natural leaves.');
  Object.assign(this,{room,entity,requesterId,blockId,count,toStockpile,timeout,onProgress});this.result=null;this.state='find';this.elapsed=0;this.collected=0;this.delivered=0;this.skipped=new Set();this.walk=null;this.target=null;this.mined=[];this.attempts=0;
 }
 finish(ok,message){this.walk?.cancel();this.walk=null;this.entity.actions.move({x:0,y:0,z:0});this.result={ok,message,collected:this.collected,delivered:this.delivered,mined:this.mined};return this.result;}
 cancel(){if(!this.result)this.finish(false,'Gathering stopped.');}
  allowed(p){return p&&this.room.world.get(p.x,p.y,p.z)===this.blockId&&!(this.blockId===B.LEAVES&&this.room.ecology?.placedLeaves.has(this.room.world.index(p.x,p.y,p.z)))&&this.room.simulation.canEdit(this.entity,p,'break')&&canMine(this.entity,this.blockId);}
 tick(dt){
  if(this.result)return;this.elapsed+=dt;const e=this.entity,sim=this.room.simulation;
  if(this.elapsed>this.timeout){this.finish(false,`Gathering timed out with ${this.collected} ${BLOCKS[this.blockId].name.toLowerCase()}.`);return;}
  if(!this.toStockpile&&this.requesterId!==e.id&&!sim.entities.has(this.requesterId)){this.finish(false,'The requester left.');return;}
  if(this.walk){
   this.walk.tick(dt);if(!this.walk.result)return;const result=this.walk.result;this.walk=null;
   if(this.state==='return'){if(!result.ok){this.finish(false,'Could not reach the receiver.');return;}this.state=this.toStockpile?'deposit':'give';return;}
   if(!result.ok||!this.allowed(this.target)){this.skipped.add(key(this.target));this.state='find';return;}
   this.state='mine';this.receipt=sim.receiptSequence;this.mineTime=0;return;
  }
  if(this.state==='find'){
   if(this.collected>=this.count||this.attempts>=32){this.returnHome();return;}
   this.target=surfaceTargets(this.room,e,this.blockId).find(p=>!this.skipped.has(key(p))&&this.allowed(p));
   if(!this.target){this.returnHome();return;}this.attempts++;
   const target=this.target,goal=center(target);this.state='walk';
   this.walk=new NavigateTask(this.room,e,{type:'custom',pos:goal,isGoal:p=>blockAccess(this.room.world,{position:p},target).ok,heuristic:p=>Math.max(0,Math.hypot(p.x-goal.x,p.y+1.4-goal.y,p.z-goal.z)-(BLOCK_REACH-1.5))},{timeout:35});return;
  }
  if(this.state==='mine'){
   const receipt=e.mineReceipt;
   if(receipt?.sequence>this.receipt&&receipt.blockId===this.blockId&&key(receipt.pos)===key(this.target)){
    this.collected++;this.mined.push({...this.target});this.onProgress(`Gathered ${this.collected}/${this.count} ${BLOCKS[this.blockId].name.toLowerCase()}.`);this.state='find';return;
   }
   this.mineTime+=dt;
   if(!this.allowed(this.target)||!blockAccess(this.room.world,e,this.target).ok||this.mineTime>BLOCKS[this.blockId].hardness+2){this.skipped.add(key(this.target));this.state='find';return;}
   e.actions.lookAt(center(this.target));e.actions.breakBlock(this.target);return;
  }
  if(this.state==='give'||this.state==='deposit'){
   this.receipt=sim.receiptSequence;this.verifyTime=0;
   if(this.state==='give')e.actions.give(this.requesterId,this.blockId,this.collected);
   else e.actions.deposit(this.blockId,this.collected);
   this.state='verify';return;
  }
  if(this.state==='verify'){
   const r=this.toStockpile?e.stockpileReceipt:e.transferReceipt;this.verifyTime+=dt;
   if(r?.sequence>this.receipt&&r.blockId===this.blockId&&(this.toStockpile?r.action==='deposit':r.targetId===this.requesterId)){
    if(r.ok){this.delivered=r.count;this.finish(this.delivered===this.count,`Delivered ${this.delivered}/${this.count} ${BLOCKS[this.blockId].name.toLowerCase()}${this.toStockpile?' to the stockpile':''}; verified by receipt.`);}
    else this.finish(false,'Delivery was refused; gathered materials remain in my inventory.');
   }else if(this.verifyTime>1)this.finish(false,'Delivery was not confirmed.');
  }
 }
 returnHome(){
  if(!this.collected){this.finish(false,`No visible, reachable, unprotected surface ${BLOCKS[this.blockId].name.toLowerCase()} nearby.`);return;}
  if(this.requesterId===this.entity.id&&!this.toStockpile){this.finish(this.collected===this.count,`Collected ${this.collected}/${this.count} ${BLOCKS[this.blockId].name.toLowerCase()}; verified by mining receipts.`);return;}
  this.state='return';this.walk=new NavigateTask(this.room,this.entity,this.toStockpile?{type:'point',pos:STOCKPILE_POSITION,radius:2}:{type:'entity',id:this.requesterId},{timeout:70});
 }
}
