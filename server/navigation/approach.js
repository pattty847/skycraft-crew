import { PathSearch,approachGoal,horizontalDistance,movementToward,nearPlayer,pathStillValid,standable } from './pathfinder.js';
// Route search time per simulation tick. Leaves nearly all of the 16.7 ms frame for the room.
export const SEARCH_BUDGET_MS=1.5;
const near=(edit,p)=>Math.abs(edit.x+.5-p.x)<=2.5&&edit.y>=p.y-2&&edit.y<=p.y+3&&Math.abs(edit.z+.5-p.z)<=2.5;
// Walks an Entity to a goal through its actions only. The goal is one of:
//   {type:'entity', id}                       — stand beside a (possibly moving) entity
//   {type:'point', pos, radius}               — stand on or near a cell
//   {type:'custom', isGoal, heuristic, label} — any server-checked condition
export class NavigateTask {
 constructor(room,entity,goal,{timeout=45,budgetMs=SEARCH_BUDGET_MS,maxReplans=12,maxExpanded=4000}={}){
  this.room=room;this.entity=entity;this.goal=goal;this.timeout=timeout;this.budgetMs=budgetMs;this.maxReplans=maxReplans;this.maxExpanded=maxExpanded;
  this.elapsed=0;this.path=null;this.index=0;this.replans=0;this.result=null;this.lastPlan=-1;this.waypointTime=0;this.jumped=false;this.search=null;this.stuck=0;
 }
 finish(ok,message){this.result={ok,message};this.search=null;this.entity.actions.move({x:0,y:0,z:0});return this.result;}
 cancel(){if(!this.result)this.finish(false,'Walking cancelled.');}
 target(){
  if(this.goal.type!=='entity')return this.goal.pos??null;
  return this.room.simulation.entities.get(this.goal.id)?.position??null;
 }
 criteria(target){
  const world=this.room.world;
  if(this.goal.type==='entity')return approachGoal(world,target);
  if(this.goal.type==='custom')return {isGoal:this.goal.isGoal,heuristic:this.goal.heuristic};
  const radius=this.goal.radius??.5;
  return {isGoal:p=>horizontalDistance(p,target)<=radius&&Math.abs(p.y-target.y)<.6,heuristic:p=>Math.max(0,horizontalDistance(p,target)-radius)+Math.abs(p.y-target.y)};
 }
 arrived(target){
  const e=this.entity,world=this.room.world,p={...e.position,y:Math.round(e.position.y)};
  if(!e.grounded||!standable(world,p))return false;
  if(this.goal.type==='entity')return nearPlayer(world,e.position,target);
  return this.criteria(target).isGoal({x:e.position.x,y:Math.round(e.position.y),z:e.position.z});
 }
 onArrive(){this.finish(true,this.goal.type==='entity'?'Arrived beside you and turned to face you.':'Arrived.');}
 plan(target){
  if(++this.replans>this.maxReplans&&this.goal.type!=='entity'){this.finish(false,'The route keeps changing. I stopped; call me again when you are settled.');return;}
  const failure=this.goal.type==='entity'?'I cannot find a safe walking route to you. I will not dig or build a shortcut.':'I cannot find a safe walking route there. I will not dig or build a shortcut.';
  this.search=new PathSearch(this.room.world,this.entity.position,{...this.criteria(target),maxExpanded:this.maxExpanded,failure});
  this.searchTarget={...target};this.path=null;this.lastPlan=this.elapsed;
 }
 // True when an edit since the path was planned could affect a remaining hop and that hop no longer simulates.
 routeBroken(){
  if(this.pathRevision===this.room.world.revision)return false;
  const edits=this.room.world.editsSince(this.pathRevision);this.pathRevision=this.room.world.revision;
  const remaining=this.path.slice(Math.max(0,this.index-1));
  if(edits&&!edits.some(edit=>remaining.some(p=>near(edit,p))))return false;
  return !pathStillValid(this.room.world,this.path,this.index>0?this.path[this.index-1]:this.path[0],this.index);
 }
 tick(dt){
  if(this.result)return;
  this.elapsed+=dt;const e=this.entity,target=this.target();
  if(!target){this.finish(false,'The player disconnected. I stopped.');return;}
  if(this.elapsed>this.timeout){this.finish(false,`I could not get there within ${Math.round(this.timeout)} seconds. I stopped.`);return;}
  if(this.arrived(target)){this.onArrive(target);return;}
  // A moving player need not invalidate each waypoint. Replan only after they
  // have left the useful neighborhood of the last planned destination.
  const moved=this.goal.type==='entity'&&this.searchTarget&&(horizontalDistance(target,this.searchTarget)>3.5||Math.abs(target.y-this.searchTarget.y)>1.5);
  if(this.search){
   e.actions.move({x:0,y:0,z:0});
   if(moved&&e.grounded){this.plan(target);if(this.result)return;}
   const shared=this.room.searchDeadline;
   if(shared!=null&&performance.now()>=shared)return;
   const found=this.search.step({budgetMs:shared==null?this.budgetMs:Math.min(this.budgetMs,Math.max(0,shared-performance.now()))});if(!found)return;
   this.search=null;if(!found.ok){this.finish(false,found.reason);return;}
   this.path=found.path;this.index=0;this.pathRevision=this.room.world.revision;this.waypointTime=0;this.jumped=false;return;
  }
  if(!e.grounded&&!this.path){if(this.elapsed>3)this.finish(false,'I need solid ground to start walking.');return;}
  if(!this.path||(moved&&e.grounded&&this.elapsed-this.lastPlan>.6)||(e.grounded&&this.routeBroken())){
   if(!e.grounded){e.actions.move({x:0,y:0,z:0});return;}
   this.plan(target);return;
  }
  let waypoint=this.path[this.index];
  // Pass through intermediate waypoints; settle exactly on the last one, where goals such
  // as a clear line of sight to a block were checked (the controller converges in a tick).
  const tolerance=this.index===this.path.length-1?.005:.045;
  if(waypoint&&horizontalDistance(e.position,waypoint)<tolerance&&Math.abs(e.position.y-waypoint.y)<.04&&e.grounded){this.index++;this.waypointTime=0;this.jumped=false;waypoint=this.path[this.index];}
  if(!waypoint){this.path=null;return;}
  this.waypointTime+=dt;
  if(this.waypointTime>2.5){
   // A player standing in the way is a normal hiccup: try a fresh route twice before giving up.
   if(++this.stuck>2||!e.grounded){this.finish(false,'Something blocked my route. I stopped without changing the terrain.');return;}
   this.plan(target);return;
  }
  const from=this.index>0?this.path[this.index-1]:e.position;
  e.actions.lookAt(waypoint);
  e.actions.move(movementToward(e.position,waypoint));
  if((waypoint.leap||waypoint.y>from.y+.5)&&e.grounded&&!this.jumped){e.actions.jump();this.jumped=true;}
 }
}
export class ApproachTask extends NavigateTask {
 constructor(room,entity,targetId,options){super(room,entity,{type:'entity',id:targetId},options);this.targetId=targetId;}
 cancel(){if(!this.result)this.finish(false,'Approach cancelled.');}
 onArrive(target){
  const e=this.entity;e.actions.lookAt({x:target.x,y:target.y+1.4,z:target.z});e.actions.say('Here I am!');this.finish(true,'Arrived beside you and turned to face you.');
 }
}
