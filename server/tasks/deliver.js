import { BLOCKS } from '../../src/blocks.js';
import { GIVE_REACH } from '../../src/simulation.js';
import { ApproachTask } from '../navigation/approach.js';
import { horizontalDistance } from '../navigation/pathfinder.js';
// Walk to the requester (if not already within arm's reach) and hand over items
// the companion already has. Success is read from the receiver's inventory.
export class DeliverTask {
 constructor(room,entity,{requesterId,blockId,count}){
  this.room=room;this.entity=entity;this.requesterId=requesterId;this.blockId=blockId;this.count=count;this.result=null;this.walk=null;this.state='walk';this.wait=0;
 }
 finish(ok,message){this.walk?.cancel();this.walk=null;this.entity.actions.move({x:0,y:0,z:0});this.result={ok,message};}
 cancel(){if(!this.result)this.finish(false,'Delivery stopped.');}
 tick(dt){
  if(this.result)return;
  const e=this.entity,target=this.room.simulation.entities.get(this.requesterId),name=BLOCKS[this.blockId].name.toLowerCase();
  if(!target){this.finish(false,'You left before I could hand anything over.');return;}
  if(e.inventory[this.blockId]<this.count&&this.state!=='verify'){this.finish(false,`I only have ${e.inventory[this.blockId]} ${name}.`);return;}
  const close=horizontalDistance(e.position,target.position)<=GIVE_REACH-.3&&Math.abs(e.position.y-target.position.y)<=1.4;
  if(this.state==='walk'){
   if(close&&e.grounded){this.state='give';return;}
   if(!this.walk){this.walk=new ApproachTask(this.room,e,this.requesterId,{timeout:60});this.walk.onArrive=()=>this.walk.finish(true,'Arrived.');}
   this.walk.tick(dt);if(!this.walk.result)return;
   if(!this.walk.result.ok){this.finish(false,`I have the ${name} but could not reach you: ${this.walk.result.message}`);return;}
   this.walk=null;this.state='give';return;
  }
  if(this.state==='give'){
   this.before=target.inventory[this.blockId];
   e.actions.lookAt({x:target.position.x,y:target.position.y+1.4,z:target.position.z});e.actions.give(this.requesterId,this.blockId,this.count);
   this.state='verify';this.wait=0;return;
  }
  const gained=target.inventory[this.blockId]-this.before;
  if(gained===this.count){e.actions.say(`Here you go: ${this.count} ${name}!`);this.finish(true,`Handed you ${this.count} ${name}; your inventory confirms it.`);return;}
  if((this.wait+=dt)>1){this.state='walk';}
 }
}
