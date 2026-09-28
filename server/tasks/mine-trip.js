import { B, BLOCKS } from '../../src/blocks.js';
import { blockAccess } from '../../src/block-access.js';
import { NavigateTask } from '../navigation/approach.js';
import { canMine } from '../../src/tools.js';
import { STOCKPILE_POSITION } from '../stockpile.js';
export const MINE_TRIP_LIMIT=5;
export const ORES=[B.COAL,B.IRON];
const key=p=>`${p.x},${p.y},${p.z}`;
const center=p=>({x:p.x+.5,y:p.y+.5,z:p.z+.5});
// Only exposed, visible ore near the companion enters its candidate list.
export function visibleOre(room,e,id,radius=24){
 const p=e.position,targets=[];
 for(let x=Math.floor(p.x)-radius;x<=p.x+radius;x++)for(let z=Math.floor(p.z)-radius;z<=p.z+radius;z++)for(let y=Math.floor(p.y)-10;y<=p.y+10;y++){
  const pos={x,y,z};
  if(room.world.get(x,y,z)===id&&room.simulation.canEdit(e,pos,'break')&&blockAccess(room.world,e,pos,false,radius).ok)targets.push(pos);
 }
 return targets.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z)-Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z));
}
export class MineTripTask {
 constructor(room,entity,{requesterId,blockId,count,onProgress=()=>{},timeout=180,toStockpile=false}){
  if(!ORES.includes(blockId)||!Number.isInteger(count)||count<1||count>MINE_TRIP_LIMIT)throw Error('Mining trips accept 1–5 coal or iron ore.');
  Object.assign(this,{room,entity,requesterId,blockId,count,onProgress,timeout,toStockpile});
  this.result=null;this.state='find';this.elapsed=0;this.collected=0;this.delivered=0;this.skipped=new Set();this.walk=null;this.attempts=0;this.target=null;this.mined=[];
 }
 finish(ok,message){this.walk?.cancel();this.walk=null;this.entity.actions.move({x:0,y:0,z:0});this.result={ok,message,collected:this.collected,delivered:this.delivered,mined:this.mined};}
 cancel(){if(!this.result)this.finish(false,`Mining trip stopped. ${this.collected} collected; ${this.delivered} delivered.`);}
 supportedPlayer(pos){return [...this.room.simulation.entities.values()].some(e=>Math.abs(e.position.x-(pos.x+.5))<.8&&Math.abs(e.position.z-(pos.z+.5))<.8&&Math.abs(e.position.y-pos.y-1)<.2);}
 allowed(pos){return this.room.world.get(pos.x,pos.y,pos.z)===this.blockId&&this.room.simulation.canEdit(this.entity,pos,'break')&&!this.supportedPlayer(pos);}
 returnHome(){
  if(!this.collected){this.finish(false,'No reachable, visible unprotected ore nearby. Bring me closer to exposed ore, such as on Ironcrag.');return;}
  this.state='return';this.onProgress(`Bringing back ${this.collected} ${BLOCKS[this.blockId].name}.`);
  this.walk=new NavigateTask(this.room,this.entity,this.toStockpile?{type:'point',pos:STOCKPILE_POSITION,radius:2}:{type:'entity',id:this.requesterId},{timeout:60});
 }
 tick(dt){
  if(this.result)return;
  const e=this.entity,sim=this.room.simulation,requester=sim.entities.get(this.requesterId);this.elapsed+=dt;
  if(!canMine(e,this.blockId)){this.finish(false,'I need a stone pickaxe or better to mine iron ore.');return;}
  if(!requester){this.finish(false,'Requester disconnected; collected ore stays in my inventory.');return;}
  if(this.elapsed>this.timeout){this.finish(false,'Mining trip timed out; collected ore stays in my inventory.');return;}
  if(this.walk){
   if(this.state==='walk'&&!this.allowed(this.target)){this.walk.cancel();this.walk=null;this.skipped.add(key(this.target));this.state='find';return;}
   this.walk.tick(dt);if(!this.walk.result)return;
   const result=this.walk.result;this.walk=null;
   if(this.state==='return'){if(!result.ok){this.finish(false,'Could not reach you; collected ore stays in my inventory.');return;}this.state='give';return;}
   if(!result.ok){this.skipped.add(key(this.target));this.state='find';return;}
   this.state='mine';this.mineTime=0;this.receipt=sim.receiptSequence;return;
  }
  if(this.state==='find'){
   if(this.collected>=this.count||this.attempts>=16){this.returnHome();return;}
   this.target=visibleOre(this.room,e,this.blockId).find(p=>!this.skipped.has(key(p))&&this.allowed(p));
   if(!this.target){this.returnHome();return;}this.attempts++;
   const target=this.target,goal=center(target);this.state='walk';
   this.onProgress(`Walking to visible ${BLOCKS[this.blockId].name} at (${key(target)}).`);
   this.walk=new NavigateTask(this.room,e,{type:'custom',pos:goal,isGoal:p=>blockAccess(this.room.world,{position:p},target).ok&&!(Math.abs(p.x-goal.x)<.8&&Math.abs(p.z-goal.z)<.8&&Math.abs(p.y-target.y-1)<.2),heuristic:p=>Math.max(0,Math.hypot(p.x-goal.x,p.y+1.4-goal.y,p.z-goal.z)-4.5)},{timeout:35});return;
  }
  if(this.state==='mine'){
   const r=e.mineReceipt;
   if(r&&r.sequence>this.receipt&&r.blockId===this.blockId&&key(r.pos)===key(this.target)){
    this.collected++;this.mined.push({...this.target});this.onProgress(`Mined ${this.collected}/${this.count} ${BLOCKS[this.blockId].name}.`);this.state='find';return;
   }
   this.mineTime+=dt;
   if(!this.allowed(this.target)||!blockAccess(this.room.world,e,this.target).ok||this.mineTime>BLOCKS[this.blockId].hardness+1){this.skipped.add(key(this.target));this.state='find';return;}
   e.actions.lookAt(center(this.target));e.actions.breakBlock(this.target);return;
  }
  if(this.state==='give'){
   this.receipt=sim.receiptSequence;if(this.toStockpile)e.actions.deposit(this.blockId,this.collected);else e.actions.give(this.requesterId,this.blockId,this.collected);this.state='verify';this.verifyTime=0;return;
  }
  if(this.state==='verify'){
   const r=this.toStockpile?e.stockpileReceipt:e.transferReceipt;this.verifyTime+=dt;
   if(r&&r.sequence>this.receipt&&(this.toStockpile?r.action==='deposit':r.targetId===this.requesterId)&&r.blockId===this.blockId){
    if(r.ok){this.delivered=r.count;this.finish(this.delivered===this.count,`Delivered ${this.delivered}/${this.count} ${BLOCKS[this.blockId].name}. Only visible, unprotected ore was mined.`);}
    else this.finish(false,'Could not hand over the ore. Move closer and make room in your inventory; the ore stays with me.');
   }else if(this.verifyTime>1)this.finish(false,'Delivery was not confirmed; check my inventory.');
  }
 }
}
