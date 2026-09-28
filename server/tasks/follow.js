import { ApproachTask } from '../navigation/approach.js';
import { horizontalDistance } from '../navigation/pathfinder.js';
// Stay near a player for a bounded time, walking only when they move away.
export class FollowTask {
 constructor(room,entity,targetId,{duration=150,leash=3.5}={}){
  this.room=room;this.entity=entity;this.targetId=targetId;this.duration=duration;this.leash=leash;this.elapsed=0;this.walk=null;this.failures=0;this.result=null;this.arrivals=0;
 }
 finish(ok,message){this.walk?.cancel();this.walk=null;this.entity.actions.move({x:0,y:0,z:0});this.result={ok,message};return this.result;}
 cancel(){if(!this.result)this.finish(false,'Stopped following.');}
 tick(dt){
  if(this.result)return;
  this.elapsed+=dt;const target=this.room.simulation.entities.get(this.targetId);
  if(!target){this.finish(false,'You left, so I stopped following.');return;}
  if(this.elapsed>this.duration){this.finish(true,`Followed you for ${Math.round(this.duration/60*10)/10} minutes. I'll wait here now.`);return;}
  if(this.walk){
   this.walk.tick(dt);if(!this.walk.result)return;
   if(this.walk.result.ok){this.arrivals++;this.failures=0;}else if(++this.failures>=3){this.finish(false,`I lost the trail: ${this.walk.result.message}`);return;}
   this.walk=null;return;
  }
  const p=this.entity.position;
  if(horizontalDistance(p,target.position)>this.leash||Math.abs(p.y-target.position.y)>1.5){this.walk=new ApproachTask(this.room,this.entity,this.targetId,{timeout:30});this.walk.onArrive=()=>this.walk.finish(true,'Caught up.');return;}
  this.entity.actions.lookAt({x:target.position.x,y:target.position.y+1.4,z:target.position.z});
 }
}
