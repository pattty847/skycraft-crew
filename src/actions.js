// The only control surface for every Entity. No world, renderer, DOM, or physics imports.
// Controllers (human, future agent, remote) submit intents; Simulation owns authority.
import { BLOCK_COUNT } from './blocks.js';
import { recipeFor } from './recipes.js';
const vector = value => {
  if (!value || !['x','y','z'].every(k => Number.isFinite(value[k]))) throw new TypeError('Expected a finite {x, y, z} vector');
  return {x:value.x,y:value.y,z:value.z};
};
const blockPosition = value => {
  const p=vector(value);
  if(!Object.values(p).every(Number.isInteger))throw new TypeError('Block positions must be integers');
  return p;
};
export function createActions(entityId, emit) {
  const send=(type,payload={})=>emit(Object.freeze({entityId,type,...payload}));
  return Object.freeze({
    move(dir) { send('move',{dir:vector(dir)}); },
    emote(name) { if(name!==null&&!['wave','nod'].includes(name))throw new TypeError('Unknown emote');send('emote',{name}); },
    pointAt(pos) { send('pointAt',{pos:blockPosition(pos)}); },
    jump() { send('jump'); },
    lookAt(target) { send('lookAt',{target:vector(target)}); },
    breakBlock(pos) { send('breakBlock',{pos:blockPosition(pos)}); },
    placeBlock(pos,blockId) {
      if(!Number.isInteger(blockId)||blockId<1||blockId>=BLOCK_COUNT)throw new TypeError('Unknown block id');
      send('placeBlock',{pos:blockPosition(pos),blockId});
    },
    // Crafting runs as an intent too: Simulation checks the recipe and inventory.
    // Recipes: 'planks' (1 wood → 4 planks), or a block id with a material recipe.
    craft(recipe) {
      if(!recipeFor(recipe))throw new TypeError('Unknown recipe');
      send('craft',{recipe});
    },
    give(targetId,blockId,count) {
      if(typeof targetId!=='string'||!targetId)throw new TypeError('Give needs a target entity');
      if(!Number.isInteger(blockId)||blockId<1||blockId>=BLOCK_COUNT)throw new TypeError('Unknown block id');
      if(!Number.isInteger(count)||count<1||count>64)throw new TypeError('Give 1–64 items');
      send('give',{targetId,blockId,count});
    },
    deposit(blockId,count) { stockpile('deposit',blockId,count); },
    withdraw(blockId,count) { stockpile('withdraw',blockId,count); },
    say(text) { if(typeof text!=='string')throw new TypeError('Speech must be text');send('say',{text:text.slice(0,180)}); },
  });
  function stockpile(type,blockId,count){
    if(!Number.isInteger(blockId)||blockId<1||blockId>=BLOCK_COUNT)throw new TypeError('Unknown block id');
    if(!Number.isInteger(count)||count<1||count>64)throw new TypeError('Transfer 1–64 items');
    send(type,{blockId,count});
  }
}
