import { blockAccess, BLOCK_REACH } from '../../src/block-access.js';
import { overlapsBlock } from '../../src/physics.js';
import { BLOCKS, isPlant, B } from '../../src/blocks.js';
import { NavigateTask } from '../navigation/approach.js';
import { placementOrder } from './planner.js';
import { insideSandbox } from '../../src/world.js';
import { isCompanionId } from '../../src/presence.js';
import { NATURAL_PATH_FLOOR } from '../../src/path-plan.js';
const FACES=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const center=c=>({x:c.x+.5,y:c.y+.5,z:c.z+.5});
// Builds a checked plan block by block, only through entity.actions.placeBlock.
// Each step: pick the lowest supported unfinished cell (nearest first), make
// sure it can be placed from where the builder stands (else walk to a spot
// that can), place it, and confirm the world now holds exactly that block.
// A path order may also mine natural floor cells explicitly listed in replace.
export class BuildTask {
 constructor(room,entity,plan,{onProgress=()=>{},onChange=()=>{},timeout}={}){
  this.room=room;this.entity=entity;this.plan=plan;this.onProgress=onProgress;this.onChange=onChange;
  this.timeout=timeout??30+plan.cells.length*5;this.elapsed=0;this.result=null;this.state='next';
  this.walk=null;this.target=null;this.attempts=new Map();this.placed=[];this.wait=0;
 }
 get done(){return this.plan.cells.filter(c=>this.room.world.get(c.x,c.y,c.z)===c.id).length;}
 finish(ok,message){this.walk?.cancel();this.walk=null;this.entity.actions.move({x:0,y:0,z:0});this.result={ok,message,placed:this.placed};this.onChange(this);return this.result;}
 cancel(){if(!this.result)this.finish(false,`Building stopped after ${this.placed.length} block${this.placed.length===1?'':'s'}.`);}
 // Where the builder may stand: not inside a cell still waiting for its block.
 freeSpot(p){return !this.plan.cells.some(c=>this.room.world.get(c.x,c.y,c.z)!==c.id&&overlapsBlock(p,c));}
 canPlaceFrom(p,c){return this.freeSpot(p)&&!overlapsBlock(p,c)&&blockAccess(this.room.world,{position:p},c,true).ok;}
 // A standing spot for walking to: placement must also work a few centimetres off
 // it, because a body never stops exactly on a cell centre and a line of sight
 // that grazes a block's corner flips between clear and blocked.
 robustSpot(p,c){return [[0,0],[.03,0],[-.03,0],[0,.03],[0,-.03]].every(([dx,dz])=>this.canPlaceFrom({x:p.x+dx,y:p.y,z:p.z+dz},c));}
 next(){
  const world=this.room.world,e=this.entity,remaining=this.plan.cells.filter(c=>world.get(c.x,c.y,c.z)!==c.id);
  if(!remaining.length)return null;
  if(this.plan.blueprint==='path-to')return remaining[0];
  for(const c of remaining){const here=world.get(c.x,c.y,c.z);if(here)throw Error(`Something else (${BLOCKS[here].name.toLowerCase()}) appeared at (${c.x}, ${c.y}, ${c.z}). I stopped rather than break it.`);}
  const supported=remaining.filter(c=>FACES.some(([x,y,z])=>world.get(c.x+x,c.y+y,c.z+z)));
  if(!supported.length)throw Error('The rest of the plan has nothing to attach to any more.');
  // Recompute from the current world so blocks added or removed during a job
  // cannot make us choose a seat before the legs it depends on.
  const order=placementOrder(world,this.plan.cells);
  if(!order.ok)throw Error('The rest of the plan has nothing to attach to any more.');
  return order.order[0];
 }
 tick(dt){
  if(this.result)return;
  this.elapsed+=dt;const e=this.entity,world=this.room.world;
  if(this.elapsed>this.timeout){this.finish(false,`Out of time after placing ${this.placed.length} of ${this.plan.todo} blocks.`);return;}
  if(this.walk){
   this.walk.tick(dt);if(!this.walk.result)return;
   const walked=this.walk.result;this.walk=null;
   if(!walked.ok&&this.bump(this.target)){this.finish(false,`I could not reach a spot to place the block at (${this.target.x}, ${this.target.y}, ${this.target.z}): ${walked.message}`);return;}
   this.state='next';return;
  }
  if(this.state==='confirm'){
   const c=this.target;
   if(world.get(c.x,c.y,c.z)===c.id){this.placed.push({x:c.x,y:c.y,z:c.z,id:c.id});this.attempts.delete(this.key(c));this.onProgress(`Placed ${this.done}/${this.plan.cells.length}.`);this.onChange(this);this.state='next';return;}
   if((this.wait+=dt)<.1)return;
   if(this.bump(c)){this.finish(false,`The block at (${c.x}, ${c.y}, ${c.z}) would not go in. Is someone standing there?`);return;}
   this.state='next';return;
  }
  if(this.state==='breaking'){
   const c=this.target,id=world.get(c.x,c.y,c.z);
   if(!id){this.state='next';this.wait=0;return;}
   if(!NATURAL_PATH_FLOOR.has(id)||!this.room.simulation.canEdit(e,c,'break')){this.finish(false,'Path floor changed or became protected.');return;}
   if(!e.grounded)return;
   if(!blockAccess(world,e,c).ok){
    const goal=center(c);
    this.walk=new NavigateTask(this.room,e,{type:'custom',pos:goal,isGoal:p=>blockAccess(world,{position:p},c).ok,heuristic:p=>Math.max(0,Math.hypot(p.x-goal.x,p.y+1.4-goal.y,p.z-goal.z)-(BLOCK_REACH-1.5))},{timeout:25,maxExpanded:2500});return;
   }
   e.actions.lookAt(center(c));e.actions.breakBlock(c);return;
  }
  const clearing=(this.plan.clear??[]).find(c=>world.get(c.x,c.y,c.z));
  if(clearing){
   const id=world.get(clearing.x,clearing.y,clearing.z);
   if(!(isPlant(id)||id===B.LEAVES)||!this.room.simulation.canEdit(e,clearing,'break')){this.finish(false,'Path clearance became blocked or protected.');return;}
   this.target=clearing;
   if(!e.grounded)return;
   if(!blockAccess(world,e,clearing).ok){
    const goal=center(clearing);
    this.walk=new NavigateTask(this.room,e,{type:'custom',pos:goal,isGoal:p=>blockAccess(world,{position:p},clearing).ok,heuristic:p=>Math.max(0,Math.hypot(p.x-goal.x,p.y+1.4-goal.y,p.z-goal.z)-(BLOCK_REACH-1.5))},{timeout:25,maxExpanded:2500});return;
   }
   e.actions.lookAt(center(clearing));e.actions.breakBlock(clearing);return;
  }
  let c;try{c=this.next();}catch(error){this.finish(false,error.message);return;}
  if(!c){this.finish(true,`Built ${this.plan.label.toLowerCase()}: ${this.placed.length} block${this.placed.length===1?'':'s'} placed, every block matches the plan, nothing else changed.`);return;}
  const here=world.get(c.x,c.y,c.z),replacing=(this.plan.replace??[]).some(v=>this.key(v)===this.key(c));
  if(here){
   if(!replacing||!NATURAL_PATH_FLOOR.has(here)||!this.room.simulation.canEdit(e,c,'break')){this.finish(false,`Path floor changed or became protected at (${c.x}, ${c.y}, ${c.z}).`);return;}
   this.target=c;this.state='breaking';return;
  }
  if(!e.inventory[c.id]&&!(isCompanionId(e.id)&&insideSandbox(c.x,c.z))){this.finish(false,`I ran out of ${BLOCKS[c.id].name.toLowerCase()}.`);return;}
  this.target=c;
  if(!e.grounded)return;
  if(!this.canPlaceFrom(e.position,c)){
   const goal=center(c);
   this.walk=new NavigateTask(this.room,e,{type:'custom',pos:goal,
    isGoal:p=>this.robustSpot(p,c),
    heuristic:p=>Math.max(0,Math.hypot(p.x-goal.x,p.y+1.4-goal.y,p.z-goal.z)-(BLOCK_REACH-1.5))},{timeout:25,maxExpanded:2500});
   return;
  }
  // Someone in the way: wait a moment instead of failing straight away.
  if([...this.room.simulation.entities.values()].some(o=>overlapsBlock(o.position,c))){if((this.wait+=dt)>4&&this.bump(c))this.finish(false,`Someone is standing where the block at (${c.x}, ${c.y}, ${c.z}) goes.`);return;}
  e.actions.lookAt(center(c));e.actions.placeBlock({x:c.x,y:c.y,z:c.z},c.id);this.state='confirm';this.wait=0;
 }
 key(c){return `${c.x},${c.y},${c.z}`;}
 // Count a failed try for this cell; true once it has failed too often.
 bump(c){const n=(this.attempts.get(this.key(c))??0)+1;this.attempts.set(this.key(c),n);this.wait=0;return n>3;}
}
