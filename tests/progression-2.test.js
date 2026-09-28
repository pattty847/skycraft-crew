import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { B, BLOCKS, restoreInventory } from '../src/blocks.js';
import { RECIPES, canCraft, RECIPE_LIST } from '../src/recipes.js';
import { heldTool } from '../src/tools.js';
import { createLampLights } from '../src/lamp-lights.js';
import { MineTripTask } from '../server/tasks/mine-trip.js';

function setup(id='player'){const world=new World();for(let x=30;x<41;x++)for(let z=35;z<44;z++)world.set(x,22,z,B.STONE);const sim=new Simulation(world),e=sim.spawn(id);e.position={x:34.5,y:23,z:39.5};return {world,sim,e};}
function mine(sim,e,pos,seconds){for(let i=0;i<Math.ceil(seconds*60);i++){e.actions.breakBlock(pos);sim.tick(1/60);}}
test('each recipe applies at its declared station and reports missing materials or station',()=>{
 const {world,sim,e}=setup();world.set(35,23,39,B.TABLE);world.set(36,23,39,B.FURNACE);
 assert.equal(RECIPE_LIST.length,Object.keys(RECIPES).length);
 for(const [key,recipe] of Object.entries(RECIPES)){
  e.inventory.fill(0);for(const [id,n] of recipe.inputs)e.inventory[id]=n;
  const station=recipe.station;if(station){e.position={x:40.5,y:23,z:39.5};assert.match(canCraft(world,e,key).reason,/within 4 blocks/);assert.equal(sim.craft(e,key),false);e.position={x:34.5,y:23,z:39.5};}
  assert.equal(canCraft(world,e,key).ok,true,key);assert.equal(sim.craft(e,key),true,key);assert.equal(e.inventory[recipe.output],recipe.count,key);
  for(const [id] of recipe.inputs)if(id!==recipe.output)assert.equal(e.inventory[id],0,key);
  assert.equal(sim.craft(e,key),false,key);assert.match(sim.notice,/Need/);
 }
});
test('items are inventory only; old inventory indices and stacks survive expansion',()=>{
 const {sim,e,world}=setup();const old=Array.from({length:17},(_,id)=>id);const restored=restoreInventory(old);assert.equal(restored.length,BLOCKS.length);assert.deepEqual(Array.from(restored.slice(0,17)),old);
 for(const id of [B.STICK,B.WOOD_PICKAXE,B.STONE_PICKAXE,B.IRON_PICKAXE,B.IRON_INGOT]){e.inventory[id]=1;assert.equal(sim.place(e,{x:35,y:23,z:39},id),false);assert.equal(world.get(35,23,39),0);assert.equal(e.inventory[id],1);}
});
test('iron needs stone or iron pickaxe; hands retain stone and coal speed',()=>{
 const {sim,e,world}=setup(),p={x:35,y:23,z:39};world.set(p.x,p.y,p.z,B.IRON);mine(sim,e,p,3);assert.equal(world.get(p.x,p.y,p.z),B.IRON);assert.match(sim.notice,/stone pickaxe/);
 e.inventory[B.WOOD_PICKAXE]=1;e.selected=B.WOOD_PICKAXE;mine(sim,e,p,3);assert.equal(world.get(p.x,p.y,p.z),B.IRON);
 e.inventory[B.STONE_PICKAXE]=1;e.selected=B.STONE_PICKAXE;mine(sim,e,p,.9);assert.equal(world.get(p.x,p.y,p.z),0);
 for(const id of [B.STONE,B.COAL]){world.set(p.x,p.y,p.z,id);e.selected=B.PLANKS;mine(sim,e,p,BLOCKS[id].hardness-.15);assert.equal(world.get(p.x,p.y,p.z),id);mine(sim,e,p,.2);assert.equal(world.get(p.x,p.y,p.z),0);}
});
test('pickaxe tiers accelerate ore and companions use their best carried tool',()=>{
 const expected=[[B.WOOD_PICKAXE,2],[B.STONE_PICKAXE,3],[B.IRON_PICKAXE,4.5]];
 for(const [tool,speed] of expected){const {sim,e,world}=setup(),p={x:35,y:23,z:39};world.set(p.x,p.y,p.z,B.COAL);e.inventory[tool]=1;e.selected=tool;mine(sim,e,p,2/speed+.03);assert.equal(world.get(p.x,p.y,p.z),0,`tool ${tool}`);}
 const {sim,e,world}=setup('codex-companion');e.inventory[B.WOOD_PICKAXE]=1;e.inventory[B.STONE_PICKAXE]=1;e.inventory[B.IRON_PICKAXE]=1;assert.equal(heldTool(e),B.IRON_PICKAXE);const p={x:35,y:23,z:39};world.set(p.x,p.y,p.z,B.IRON);mine(sim,e,p,.6);assert.equal(world.get(p.x,p.y,p.z),0);
});
test('iron trip without a pickaxe reports the needed tier',()=>{
 const {world,sim,e}=setup('codex-companion');sim.spawn('player');const room={world,simulation:sim};const task=new MineTripTask(room,e,{requesterId:'player',blockId:B.IRON,count:1});task.tick(1/60);assert.match(task.result.message,/stone pickaxe/);assert.equal(task.result.ok,false);
});
test('torch and lantern allocate bounded lights with different radii',()=>{
 const {world}=setup(),scene={lights:[],add(light){this.lights.push(light);}};world.set(35,23,39,B.TORCH);world.set(36,23,39,B.LANTERN);const lighting=createLampLights(scene,world);lighting.update({x:34,y:23,z:39},1);assert.equal(scene.lights.filter(l=>l.intensity>0).length,2);assert.equal(scene.lights.length,6);assert.deepEqual(scene.lights.slice(0,2).map(l=>l.distance),[6,12]);
});
test('new craft and iron refusal paths leave concise trace records',()=>{
 const {world,sim,e}=setup(),events=[];sim.trace=(type,fields)=>events.push({type,...fields});
 e.inventory[B.STICK]=1;assert.equal(sim.craft(e,'woodenPickaxe'),false);assert.match(events.at(-1).reason,/crafting table/);assert.equal(events.at(-1).level,'warn');
 world.set(35,23,39,B.TABLE);assert.equal(sim.craft(e,'woodenPickaxe'),false);assert.match(events.at(-1).reason,/stick/);
 e.inventory[B.PLANKS]=3;e.inventory[B.STICK]=2;assert.equal(sim.craft(e,'woodenPickaxe'),true);assert.equal(events.at(-1).type,'edit.craft');assert.equal(events.at(-1).recipe,'woodenPickaxe');
 world.set(35,23,39,B.IRON);e.actions.breakBlock({x:35,y:23,z:39});sim.tick(1/60);assert.equal(events.at(-1).type,'edit.refused');assert.match(events.at(-1).reason,/stone pickaxe/);
});
