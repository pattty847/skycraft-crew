// Kind is the inventory/render/physics contract: solid, plant, or a future item.
export const BLOCKS = Object.freeze([
  { id: 0, name: 'Air', kind: 'air', hardness: 0, drops: 0, texture: 0 },
  { id: 1, name: 'Grass', hardness: 0.5, drops: 1, texture: 0, side: 1, bottom: 2 },
  { id: 2, name: 'Dirt', hardness: 0.4, drops: 2, texture: 2 },
  { id: 3, name: 'Stone', hardness: 1.5, drops: 3, texture: 3 },
  { id: 4, name: 'Sand', hardness: 0.4, drops: 4, texture: 4 },
  { id: 5, name: 'Wood', hardness: 1.1, drops: 5, texture: 5, side: 6 },
  { id: 6, name: 'Leaves', hardness: 0.25, drops: 6, texture: 7 },
  { id: 7, name: 'Coal ore', hardness: 2, drops: 7, texture: 8 },
  { id: 8, name: 'Iron ore', hardness: 2.6, drops: 8, texture: 9 },
  { id: 9, name: 'Planks', hardness: 0.8, drops: 9, texture: 10 },
  { id: 10, name: 'Clay', hardness: 0.6, drops: 10, texture: 11 },
  { id: 11, name: 'Lamp', hardness: 0.7, drops: 11, texture: 12 },
  { id: 12, name: 'Sapling', kind: 'plant', hardness: 0, drops: 12, texture: 13 },
  { id: 13, name: 'Red mushroom', kind: 'plant', hardness: 0, drops: 13, texture: 14 },
  { id: 14, name: 'Brown mushroom', kind: 'plant', hardness: 0, drops: 14, texture: 15 },
  { id: 15, name: 'Yellow flower', kind: 'plant', hardness: 0, drops: 15, texture: 16 },
  { id: 16, name: 'White flower', kind: 'plant', hardness: 0, drops: 16, texture: 17 },
  { id: 17, name: 'Stick', kind: 'item', texture: 18 },
  { id: 18, name: 'Wooden pickaxe', kind: 'item', texture: 19 },
  { id: 19, name: 'Stone pickaxe', kind: 'item', texture: 20 },
  { id: 20, name: 'Iron pickaxe', kind: 'item', texture: 21 },
  { id: 21, name: 'Iron ingot', kind: 'item', texture: 22 },
  { id: 22, name: 'Crafting table', hardness: 0.8, drops: 22, texture: 23 },
  { id: 23, name: 'Furnace', hardness: 1.5, drops: 23, texture: 24 },
  { id: 24, name: 'Torch', kind: 'plant', hardness: 0, drops: 24, texture: 25 },
  { id: 25, name: 'Lantern', hardness: 0.7, drops: 25, texture: 26 },
].map(block => Object.freeze({ kind: 'solid', ...block })));
export const BLOCK_COUNT = BLOCKS.length;
// Expand persisted inventories when new block ids land; retain existing stacks.
export function restoreInventory(values){
 if(!Array.isArray(values)||values.length>BLOCK_COUNT||!values.every(n=>Number.isInteger(n)&&n>=0&&n<=65535))throw Error('Invalid saved inventory');
 const inventory=new Uint16Array(BLOCK_COUNT);inventory.set(values);return inventory;
}
export const B = Object.freeze({ AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6, COAL: 7, IRON: 8, PLANKS: 9, CLAY: 10, LAMP: 11, SAPLING: 12, RED_MUSHROOM: 13, BROWN_MUSHROOM: 14, YELLOW_FLOWER: 15, WHITE_FLOWER: 16, STICK:17, WOOD_PICKAXE:18, STONE_PICKAXE:19, IRON_PICKAXE:20, IRON_INGOT:21, TABLE:22, FURNACE:23, TORCH:24, LANTERN:25 });
export const isSolid = id => BLOCKS[id]?.kind === 'solid';
export const isPlant = id => BLOCKS[id]?.kind === 'plant';
export function textureFor(id, normal) {
  const b = BLOCKS[id];
  return normal[1] === -1 ? (b.bottom ?? b.texture) : normal[1] === 1 ? b.texture : (b.side ?? b.texture);
}
