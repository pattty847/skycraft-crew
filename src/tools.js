import { B } from './blocks.js';
import { isCompanionId } from './presence.js';

export const PICKAXE_SPEED=Object.freeze({[B.WOOD_PICKAXE]:2,[B.STONE_PICKAXE]:3,[B.IRON_PICKAXE]:4.5});
export function heldTool(entity){
 if(isCompanionId(entity.id))return [B.IRON_PICKAXE,B.STONE_PICKAXE,B.WOOD_PICKAXE].find(id=>entity.inventory[id])??null;
 return entity.inventory[entity.selected]&&PICKAXE_SPEED[entity.selected]?entity.selected:null;
}
export function canMine(entity,blockId){return blockId!==B.IRON||[B.STONE_PICKAXE,B.IRON_PICKAXE].includes(heldTool(entity));}
export function miningSpeed(entity,blockId){return [B.STONE,B.COAL,B.IRON].includes(blockId)?PICKAXE_SPEED[heldTool(entity)]??1:1;}
