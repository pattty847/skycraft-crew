import { restoreInventory, BLOCK_COUNT } from './blocks.js';
import { LEGACY_SIZE, expandLegacyBlocks } from './world.js';
// The v1 device (localStorage) format. It is import-only in the shared world, and
// always holds the original 64×48×64 grid; loading embeds it in the current grid.
const KEY='codex-sky-block:world:1';
const LEGACY_VOLUME=LEGACY_SIZE.x*LEGACY_SIZE.y*LEGACY_SIZE.z;
export function legacyBlocks(world) {
 const blocks=new Array(LEGACY_VOLUME);
 for(let y=0;y<LEGACY_SIZE.y;y++)for(let z=0;z<LEGACY_SIZE.z;z++)for(let x=0;x<LEGACY_SIZE.x;x++)blocks[x+LEGACY_SIZE.x*(z+LEGACY_SIZE.z*y)]=world.get(x,y,z);
 return blocks;
}
export function saveGame(world,entity,phase,storage) {
 try {
  storage ??= localStorage;
  const data={version:1,seed:world.seed,blocks:legacyBlocks(world),inventory:Array.from(entity.inventory),selected:entity.selected,position:entity.position,phase};
  storage.setItem(KEY,JSON.stringify(data));return {ok:true};
 }catch(error){return {ok:false,message:'Could not save. Browser storage may be full or disabled.'};}
}
export function loadGame(storage) {
 try {
  storage ??= localStorage;
  const raw=storage.getItem(KEY);if(!raw)return {status:'new'};
  const d=JSON.parse(raw),finiteVector=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
  if(d.version!==1||!Number.isInteger(d.seed)||!Array.isArray(d.blocks)||d.blocks.length!==LEGACY_VOLUME||!d.blocks.every(n=>Number.isInteger(n)&&n>=0&&n<BLOCK_COUNT)||!Array.isArray(d.inventory)||![10,BLOCK_COUNT].includes(d.inventory.length)||!d.inventory.every(n=>Number.isInteger(n)&&n>=0&&n<=65535)||!Number.isInteger(d.selected)||d.selected<1||d.selected>=BLOCK_COUNT||!finiteVector(d.position)||!Number.isFinite(d.phase)||d.phase<0||d.phase>=1)throw new Error('Invalid save');
  if(d.position.x<0||d.position.x>=LEGACY_SIZE.x||d.position.z<0||d.position.z>=LEGACY_SIZE.z||d.position.y < -20||d.position.y>LEGACY_SIZE.y+20)throw new Error('Invalid position');
  const world=expandLegacyBlocks(d.blocks,d.seed);
  return {status:'loaded',world,inventory:restoreInventory(d.inventory),selected:d.selected,position:d.position,phase:d.phase};
 }catch(error){return {status:'error',message:'Your save could not be loaded. It is preserved; this temporary island will not autosave.'};}
}
