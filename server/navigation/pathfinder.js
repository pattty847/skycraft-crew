import { collides,moveBody } from '../../src/physics.js';
import { isSolid } from '../../src/blocks.js';
import { raycast } from '../../src/raycast.js';
const key=p=>`${p.x},${p.y},${p.z}`;
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]];
export const horizontalDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function standable(world,p){return world.inside(Math.floor(p.x),p.y,Math.floor(p.z))&&isSolid(world.get(Math.floor(p.x),p.y-1,Math.floor(p.z)))&&!collides(world,p);}
export function nearPlayer(world,p,target){
 const distance=horizontalDistance(p,target);
 // Beside you, or one block above or below (you may be standing on a step or a ledge),
 // with a clear line from the companion's eyes to your torso.
 if(distance<.75||distance>2.2||Math.abs(p.y-target.y)>1.1)return false;
 const origin={x:p.x,y:p.y+1.4,z:p.z},offset={x:target.x-p.x,y:target.y+1-origin.y,z:target.z-p.z},length=Math.hypot(offset.x,offset.y,offset.z);
 return !raycast(world,origin,{x:offset.x/length,y:offset.y/length,z:offset.z/length},Math.max(0,length-.4));
}
export function movementToward(position,target){const dx=target.x-position.x,dz=target.z-position.z,d=Math.hypot(dx,dz),scale=Math.max(d,4.8/60);return {x:dx/scale,y:0,z:dz/scale};}
// Validate graph edges with the actual collision/gravity/jump model, not point-sized rays.
// A leap is a running jump across a gap; it starts with a jump even when landing lower.
export function canTraverse(world,from,to,leap=false){
 const body={position:{...from},velocity:{x:0,y:0,z:0},grounded:true};
 for(let tick=0;tick<80;tick++){
  moveBody(world,body,movementToward(body.position,to),tick===0&&(leap||to.y>from.y+.5),1/60);
  if(body.position.y<Math.min(from.y,to.y)-.15)return false;
  if(horizontalDistance(body.position,to)<.035&&Math.abs(body.position.y-to.y)<.03&&body.grounded)return true;
 }
 return false;
}
// Binary min-heap on score. Stale entries are skipped when popped (lazy deletion).
class Frontier {
 constructor(){this.items=[];}
 get size(){return this.items.length;}
 push(item){const a=this.items;a.push(item);let i=a.length-1;while(i>0){const parent=(i-1)>>1;if(a[parent].score<=item.score)break;a[i]=a[parent];i=parent;}a[i]=item;}
 pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;for(;;){let child=2*i+1;if(child>=a.length)break;if(child+1<a.length&&a[child+1].score<a[child].score)child++;if(a[child].score>=last.score)break;a[i]=a[child];i=child;}a[i]=last;}return top;}
}
export function* neighbors(world,p){
 for(const [dx,dz] of DIRECTIONS){
  let gap=true;
  for(const dy of [0,1,-1]){const next={x:p.x+dx,y:p.y+dy,z:p.z+dz};if(standable(world,next)){gap=false;yield {p:next,cost:1+Math.abs(dy)*.4,leap:false};}}
  // Only consider a running jump where the next cell has nowhere to stand.
  if(!gap||!world.inside(Math.floor(p.x+dx),p.y,Math.floor(p.z+dz)))continue;
  let landed=false;
  for(const distance of [2,3])for(const dy of [0,1,-1]){
   if(landed)break;
   const next={x:p.x+dx*distance,y:p.y+dy,z:p.z+dz*distance};
   if(standable(world,next)){landed=true;yield {p:next,cost:distance+1.5+Math.abs(dy)*.4,leap:true};}
  }
 }
}
// An incremental A* search. step() spends a bounded amount of work, so a long
// search spreads over several simulation ticks instead of stalling the room.
export class PathSearch {
 constructor(world,position,{isGoal,heuristic,maxExpanded=4000,failure='I cannot find a safe walking route. I will not dig or build a shortcut.'}){
  this.world=world;this.isGoal=isGoal;this.heuristic=heuristic;this.maxExpanded=maxExpanded;this.failure=failure;this.expanded=0;this.result=null;
  const start={x:Math.floor(position.x)+.5,y:Math.round(position.y),z:Math.floor(position.z)+.5};
  if(!standable(world,start)){this.result={ok:false,reason:'I need solid ground before I can plan a route.',expanded:0};return;}
  if(!canTraverse(world,position,start)){this.result={ok:false,reason:'I cannot safely step out of this spot.',expanded:0};return;}
  this.open=new Frontier();this.costs=new Map([[key(start),0]]);this.parents=new Map();this.points=new Map([[key(start),{...start,leap:false}]]);this.closed=new Set();
  this.open.push({p:start,cost:0,score:heuristic(start)});
 }
 step({budgetMs=Infinity,maxExpansions=Infinity}={}){
  if(this.result)return this.result;
  const deadline=performance.now()+budgetMs;let work=0;
  while(this.open.size&&this.expanded<this.maxExpanded){
   if(work>=maxExpansions||(work%4===3&&performance.now()>deadline))return null;
   const current=this.open.pop(),id=key(current.p);if(this.closed.has(id))continue;this.closed.add(id);this.expanded++;work++;
   if(this.isGoal(current.p)){
    const path=[];let cursor=id;while(cursor){path.push(this.points.get(cursor));cursor=this.parents.get(cursor);}path.reverse();
    return this.result={ok:true,path,expanded:this.expanded};
   }
   for(const edge of neighbors(this.world,current.p)){
    const nid=key(edge.p);if(this.closed.has(nid))continue;
    const cost=current.cost+edge.cost;if(cost>=(this.costs.get(nid)??Infinity)||!canTraverse(this.world,current.p,edge.p,edge.leap))continue;
    this.costs.set(nid,cost);this.parents.set(nid,id);this.points.set(nid,{...edge.p,leap:edge.leap});this.open.push({p:edge.p,cost,score:cost+this.heuristic(edge.p)});
   }
  }
  return this.result={ok:false,reason:this.expanded>=this.maxExpanded?'The route search reached its limit. Try calling me from closer by.':this.failure,expanded:this.expanded};
 }
}
export const approachGoal=(world,target)=>({isGoal:p=>nearPlayer(world,p,target),heuristic:p=>Math.max(0,horizontalDistance(p,target)-2)+Math.abs(p.y-target.y)});
export const pointGoal=(target,radius=.5)=>({isGoal:p=>horizontalDistance(p,target)<=radius&&Math.abs(p.y-target.y)<.6,heuristic:p=>Math.max(0,horizontalDistance(p,target)-radius)+Math.abs(p.y-target.y)});
export function findApproachPath(world,position,target,options={}){
 const search=new PathSearch(world,position,{...approachGoal(world,target),failure:'I cannot find a safe walking route to you. I will not dig or build a shortcut.',...options});
 return search.result??search.step();
}
// A path stays valid after nearby edits only if every remaining hop still simulates.
export function pathStillValid(world,path,from,index){
 let previous=from;
 for(let i=index;i<path.length;i++){const p=path[i];if(!standable(world,p)||!canTraverse(world,previous,p,p.leap))return false;previous=p;}
 return true;
}
