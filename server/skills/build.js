import { randomUUID } from 'node:crypto';
import { BLUEPRINTS, FACINGS, catalog, compactCatalog, checkParams } from '../building/blueprints.js';
import { planBuild, planStairsTo } from '../building/planner.js';
import { BuildTask } from '../building/build-task.js';
import { buildBoard } from '../building/board.js';
import { findStructures } from '../building/structures.js';
const same=(a,b)=>['x','y','z'].every(k=>a[k]===b[k]);
const cardinal=d=>Math.abs(d.x)>=Math.abs(d.z)?(d.x>=0?'east':'west'):(d.z>=0?'south':'north');
const rejection='That build was not accepted. No blocks changed.';
function visible(pos,observation,what){
 if(!pos||!['x','y','z'].every(k=>Number.isInteger(pos[k]))||!observation.pointableBlocks?.some(b=>same(b.pos,pos)))throw Error(`The ${what} must be a block from observation.pointableBlocks. No blocks changed.`);
 return {x:pos.x,y:pos.y,z:pos.z};
}
// A task that has already failed, so the controller can hand the reason back to the model.
const refused=message=>({result:{ok:false,retry:true,message},tick(){},cancel(){}});
// The structure the model named, found again now (the world may have changed
// since the observation), then the nearest roof edge that stairs can reach.
function stairsToStructure(room,builder,named,near){
 const overlaps=s=>s.min.x<=named.to.x&&s.max.x>=named.from.x&&s.min.z<=named.to.z&&s.max.z>=named.from.z&&s.min.y<=named.to.y&&s.max.y>=named.from.y;
 const structure=findStructures(room.world,builder.position,24).find(overlaps);
 if(!structure)throw Error('I cannot see that building any more.');
 if(!structure.roof.length)throw Error('That building has no roof to stand on.');
 const edge=structure.roof.filter(c=>[[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>!room.world.get(c.x+x,c.y,c.z+z)));
 const byDistance=(edge.length?edge:structure.roof).slice().sort((a,b)=>Math.hypot(a.x-near.x,a.z-near.z)-Math.hypot(b.x-near.x,b.z-near.z));
 let last;
 for(const cell of byDistance.slice(0,8)){try{return {...planStairsTo(room,builder,cell,{near,from:near}),label:'Stairs'};}catch(error){last=error;}}
 throw Error(`I could not fit stairs up to that roof. ${last?.message??''}`.trim());
}
// Terrain is rarely flat: rest a "near" anchor on the ground within two blocks.
function settle(world,a){for(const dy of [0,-1,1,-2,2])if(!world.get(a.x,a.y+dy,a.z)&&world.get(a.x,a.y+dy-1,a.z))return {...a,y:a.y+dy};return a;}
// Resolve a validated build action into a checked plan for one builder. `player`
// only needs position and direction (a job keeps a snapshot of the requester's).
export function planFor(room,entity,action,player){
 if(action.blueprint==='stairs-to'&&action.structure)return stairsToStructure(room,entity,action.structure,player.position);
 if(action.blueprint==='stairs-to')return planStairsTo(room,entity,action.target,{near:player.position,from:player.position});
 const p=player.position;
 if(action.near)return nearestSpot(room,entity,action,player);
 const anchor={...action.on,y:action.on.y+1};
 const facing=action.facing??cardinal({x:anchor.x+.5-p.x,z:anchor.z+.5-p.z});
 return planBuild(room,entity,{blueprint:action.blueprint,anchor,facing,params:action.params});
}
// "Near me": two blocks ahead of the player if that works, otherwise the nearest
// spot around them (up to four blocks out) where the whole plan checks out. The
// first refusal is reported if nothing fits, since it names the real obstacle.
function nearestSpot(room,entity,action,player){
 const p=player.position,ahead=cardinal(player.direction),f=FACINGS[ahead],base={x:Math.floor(p.x),y:Math.round(p.y),z:Math.floor(p.z)};
 const spots=[{x:base.x+f.x*2,z:base.z+f.z*2,facing:ahead}];
 for(let r=2;r<=4;r++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)if(Math.max(Math.abs(dx),Math.abs(dz))===r)spots.push({x:base.x+dx,z:base.z+dz,facing:cardinal({x:dx,z:dz})});
 let first;
 for(const spot of spots){
  const anchor=settle(room.world,{x:spot.x,y:base.y,z:spot.z});
  try{return planBuild(room,entity,{blueprint:action.blueprint,anchor,facing:action.facing??spot.facing,params:action.params});}
  catch(error){if(/Not enough materials/.test(error.message))throw error;first??=error;}
 }
 throw first;
}
export default {
 name:'build',types:['build'],modes:['build','auto'],requester:true,followUp:true,verb:'build',needs:['pointableBlocks','structures','claims'],
 mode:{key:'build',label:'Build',order:15,
  intro:name=>`Build · ${name} places checked plans; inside the Sandbox, companions need no supplies.`,
  policy:'Mode: BUILD. Build and craft requests are allowed; for other requests action is null.',rejection},
 prompt:{auto:`To build, action is {"type":"build","blueprint":NAME,"near":"requester" or "on":{x,y,z} from pointableBlocks,"facing":"north"|"east"|"south"|"west","params":{...}}. Blueprints: ${compactCatalog()}. Saved blueprint keys appear in observation.blueprints. Stairs onto a building: {"type":"build","blueprint":"stairs-to","structure":ID from observation.structures}. Blocks come from your inventory; the server checks space, support, protection and materials and tells you if a build is refused.`,
  build:`To build, action is {"type":"build","blueprint":NAME,"on":{"x":integer,"y":integer,"z":integer},"facing":"north"|"east"|"south"|"west","params":{...}}. "on" is a block from observation.pointableBlocks; the build starts on top of it. Instead of "on" you may use "near":"requester" to build two blocks in front of the requesting player. facing is the direction the build runs or faces (optional; by default away from the requester). For stairs up onto a building's roof, use {"type":"build","blueprint":"stairs-to","structure":ID} with an id from observation.structures (player-made builds; "building" kind is usually the house or shelter they mean); the game picks the best roof edge, side and number of steps. For stairs onto any other ledge, use "target":{x,y,z}, the block to climb onto, from observation.pointableBlocks. Blueprints: ${catalog()} Saved blueprint keys and labels appear in observation.blueprints and can also be used by build or plan. The server checks space, headroom, support, protection and your inventory before placing anything; you place only from your own inventory (observation.inventory). If a build is refused you get the reason and may try another spot or blueprint.`},
 validate(a,observation){
  if(a.blueprint==='stairs-to'&&a.structure!==undefined){
   const s=observation.structures?.find(x=>x.id===a.structure);if(!s)throw Error('The structure must be an id from observation.structures. No blocks changed.');
   return {type:'build',blueprint:'stairs-to',structure:{id:s.id,from:s.from,to:s.to}};
  }
  if(a.blueprint==='stairs-to')return {type:'build',blueprint:'stairs-to',target:visible(a.target,observation,'target')};
  if(!BLUEPRINTS[a.blueprint]&&!observation.blueprints?.some(b=>b.key===a.blueprint))throw Error(`Unknown blueprint. Choose one of: ${Object.keys(BLUEPRINTS).join(', ')}, or a saved blueprint key.`);
  if(a.facing!==undefined&&!FACINGS[a.facing])throw Error('Facing must be north, east, south or west.');
  if(!BLUEPRINTS[a.blueprint]&&a.params&&Object.keys(a.params).length)throw Error('Saved blueprints have no parameters.');
  const params=BLUEPRINTS[a.blueprint]?checkParams(a.blueprint,a.params&&typeof a.params==='object'?a.params:{}):{};
  const place=a.near==='requester'?{near:'requester'}:{on:visible(a.on,observation,'"on" block')};
  return {type:'build',blueprint:a.blueprint,...place,...(a.facing?{facing:a.facing}:{}),params};
 },
 announce:({room,name,action})=>({status:`${name} is planning a ${action.blueprint==='stairs-to'?'staircase':(room.blueprints?.get(action.blueprint)??BLUEPRINTS[action.blueprint]).label.toLowerCase()}…`}),
 start({room,entity,player,action,name,progress,receipt}){
  let plan;
  try{plan=planFor(room,entity,action,player);}catch(error){return refused(error.message);}
  const board=buildBoard(room),id=randomUUID();
  receipt?.(`${name} is building ${plan.label.toLowerCase()} (${plan.todo} block${plan.todo===1?'':'s'}) at (${plan.anchor.x}, ${plan.anchor.y}, ${plan.anchor.z}) facing ${plan.facing}. Allowed edits: placing exactly these blocks from ${name}’s inventory.`);
  board.start(id,entity.id,plan);
  return new BuildTask(room,entity,plan,{onProgress:progress,onChange:task=>{if(task.result)board.end(id);}});
 },
};
