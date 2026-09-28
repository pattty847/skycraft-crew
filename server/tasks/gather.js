import { B, BLOCKS } from '../../src/blocks.js';
import { blockAccess, BLOCK_REACH } from '../../src/block-access.js';
import { ApproachTask, NavigateTask } from '../navigation/approach.js';
import { TreeScan } from './trees.js';
import { STOCKPILE_POSITION } from '../stockpile.js';
export const GATHER_LIMIT=16;
const center=p=>({x:p.x+.5,y:p.y+.5,z:p.z+.5});
// A server-checked mission: chop up to `count` wood from natural tree trunks,
// walk back and hand it over. Allowed world edits are exactly the trunk blocks
// chosen here; success is read from the two inventories, never from a claim.
export class GatherTask {
 constructor(room,entity,{requesterId,count,blockId=B.WOOD,toStockpile=false,timeout=180,onProgress=()=>{}}){
  if(blockId!==B.WOOD)throw Error('Only wood can be gathered so far.');
  this.room=room;this.entity=entity;this.requesterId=requesterId;this.count=Math.max(1,Math.min(GATHER_LIMIT,count|0));this.blockId=blockId;this.toStockpile=toStockpile;this.timeout=timeout;this.onProgress=onProgress;
  this.elapsed=0;this.result=null;this.state='find';this.tree=null;this.walk=null;this.scan=null;this.attempts=0;this.skipped=new Set();
  this.start=entity.inventory[blockId];this.receipt=room.simulation.receiptSequence;this.collected=0;this.mined=[];this.chopping=null;this.chopTime=0;
 }
 get allowed(){return this.tree?.trunk??[];}
 finish(ok,message){this.walk?.cancel();this.walk=null;this.entity.actions.move({x:0,y:0,z:0});this.result={ok,message,collected:this.collected,mined:this.mined};return this.result;}
 cancel(){if(!this.result)this.finish(false,`Gathering stopped with ${this.collected} wood.`);}
 nextBlock(){return this.tree?.trunk.find(p=>this.room.world.get(p.x,p.y,p.z)===this.blockId)??null;}
 tick(dt){
  if(this.result)return;
  this.elapsed+=dt;const e=this.entity,world=this.room.world;
  if(!this.toStockpile&&!this.room.simulation.entities.get(this.requesterId)){this.finish(false,'You left before I could hand anything over.');return;}
  if(this.elapsed>this.timeout){this.finish(false,`Out of time after gathering ${this.collected} wood.`);return;}
  if(this.walk){
   this.walk.tick(dt);if(!this.walk.result)return;
   const walked=this.walk.result;this.walk=null;
   if(this.state==='deliver'){if(!walked.ok){this.finish(false,`I have ${this.collected} wood but could not reach you: ${walked.message}`);return;}this.state='give';return;}
   if(!walked.ok){this.skipped.add(this.key(this.tree.base));this.tree=null;this.state='find';return;}
   this.state='chop';return;
  }
  if(this.state==='find'){
   // Gathering for oneself (a builder topping up its own wood) needs no hand-over.
   if(this.collected>=this.count&&this.requesterId===this.entity.id&&!this.toStockpile){this.finish(true,`Collected ${this.collected} wood from natural trees.`);return;}
   if(this.collected>=this.count){this.state='deliver';this.onProgress(`Got ${this.collected} wood. Bringing it to you.`);this.walk=this.deliveryWalk(e);return;}
   this.scan??=new TreeScan(world,e.position,40);
   if(!this.scan.tick())return;
   this.tree=this.scan.trees.find(t=>!this.skipped.has(this.key(t.base))&&t.trunk.every(p=>this.room.simulation.canEdit(e,p,'break')&&world.get(p.x,p.y,p.z)===B.WOOD))??null;
   if(!this.tree){if(this.collected){if(this.requesterId===e.id&&!this.toStockpile)this.finish(false,`Collected ${this.collected}/${this.count} wood; no more reachable trees within 40 blocks.`);else{this.state='deliver';this.onProgress(`No more reachable trees nearby. Bringing you ${this.collected} wood.`);this.walk=this.deliveryWalk(e);}}else this.finish(false,'I could not find a reachable natural tree within 40 blocks. I only chop real trees, never buildings.');return;}
   this.onProgress(`Heading to a tree at (${this.tree.base.x}, ${this.tree.base.y}, ${this.tree.base.z}).`);
   this.state='approach';this.attempts=0;this.walkToward(this.nextBlock());return;
  }
  if(this.state==='chop'){
   if(this.chopping&&world.get(this.chopping.x,this.chopping.y,this.chopping.z)!==this.blockId)this.check(this.chopping);
   const target=this.nextBlock();
   if(!target)this.tree=null;
   if(!target||this.collected>=this.count){this.chopping=null;this.state='find';return;}
   if(!blockAccess(world,e,target).ok){if(++this.attempts>2){this.giveUpTree();return;}this.walkToward(target);return;}
   if(!this.room.simulation.canEdit(e,target,'break')){this.giveUpTree();return;}
   this.chopping=target;this.chopTime+=dt;
   if(this.chopTime>BLOCKS[this.blockId].hardness+1.5){this.chopTime=0;if(++this.attempts>2){this.giveUpTree();return;}}
   e.actions.lookAt(center(target));e.actions.breakBlock(target);
   return;
  }
  if(this.state==='give'){
   const target=this.room.simulation.entities.get(this.requesterId),before=this.toStockpile?this.room.stockpile.items[this.blockId]:target.inventory[this.blockId],have=e.inventory[this.blockId]-this.start;
   const amount=Math.min(this.collected,have);if(amount<1){this.finish(false,'I have nothing to hand over.');return;}
   this.deliveryReceipt=this.room.simulation.receiptSequence;if(this.toStockpile)e.actions.deposit(this.blockId,amount);else{e.actions.lookAt({x:target.position.x,y:target.position.y+1.4,z:target.position.z});e.actions.give(this.requesterId,this.blockId,amount);}
   this.state='verify';this.expected={before,amount};return;
  }
  if(this.state==='verify'){
   const target=this.room.simulation.entities.get(this.requesterId),gained=(this.toStockpile?this.room.stockpile.items[this.blockId]:target.inventory[this.blockId])-this.expected.before;
   if(gained===this.expected.amount&&(this.toStockpile?e.stockpileReceipt?.ok&&e.stockpileReceipt.sequence>this.deliveryReceipt&&e.stockpileReceipt.action==='deposit'&&e.stockpileReceipt.blockId===this.blockId&&e.stockpileReceipt.count===gained:e.transferReceipt?.ok&&e.transferReceipt.sequence>this.deliveryReceipt&&e.transferReceipt.targetId===this.requesterId&&e.transferReceipt.blockId===this.blockId&&e.transferReceipt.count===gained)){e.actions.say(`Here you go: ${gained} wood!`);this.finish(true,`Delivered ${gained} wood from natural trees${this.toStockpile?' to the stockpile':''}; verified by receipt.`);}
   else if((this.verifyTime=(this.verifyTime??0)+dt)>1){this.state='deliver';this.walk=this.deliveryWalk(e);}
  }
 }
 // The block is gone; only an inventory increase counts as our chop.
 check(target){
  this.chopTime=0;this.attempts=0;this.chopping=null;
  const receipt=this.entity.mineReceipt;
  const now=this.entity.inventory[this.blockId]-this.start;
  if(receipt?.sequence>this.receipt&&receipt.blockId===this.blockId&&this.key(receipt.pos)===this.key(target)&&now>this.collected){this.receipt=receipt.sequence;this.collected=now;this.mined.push({...target});this.onProgress(`Chopped wood ${this.collected}/${this.count}.`);}
 }
 giveUpTree(){this.skipped.add(this.key(this.tree.base));this.tree=null;this.chopping=null;this.state='find';}
 deliveryWalk(e){if(this.toStockpile)return new NavigateTask(this.room,e,{type:'point',pos:STOCKPILE_POSITION,radius:2},{timeout:60});const walk=new ApproachTask(this.room,e,this.requesterId,{timeout:60});walk.onArrive=()=>walk.finish(true,'Arrived.');return walk;}
 key(p){return `${p.x},${p.y},${p.z}`;}
 walkToward(target){
  if(!target){this.state='find';return;}
  const world=this.room.world,goal=center(target);
  this.walk=new NavigateTask(this.room,this.entity,{type:'custom',pos:goal,
   isGoal:p=>blockAccess(world,{position:p},target).ok,
   heuristic:p=>Math.max(0,Math.hypot(p.x-goal.x,p.y+1.4-goal.y,p.z-goal.z)-(BLOCK_REACH-1.5))},{timeout:40});
 }
}
