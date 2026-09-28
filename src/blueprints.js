import { B } from './blocks.js';
// Blueprints describe a build in local coordinates: x to the builder's right,
// y up, z forward (the facing). (0,0,0) is the anchor cell, the lowest layer.
// blocks(params) lists the solid cells; clear(params) lists cells that must stay
// air, such as headroom above stairs. Blueprints never ask for a block to be
// broken: a cell that already holds something else stops the plan.
// Lookup tables keyed by untrusted names have no prototype, so 'constructor' or '__proto__' are simply unknown.
const table=entries=>Object.freeze(Object.assign(Object.create(null),entries));
export const FACINGS=table({north:{x:0,z:-1},east:{x:1,z:0},south:{x:0,z:1},west:{x:-1,z:0}});
const across=width=>width===1?[0]:width===2?[0,1]:[-1,0,1];
const int=(value,{min,max,default:fallback})=>{const n=value??fallback;if(!Number.isInteger(n)||n<min||n>max)throw Error(`must be a whole number from ${min} to ${max}`);return n;};
export const BLUEPRINTS=table({
 stairs:{label:'Stairs',summary:'A one-block-per-step staircase climbing in the facing direction. Walkable by players and companions.',
  params:{height:{min:1,max:8,default:3},width:{min:1,max:3,default:1}},
  blocks({height,width}){const cells=[];for(const x of across(width))for(let i=0;i<height;i++){cells.push({x,y:i,z:i,id:B.PLANKS});if(i)cells.push({x,y:i-1,z:i,id:B.PLANKS});}return cells;},
  // Room to stand on each step and jump to the next one.
  clear({height,width}){const cells=[];for(const x of across(width))for(let i=0;i<height;i++)for(let h=1;h<=3;h++)cells.push({x,y:i+h,z:i});return cells;}},
 path:{label:'Plank path',summary:'A flat plank walkway going forward from the anchor, also across gaps (it is built out from its own end).',
  params:{length:{min:2,max:16,default:6},width:{min:1,max:3,default:1}},
  blocks({length,width}){const cells=[];for(let z=0;z<length;z++)for(const x of across(width))cells.push({x,y:0,z,id:B.PLANKS});return cells;},
  clear({length,width}){const cells=[];for(let z=0;z<length;z++)for(const x of across(width))for(let h=1;h<=2;h++)cells.push({x,y:h,z});return cells;}},
 bench:{label:'Bench',summary:'A three-wide plank seat on two wood legs.',params:{},
  blocks(){return [{x:-1,y:0,z:0,id:B.WOOD},{x:1,y:0,z:0,id:B.WOOD},{x:-1,y:1,z:0,id:B.PLANKS},{x:0,y:1,z:0,id:B.PLANKS},{x:1,y:1,z:0,id:B.PLANKS}];},
  clear(){return [{x:0,y:0,z:0}];}},
 arch:{label:'Arch',summary:'A gateway: two wood pillars and a plank lintel you can walk under.',params:{height:{min:2,max:5,default:3}},
  blocks({height}){const cells=[];for(let y=0;y<height;y++)cells.push({x:-1,y,z:0,id:B.WOOD},{x:1,y,z:0,id:B.WOOD});for(const x of [-1,0,1])cells.push({x,y:height,z:0,id:B.PLANKS});return cells;},
  clear({height}){const cells=[];for(let y=0;y<height;y++)cells.push({x:0,y,z:0});return cells;}},
 fence:{label:'Fence',summary:'Wood posts every other block joined by a plank rail, running forward.',params:{length:{min:2,max:12,default:5}},
  blocks({length}){const cells=[];for(let z=0;z<length;z++){if(z%2===0)cells.push({x:0,y:0,z,id:B.WOOD},{x:0,y:1,z,id:B.WOOD});else cells.push({x:0,y:1,z,id:B.PLANKS});}return cells;},
  clear(){return [];}},
 planter:{label:'Planter',summary:'A 3×3 plank box with soil and a leafy bush in the middle.',params:{},
  blocks(){const cells=[];for(const x of [-1,0,1])for(const z of [0,1,2])cells.push({x,y:0,z,id:x===0&&z===1?B.DIRT:B.PLANKS});cells.push({x:0,y:1,z:1,id:B.LEAVES});return cells;},
  clear(){return [];}},
});
export function checkParams(name,params={}){
 const blueprint=BLUEPRINTS[name];if(!blueprint)throw Error(`Unknown blueprint ${name}.`);
 const checked={};
 for(const [key,range] of Object.entries(blueprint.params)){try{checked[key]=int(params[key],range);}catch(error){throw Error(`${blueprint.label} ${key} ${error.message}.`);}}
 return checked;
}
// Local (x,y,z) to world, for an anchor cell and a facing.
export function toWorld(anchor,facing,p){
 const f=FACINGS[facing],right={x:-f.z,z:f.x};
 return {x:anchor.x+p.x*right.x+p.z*f.x,y:anchor.y+p.y,z:anchor.z+p.x*right.z+p.z*f.z};
}
export function materials(cells){const need={};for(const c of cells)need[c.id]=(need[c.id]??0)+1;return need;}
// One line per blueprint for the model's policy text.
export function catalog(){
 return Object.entries(BLUEPRINTS).map(([name,b])=>{
  const params=Object.entries(b.params).map(([k,r])=>`${k} ${r.min}-${r.max} (default ${r.default})`).join(', ');
  const need=materials(b.blocks(Object.fromEntries(Object.entries(b.params).map(([k,r])=>[k,r.default]))));
  return `${name}: ${b.summary}${params?` Params: ${params}.`:''} Default materials: ${Object.entries(need).map(([id,n])=>`${n} ${id==B.PLANKS?'planks':id==B.WOOD?'wood':id==B.DIRT?'dirt':id==B.LEAVES?'leaves':'block '+id}`).join(', ')}.`;
 }).join(' ');
}
// One short line for all blueprints (Auto mode): names and parameter ranges only.
export function compactCatalog(){
 return Object.entries(BLUEPRINTS).map(([name,b])=>{const params=Object.entries(b.params).map(([k,r])=>`${k} ${r.min}-${r.max}`).join(', ');return params?`${name} (${params})`:name;}).join('; ');
}
// Browser ghost and server plans use the same pure cell transform. Saved catalog
// entries carry their local blocks; built-in shapes come from BLUEPRINTS.
export function previewCells(catalogEntry,anchor,facing,params={}){
 const builtin=BLUEPRINTS[catalogEntry.key];
 const blocks=builtin?builtin.blocks(checkParams(catalogEntry.key,params)):catalogEntry.blocks;
 if(!FACINGS[facing]||!Array.isArray(blocks))throw Error('Invalid blueprint preview');
 return blocks.map(p=>({...toWorld(anchor,facing,p),id:p.id}));
}
