import { randomUUID } from 'node:crypto';
import { isCompanionId } from '../src/presence.js';
export const contains=(claim,p)=>['x','y','z'].every(k=>p[k]>=claim.min[k]&&p[k]<=claim.max[k]);
const overlaps=(a,b)=>['x','y','z'].every(k=>a.min[k]<=b.max[k]&&b.min[k]<=a.max[k]);
const CREW_CLAIM={id:'crew-isle',ownerId:'crew',name:'Crew Isle',min:{x:50,y:7,z:86},max:{x:65,y:31,z:106},protectPlayers:true,allowCompanions:true};
export class Claims {
 constructor(room){
  this.room=room;this.items=[];
  room.extend('claims',{save:()=>this.items,load:data=>{if(!Array.isArray(data))throw Error('Invalid saved claims');this.items=data.map(c=>this.validate(c));},snapshot:()=>this.items});
  if(!this.items.some(c=>c.id===CREW_CLAIM.id)){
   const crew=this.validate(CREW_CLAIM);
   if(this.items.some(c=>overlaps(c,crew)))throw Error('Crew Isle overlaps an existing claim; move that claim before migration');
   this.items.push(crew);
  }
  const previous=room.simulation.canEdit;
  room.simulation.canEdit=(entity,pos,kind)=>previous(entity,pos,kind)&&this.items.every(c=>{
   if(!contains(c,pos))return true;
   if(isCompanionId(entity.id))return c.ownerId==='crew'||(kind==='place'&&c.allowCompanions);
   return c.ownerId===entity.id||(!c.protectPlayers&&c.ownerId!=='crew');
  });
 }
 validate(c){
  if(!c||typeof c.id!=='string'||typeof c.ownerId!=='string'||typeof c.name!=='string'||c.name.length<1||c.name.length>40||typeof c.protectPlayers!=='boolean')throw Error('Invalid claim');
  for(const p of [c.min,c.max])if(!p||!['x','y','z'].every(k=>Number.isInteger(p[k]))||!this.room.world.inside(p.x,p.y,p.z))throw Error('Claim corners must be blocks inside the world');
  if(!['x','y','z'].every(k=>c.min[k]<=c.max[k]&&c.max[k]-c.min[k]<32))throw Error('Each claim side must be 1–32 blocks');
  if(c.allowCompanions!==undefined&&typeof c.allowCompanions!=='boolean')throw Error('Invalid companion claim permission');
  return {id:c.id,ownerId:c.ownerId,name:c.name,min:{...c.min},max:{...c.max},protectPlayers:c.protectPlayers,allowCompanions:c.allowCompanions===true};
 }
 receive(entity,message){
  if(message.operation==='remove'){
   const c=this.items.find(c=>c.id===message.id);if(!c||c.ownerId!==entity.id)throw Error('Only the owner can remove this claim');
   this.items=this.items.filter(item=>item!==c);
   this.room.trace?.('claim.deleted',{who:entity.id,claim:c.id,msg:`Claim deleted: ${c.name}`});
  }else if(message.operation==='authorize'){
   const c=this.items.find(c=>c.id===message.id);
   if(!c||c.ownerId!==entity.id||c.ownerId==='crew'||typeof message.allowCompanions!=='boolean')throw Error('Only the claim owner can change companion access');
   c.allowCompanions=message.allowCompanions;
   this.room.trace?.('claim.authorized',{who:entity.id,claim:c.id,allowCompanions:c.allowCompanions,msg:`Claim ${c.name}: companions ${c.allowCompanions?'allowed':'denied'}`});
  }else if(message.operation==='create'){
   if(this.items.filter(c=>c.ownerId===entity.id).length>=8||this.items.length>=128)throw Error('Claim limit reached');
   const c=this.validate({...message,id:randomUUID(),ownerId:entity.id,allowCompanions:false});
   if(this.items.some(other=>overlaps(c,other)))throw Error('This area overlaps an existing claim');
   // A player can claim nearby builds, not reserve distant islands from spawn.
   for(const p of [c.min,c.max])if(Math.hypot(p.x+.5-entity.position.x,p.y+.5-entity.position.y,p.z+.5-entity.position.z)>40)throw Error('Move closer to the area you want to protect');
   this.items.push(c);
   this.room.trace?.('claim.created',{who:entity.id,claim:c.id,name:c.name,min:c.min,max:c.max,msg:`Claim created: ${c.name}`});
  }else throw Error('Unknown claim operation');
  this.room.markDirty?.();this.room.sendAll({type:'claims',claims:this.items});
 }
}
