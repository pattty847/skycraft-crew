import test from 'node:test';
import assert from 'node:assert/strict';
import { B } from '../src/blocks.js';
import { RECIPES,recipeFor } from '../src/recipes.js';
import { tempRoom,join } from './helpers.js';
test('browser recipes and Entity craft actions consume the same recipe table',t=>{
 const room=tempRoom(t,{prefix:'sky-recipes-'}),{socket:s,entity:player}=join(room),bot=room.simulation.spawn('codex-companion');
 assert.deepEqual(Object.keys(RECIPES).sort(),['10','11','furnace','ironIngot','ironPickaxe','lantern','planks','sticks','stonePickaxe','table','torches','woodenPickaxe']);
 assert.equal(recipeFor(B.CLAY).count,4);
 bot.inventory[B.WOOD]=1;bot.actions.craft('planks');room.tick(1/60);
 assert.equal(bot.inventory[B.WOOD],0);assert.equal(bot.inventory[B.PLANKS],28);
 player.inventory[B.DIRT]=2;player.inventory[B.SAND]=1;
 room.receive(s,{type:'craft-material',blockId:B.CLAY});
 assert.equal(player.inventory[B.CLAY],4);assert.equal(player.inventory[B.DIRT],0);assert.equal(player.inventory[B.SAND],0);
 player.inventory[B.COAL]=1;room.receive(s,{type:'craft-material',blockId:B.LAMP});
 assert.equal(player.inventory[B.LAMP],1);assert.equal(player.inventory[B.COAL],0);assert.equal(player.inventory[B.PLANKS],23);
 const before=player.inventory.slice();room.receive(s,{type:'craft-material',blockId:99});assert.deepEqual(player.inventory,before);
 assert.throws(()=>bot.actions.craft(99),/Unknown recipe/);
});
