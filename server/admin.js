import { BLOCKS, BLOCK_COUNT } from '../src/blocks.js';
import { PERSONAS } from '../src/presence.js';
export const GRANT_MAX=64;
// Admin "god mode": put items nobody had into someone's inventory (yours, a companion's
// or another player's). Only players listed in SKY_ADMINS may, and the server checks
// every field. A World line says who received what, so companions know where it came from.
export function grant(room,access,admin,{targetId,blockId,count}={}){
 if(!access.isAdmin(admin.id)){room.trace('admin.refused',{level:'warn',who:admin.id,msg:`${admin.id.slice(0,8)} tried an admin grant`});throw Error('Only island admins can do that.');}
 if(!Number.isInteger(blockId)||blockId<1||blockId>=BLOCK_COUNT||!BLOCKS[blockId]||BLOCKS[blockId].kind==='air')throw Error('Choose an item to grant.');
 if(!Number.isInteger(count)||count<1||count>GRANT_MAX)throw Error(`Grant 1–${GRANT_MAX} at a time.`);
 const target=room.simulation.entities.get(typeof targetId==='string'&&targetId?targetId:admin.id);
 if(!target)throw Error('That player is not here.');
 const added=Math.min(count,65535-target.inventory[blockId]);if(added<1)throw Error('They cannot carry any more of that.');
 target.inventory[blockId]+=added;room.simulation.inventoryRevision++;room.simulation.onChange?.();room.markDirty?.();
 const item=BLOCKS[blockId].name,name=Object.values(PERSONAS).find(p=>p.id===target.id)?.name??(target.id===admin.id?`Player ${admin.id.slice(0,4)}`:`Player ${target.id.slice(0,4)}`);
 room.trace('admin.grant',{who:admin.id,targetId:target.id,blockId,count:added,msg:`${admin.id.slice(0,8)} granted ${added} ${item} to ${target.id.slice(0,8)}`});
 room.chat?.add('action','World',`${name} received ${added} ${item} from Player ${admin.id.slice(0,4)} (admin grant).`);
 return {added,item,name};
}

// Creative mode for an admin's own character: blocks break almost at once (any block, any
// tool) and placing does not use up the stack. It lasts until switched off or the server restarts.
export function setCreative(room,access,admin,on){
 if(!access.isAdmin(admin.id)){room.trace('admin.refused',{level:'warn',who:admin.id,msg:`${admin.id.slice(0,8)} tried creative mode`});throw Error('Only island admins can do that.');}
 admin.creative=on===true;admin.breaking=null;
 room.trace('admin.creative',{who:admin.id,on:admin.creative,msg:`${admin.id.slice(0,8)} creative ${admin.creative?'on':'off'}`});
 return admin.creative;
}
