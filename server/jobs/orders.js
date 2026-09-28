import { planBuild } from '../building/planner.js';
import { blockAccess } from '../../src/block-access.js';
import { PathSearch, standable } from '../navigation/pathfinder.js';
import { BLOCK_COUNT, isSolid } from '../../src/blocks.js';
import { isCompanionId } from '../../src/presence.js';
import { performance } from 'node:perf_hooks';
import { planPath } from '../../src/path-plan.js';
import { B } from '../../src/blocks.js';
import { placementOrder } from '../building/planner.js';
const key=p=>`${p.x},${p.y},${p.z}`;
const OPEN=new Set(['open','running','waiting']);
const validPoint=p=>p&&['x','y','z'].every(k=>Number.isInteger(p[k]));
export class BuildOrders {
 constructor(room){this.room=room;this.items=[];this.cellIndex=new Map();this.attempts=new Map();this.cooldown=3000;this.reachBudgetMs=15;room.extend('orders',{save:()=>this.items,load:data=>{if(!Array.isArray(data))throw Error('Invalid saved orders');this.items=data;this.reindex();},snapshot:()=>this.view()});}
 job(o){return this.room.jobs?.find(o.jobId);}
 active(o){return OPEN.has(this.job(o)?.status??o.status);}
 view(){return this.items.filter(o=>this.active(o)).map(o=>{const j=this.job(o),placed=o.cells.filter(c=>this.room.world.get(c.x,c.y,c.z)===c.id).length;return {id:o.id,jobId:o.jobId,blueprint:o.blueprint,label:o.label,params:o.params,anchor:o.anchor,facing:o.facing,from:o.from,to:o.to,cells:o.cells,clear:o.clear,replace:o.replace??[],ownerId:o.ownerId,assignee:j?.assignee??null,status:j?.status??o.status,placed,total:o.cells.length};});}
 // Keep open orders and only the last 20 finished ones (outcomes stay on the job board).
 prune(){const done=this.items.filter(o=>!this.active(o));if(done.length>20)this.items=this.items.filter(o=>this.active(o)||done.slice(-20).includes(o));}
 reindex(){this.cellIndex.clear();for(const o of this.items)if(this.active(o))for(const c of o.cells){const k=key(c),set=this.cellIndex.get(k)??new Set();set.add(o);this.cellIndex.set(k,set);}}
 changed(){this.prune();this.reindex();this.room.markDirty?.();this.room.sendAll({type:'orders',orders:this.view()});}
 cellChanged(pos){for(const o of this.cellIndex.get(key(pos))??[]){const placed=o.cells.filter(c=>this.room.world.get(c.x,c.y,c.z)===c.id).length;this.room.sendAll({type:'order-progress',id:o.id,placed});}}
 post(player,message){
  // One attempt per player every 3 s, failures included: planning runs path searches.
  const now=Date.now(),last=this.attempts.get(player.id)??0;
  if(now-last<this.cooldown)throw Error('Wait a moment before placing another build order.');
  this.attempts.set(player.id,now);if(this.attempts.size>256)this.attempts.clear();
  try{return this.create(player,message);}catch(error){this.room.trace('order.refused',{level:'warn',who:player.id,reason:error.message,msg:`Build order refused: ${error.message}`});if(message.blueprint==='path-to')this.room.trace('path.refused',{level:'warn',who:player.id,reason:error.message,msg:`Walkway refused: ${error.message}`});throw error;}
 }
 create(player,{blueprint,params={},anchor,facing,from,to}){
  if(!this.room.jobs)throw Error('The job board is unavailable.');
  const isPath=blueprint==='path-to';
  if(typeof blueprint!=='string'||blueprint.length>80||!(isPath?validPoint(from)&&validPoint(to):validPoint(anchor))||!params||typeof params!=='object'||Array.isArray(params))throw Error(isPath?'Mark two whole-block path endpoints.':'Choose a blueprint, params object and a whole-block anchor.');
  if(isPath)anchor=from;
  const distance=p=>Math.hypot(p.x+.5-player.position.x,p.y+.5-player.position.y,p.z+.5-player.position.z);
  if(Math.min(distance(anchor),isPath?distance(to):Infinity)>32)throw Error('Move within 32 blocks of the build site.');
  const open=this.items.filter(o=>this.active(o));if(open.length>=8||open.filter(o=>o.ownerId===player.id).length>=3)throw Error('Open build order limit reached.');
  const sources=[...this.room.simulation.entities.values()].filter(e=>isCompanionId(e.id)).sort((a,b)=>Math.hypot(a.position.x-anchor.x,a.position.z-anchor.z)-Math.hypot(b.position.x-anchor.x,b.position.z-anchor.z));
  const source=sources[0];if(!source)throw Error('The crew is unavailable.');
  const builder={...source,inventory:new Uint16Array(BLOCK_COUNT).fill(65535)};
  let plan;
  if(isPath){
   if(Object.keys(params).some(k=>k!=='width'))throw Error('Path only accepts width.');
   const route=planPath(this.room.world,from,to,{width:params.width??1,canEdit:(p,action)=>this.room.simulation.canEdit(builder,p,action)});
   if(!route.ok)throw Error(route.reason);
   const placement=placementOrder(this.room.world,route.cells);if(!placement.ok)throw Error('Path blocks have no support from the start.');
   const todo=route.cells.filter(c=>this.room.world.get(c.x,c.y,c.z)!==c.id);
   plan={blueprint,label:'Walkway',anchor:{...from},from:{...from},to:{...to},params:{width:route.width},cells:route.cells,clear:route.clear,replace:route.replace,placement:placement.order,todo:todo.length,need:{[B.PLANKS]:todo.length},length:route.length};
   this.room.trace('path.planned',{who:player.id,from,to,length:route.length,cells:route.cells.length,replaced:route.replace.length,bridged:route.cells.filter(c=>!isSolid(this.room.world.get(c.x,c.y,c.z))).length,msg:`Planned ${route.length}-cell walkway`});
  }else plan=planBuild(this.room,builder,{blueprint,params,anchor,facing},{checkInventory:false});
  if(!plan.todo)throw Error('Those blocks are already built.');
  const occupied=new Set(open.flatMap(o=>[...o.cells,...(o.clear??[]),...(o.replace??[])].map(key)));
  if([...plan.cells,...plan.clear,...(plan.replace??[])].some(c=>occupied.has(key(c))))throw Error('This order overlaps another open order.');
  // At least one unfilled cell must have a safe, reachable placement spot.
  const clearing=plan.clear.find(c=>this.room.world.get(c.x,c.y,c.z));
  const target=clearing??plan.cells.find(c=>this.room.world.get(c.x,c.y,c.z)!==c.id);
  const breaking=!clearing&&(plan.replace??[]).some(c=>key(c)===key(target));
  const goal={isGoal:p=>standable(this.room.world,p)&&blockAccess(this.room.world,{position:p},target,!clearing&&!breaking).ok,heuristic:p=>Math.max(0,Math.hypot(p.x-target.x-.5,p.y-target.y,p.z-target.z-.5)-4)};
  const deadline=performance.now()+this.reachBudgetMs;
  let reachable=false,pending=false;for(const companion of sources){const search=new PathSearch(this.room.world,companion.position,{...goal,maxExpanded:3000});let found=search.result;while(!found&&performance.now()<deadline)found=search.step({budgetMs:Math.max(0,deadline-performance.now()),maxExpansions:300});if(!found){pending=true;break;}if(found.ok){reachable=true;break;}}
  if(pending){this.room.trace('order.reachability-pending',{who:player.id,level:'warn',msg:'Build order route check exceeded its time budget'});throw Error('The crew route check took too long. Try another site.');}
  if(!reachable)throw Error('The crew cannot reach a standing spot for this build.');
  const label=`Build ${plan.label} for Player ${player.id.slice(0,4)}`;
  const job=this.room.jobs.post({kind:'build',spec:{fixedPlan:plan},label,postedBy:'player',requesterId:player.id});
  const order={id:job.id,jobId:job.id,blueprint,label:plan.label,params:plan.params,anchor:{...anchor},facing,from:isPath?{...from}:undefined,to:isPath?{...to}:undefined,cells:plan.cells,clear:plan.clear,replace:plan.replace??[],ownerId:player.id,status:'open'};
  this.items.push(order);this.room.trace('order.posted',{who:player.id,order:order.id,job:job.id,blueprint,cells:plan.cells.length,msg:`Build order posted: ${label}`});this.changed();return order;
 }
 cancel(player,id){const o=this.items.find(x=>x.id===id),job=o&&this.job(o);if(!o||!job||!this.active(o))throw Error('No open build order with that ID.');if(o.ownerId!==player.id&&this.room.access?.isGuest(player.id))throw Error('Only the owner or a member can cancel this order.');
  this.room.foreman?.cancel(job);this.room.jobs.update(job,{status:'cancelled',result:'Cancelled by player'});o.status='cancelled';this.room.trace('order.cancelled',{who:player.id,order:id,msg:`Cancelled build order ${id}`});this.changed();}
}
