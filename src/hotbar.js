import { BLOCK_COUNT } from './blocks.js';
// A Minecraft-style hotbar: nine slots that hold item ids, drawn from the full inventory
// (the Bag). New items fill an empty slot; a stack that runs out keeps its slot, greyed,
// until a new item needs the room. Only the browser keeps this layout (per player, per
// device); the server still only knows what you hold (entity.selected).
export const HOTBAR_SIZE=9;
export class Hotbar {
 constructor(storage,key){
  this.storage=storage;this.key=key;this.index=0;this.slots=new Array(HOTBAR_SIZE).fill(0);
  try{const saved=JSON.parse(storage?.getItem(key)??'null');if(Array.isArray(saved?.slots)){saved.slots.slice(0,HOTBAR_SIZE).forEach((id,i)=>{if(Number.isInteger(id)&&id>=0&&id<BLOCK_COUNT)this.slots[i]=id;});this.index=Number.isInteger(saved.index)&&saved.index>=0&&saved.index<HOTBAR_SIZE?saved.index:0;}}catch{}
 }
 save(){try{this.storage?.setItem(this.key,JSON.stringify({slots:this.slots,index:this.index}));}catch{}}
 // Place items the player carries that are not on the hotbar yet. Returns true if anything moved.
 sync(inventory){
  let changed=false;
  for(let id=1;id<BLOCK_COUNT;id++){
   if(!inventory[id]||this.slots.includes(id))continue;
   let i=this.slots.indexOf(0);if(i<0)i=this.slots.findIndex(s=>!inventory[s]);
   if(i<0)break;this.slots[i]=id;changed=true;
  }
  if(changed)this.save();return changed;
 }
 // Put an item in a slot; if it already sits elsewhere, the two slots swap.
 assign(i,id){
  const from=this.slots.indexOf(id);if(from>=0)this.slots[from]=this.slots[i];
  this.slots[i]=id;this.save();
 }
 select(i){this.index=((i%HOTBAR_SIZE)+HOTBAR_SIZE)%HOTBAR_SIZE;this.save();}
 // The id to hold for the selected slot. An empty slot means empty hands: an id you have none of.
 held(inventory){
  const id=this.slots[this.index];if(id)return id;
  for(let other=1;other<BLOCK_COUNT;other++)if(!inventory[other])return other;
  return 1;
 }
}
