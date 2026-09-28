import { B, BLOCKS } from './blocks.js';
import { SIZE } from './world.js';

// Shared recipe data. Both browser requests and Entity craft actions resolve
// here; Simulation alone applies an accepted recipe to inventory.
const recipe=(output,count,inputs,station=null)=>Object.freeze({output,count,inputs:Object.freeze(inputs.map(input=>Object.freeze(input))),station});
export const RECIPES=Object.freeze({
 planks:recipe(B.PLANKS,4,[[B.WOOD,1]]),
 [B.CLAY]:recipe(B.CLAY,4,[[B.DIRT,2],[B.SAND,1]]),
 [B.LAMP]:recipe(B.LAMP,1,[[B.COAL,1],[B.PLANKS,1]]),
 sticks:recipe(B.STICK,4,[[B.PLANKS,2]]),
 table:recipe(B.TABLE,1,[[B.PLANKS,4]]),
 torches:recipe(B.TORCH,4,[[B.COAL,1],[B.STICK,1]]),
 woodenPickaxe:recipe(B.WOOD_PICKAXE,1,[[B.PLANKS,3],[B.STICK,2]],'table'),
 stonePickaxe:recipe(B.STONE_PICKAXE,1,[[B.STONE,3],[B.STICK,2]],'table'),
 ironPickaxe:recipe(B.IRON_PICKAXE,1,[[B.IRON_INGOT,3],[B.STICK,2]],'table'),
 furnace:recipe(B.FURNACE,1,[[B.STONE,8]],'table'),
 lantern:recipe(B.LANTERN,1,[[B.IRON_INGOT,1],[B.TORCH,1]],'table'),
 ironIngot:recipe(B.IRON_INGOT,1,[[B.IRON,1],[B.COAL,1]],'furnace'),
});
export const RECIPE_LIST=Object.freeze(Object.entries(RECIPES).map(([key,value])=>Object.freeze({key,...value})));
export const recipeFor=key=>Object.hasOwn(RECIPES,key)?RECIPES[key]:null;
export const STATION_REACH=4;
export function stationInReach(world,entity,station){
 const id=station==='table'?B.TABLE:station==='furnace'?B.FURNACE:0;
 if(!id)return true;
 const p=entity.position,r=STATION_REACH;
 for(let x=Math.max(0,Math.floor(p.x-r));x<=Math.min(SIZE.x-1,Math.ceil(p.x+r));x++)
  for(let y=Math.max(0,Math.floor(p.y-r));y<=Math.min(SIZE.y-1,Math.ceil(p.y+r));y++)
   for(let z=Math.max(0,Math.floor(p.z-r));z<=Math.min(SIZE.z-1,Math.ceil(p.z+r));z++)
    if(world.get(x,y,z)===id&&Math.hypot(x+.5-p.x,y+.5-(p.y+1),z+.5-p.z)<=r)return true;
 return false;
}
export function canCraft(world,entity,key){
 const recipe=recipeFor(key);
 if(!recipe)return {ok:false,reason:'Unknown recipe.'};
 if(recipe.station&&!stationInReach(world,entity,recipe.station))return {ok:false,reason:`Need a ${recipe.station==='table'?'crafting table':'furnace'} within 4 blocks.`,station:recipe.station};
 const missing=recipe.inputs.filter(([id,count])=>entity.inventory[id]<count).map(([id,count])=>`${count-entity.inventory[id]} ${BLOCKS[id].name.toLowerCase()}`);
 if(missing.length)return {ok:false,reason:`Need ${missing.join(', ')}.`,missing};
 if(entity.inventory[recipe.output]+recipe.count>65535)return {ok:false,reason:'Output stack is full.'};
 return {ok:true,reason:null};
}
