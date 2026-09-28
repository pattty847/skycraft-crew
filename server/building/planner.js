import { BLOCKS, isSolid } from '../../src/blocks.js';
import { BLUEPRINTS, FACINGS, checkParams, materials, toWorld } from './blueprints.js';
import { PathSearch, pointGoal } from '../navigation/pathfinder.js';
import { insideSandbox } from '../../src/world.js';
import { isCompanionId } from '../../src/presence.js';
const FACES=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const key=p=>`${p.x},${p.y},${p.z}`;
const names=id=>BLOCKS[id]?.name.toLowerCase()??`block ${id}`;
// Place order: a block can only go where it touches something solid (the
// Simulation's support rule). Breadth-first from cells that already touch the
// world, lowest layer first, reaches every cell of a buildable plan. A cell
// never reached would float, so the plan is refused before anything is placed.
export function placementOrder(world,cells){
 const pending=new Map(cells.map(c=>[key(c),c])),placed=new Set(),order=[];
 const solid=p=>placed.has(key(p))||isSolid(world.get(p.x,p.y,p.z));
 for(const c of cells)if(world.get(c.x,c.y,c.z)===c.id){pending.delete(key(c));placed.add(key(c));}
 while(pending.size){
  const ready=[...pending.values()].filter(c=>FACES.some(([x,y,z])=>solid({x:c.x+x,y:c.y+y,z:c.z+z})));
  if(!ready.length)return {ok:false,floating:[...pending.values()]};
  ready.sort((a,b)=>a.y-b.y);const layer=ready.filter(c=>c.y===ready[0].y);
  for(const c of layer){pending.delete(key(c));placed.add(key(c));order.push(c);}
 }
 return {ok:true,order};
}
// Turn a blueprint into a checked world plan for one builder. Throws an Error
// whose message is safe to show the player (and the model, as feedback).
export function planBuild(room,builder,{blueprint,anchor,facing,params},{checkInventory=true}={}){
 const b=room.blueprints?.get(blueprint)??BLUEPRINTS[blueprint];if(!b)throw Error(`I do not know how to build “${blueprint}”.`);
 if(!FACINGS[facing])throw Error('Facing must be north, east, south or west.');
 const checked=b===BLUEPRINTS[blueprint]?checkParams(blueprint,params):room.blueprints.checkParams(blueprint,params),world=room.world,simulation=room.simulation;
 const cells=b.blocks(checked).map(p=>({...toWorld(anchor,facing,p),id:p.id})),clear=b.clear(checked).map(p=>toWorld(anchor,facing,p));
 for(const c of [...cells,...clear])if(!world.inside(c.x,c.y,c.z))throw Error(`That ${b.label.toLowerCase()} would go outside the world.`);
 for(const c of cells){const here=world.get(c.x,c.y,c.z);if(here&&here!==c.id)throw Error(`${names(here)} is in the way at (${c.x}, ${c.y}, ${c.z}). I never break blocks to build.`);}
 for(const c of clear){const here=world.get(c.x,c.y,c.z);if(here)throw Error(`${names(here)} at (${c.x}, ${c.y}, ${c.z}) blocks the headroom this ${b.label.toLowerCase()} needs.`);}
 for(const c of cells)if(simulation.canEdit&&!simulation.canEdit(builder,c,'place'))throw Error(`(${c.x}, ${c.y}, ${c.z}) is protected. I will not build there.`);
 const todo=cells.filter(c=>world.get(c.x,c.y,c.z)!==c.id),need=materials(todo);
 const short=Object.entries(need).filter(([id,n])=>builder.inventory[id]<n).map(([id,n])=>`${n} ${names(+id)} (I have ${builder.inventory[id]})`);
 if(checkInventory&&short.length&&!(isCompanionId(builder.id)&&cells.length&&cells.every(c=>insideSandbox(c.x,c.z))))throw Error(`Not enough materials: I need ${short.join(' and ')}.`);
 const order=placementOrder(world,cells);
 if(!order.ok){const f=order.floating[0];throw Error(`Part of that ${b.label.toLowerCase()} would float at (${f.x}, ${f.y}, ${f.z}); it needs something to attach to.`);}
 return {blueprint,label:b.label,anchor:{...anchor},facing,params:checked,cells,clear,placement:order.order,todo:todo.length,need};
}
// Stairs that finish level with `target` and right next to it, so you can
// step off the top onto it (a roof, a ledge, a platform). Tries all four
// sides and keeps the valid plan with the fewest steps, nearest the requester.
export function planStairsTo(room,builder,target,{near=builder.position,width=1,from=null}={}){
 const world=room.world,tries=[],errors=[];
 if(from&&reachableAfter(world,{cells:[]},from,target))throw Error(`You can already walk up to (${target.x}, ${target.y}, ${target.z}); no stairs needed.`);
 for(const [facing,f] of Object.entries(FACINGS)){
  // Walk down and away from the target until a step would rest on solid ground.
  let k=0,top={x:target.x-f.x,y:target.y,z:target.z-f.z};
  for(;k<8;k++){
   const c={x:top.x-f.x*k,y:top.y-k,z:top.z-f.z*k};
   if(!world.inside(c.x,c.y,c.z)||world.get(c.x,c.y,c.z))break;
   if(world.get(c.x,c.y-1,c.z)){k++;break;}
  }
  const bottom={x:top.x-f.x*(k-1),y:top.y-(k-1),z:top.z-f.z*(k-1)};
  // The top step must sit in open air beside the target, whose top must be free to stand on.
  if(k>=1&&(world.get(top.x,top.y,top.z)||world.get(target.x,target.y+1,target.z)||world.get(target.x,target.y+2,target.z))){errors.push(`${facing}: no room beside the target`);continue;}
  if(k<1||!world.get(bottom.x,bottom.y-1,bottom.z)){errors.push(`${facing}: no ground within 8 steps`);continue;}
  try{const plan=planBuild(room,builder,{blueprint:'stairs',anchor:bottom,facing,params:{height:k,width}});tries.push({plan,score:k*10+Math.hypot(bottom.x+.5-near.x,bottom.z+.5-near.z)});}
  catch(error){errors.push(`${facing}: ${error.message}`);}
 }
 if(!tries.length)throw Error(`I could not fit stairs up to (${target.x}, ${target.y}, ${target.z}). ${errors[0]??''}`.trim());
 tries.sort((a,b)=>a.score-b.score);
 // With a requester, only a staircase they could then walk up counts, and none is needed if they already can.
 const useful=from?tries.find(t=>reachableAfter(world,t.plan,from,target)):tries[0];
 if(!useful)throw Error(`Stairs would fit next to (${target.x}, ${target.y}, ${target.z}), but you still could not walk up from where you are.`);
 return {...useful.plan,label:'Stairs',target:{...target}};
}

// The world as it would be with a plan built, without touching the real one.
// Navigation only reads get/inside, so it can walk this overlay directly.
export function withPlan(world,cells){
 const planned=new Map(cells.map(c=>[`${c.x},${c.y},${c.z}`,c.id]));
 return {inside:(x,y,z)=>world.inside(x,y,z),get:(x,y,z)=>planned.get(`${x},${y},${z}`)??world.get(x,y,z)};
}
// Would a player standing at `from` be able to walk onto the top of `target`
// once `plan` is built? This is the check that makes stairs actually useful.
export function reachableAfter(world,plan,from,target,{maxExpanded=2500}={}){
 const search=new PathSearch(withPlan(world,plan.cells),from,{...pointGoal({x:target.x+.5,y:target.y+1,z:target.z+.5},.6),maxExpanded});
 return (search.result??search.step()).ok;
}
