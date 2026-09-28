import { randomUUID } from 'node:crypto';
import { BLOCKS } from '../../src/blocks.js';
import { BLUEPRINTS } from '../../src/blueprints.js';
const validName=name=>typeof name==='string'&&name.trim().length>=1&&name.trim().length<=40;
export class BlueprintLibrary {
 constructor(room){
  this.room=room;this.saved=[];
  room.extend('blueprints',{save:()=>this.saved,load:data=>{if(!Array.isArray(data))throw Error('Invalid saved blueprints');this.saved=data;},snapshot:()=>this.catalog()});
 }
 get(key){
  if(BLUEPRINTS[key])return BLUEPRINTS[key];
  const saved=this.saved.find(b=>b.key===key);if(!saved)return null;
  return {label:saved.label,summary:saved.summary,params:{},blocks:()=>saved.blocks,clear:()=>[]};
 }
 checkParams(key,params={}){if(!this.get(key))throw Error('Unknown blueprint');if(params&&Object.keys(params).length)throw Error('This blueprint has no parameters.');return {};}
 catalog(){return [...Object.entries(BLUEPRINTS).map(([key,b])=>({key,label:b.label,summary:b.summary,params:b.params,kind:'built-in'})),...this.saved.map(({key,label,summary,ownerId,blocks})=>({key,label,summary,params:{},kind:'player',ownerId,blocks}))];}
 changed(){this.room.sendAll({type:'blueprints',blueprints:this.catalog()});this.room.markDirty?.();}
 save(entity,{claimId,name}){
  if(!validName(name))throw Error('Blueprint name must be 1–40 characters.');
  const claim=this.room.claims.items.find(c=>c.id===claimId);
  if(!claim||claim.ownerId!==entity.id&&this.room.access?.isGuest(entity.id))throw Error('Only the claim owner or a member can save this claim.');
  const size={x:claim.max.x-claim.min.x+1,y:claim.max.y-claim.min.y+1,z:claim.max.z-claim.min.z+1};
  if(size.x>16||size.y>12||size.z>16)throw Error('Blueprint claim must fit within 16×12×16.');
  if(this.saved.length>=64||this.saved.filter(b=>b.ownerId===entity.id).length>=16)throw Error('Blueprint limit reached.');
  const label=name.trim();if(this.saved.some(b=>b.label.toLowerCase()===label.toLowerCase()&&b.ownerId===entity.id))throw Error('You already saved a blueprint with that name.');
  const blocks=[];
  for(let x=claim.min.x;x<=claim.max.x;x++)for(let y=claim.min.y;y<=claim.max.y;y++)for(let z=claim.min.z;z<=claim.max.z;z++){
   const id=this.room.world.get(x,y,z);if(id&&BLOCKS[id]?.kind==='solid')blocks.push({x:x-claim.min.x,y:y-claim.min.y,z:claim.min.z-z,id});
  }
  if(!blocks.length||blocks.length>512)throw Error('A blueprint needs 1–512 solid blocks.');
  const entry={key:`player:${randomUUID().slice(0,12)}`,label,summary:`Saved from ${claim.name}; ${blocks.length} blocks.`,ownerId:entity.id,blocks};
  this.saved.push(entry);this.room.trace('blueprint.saved',{who:entity.id,blueprint:entry.key,claim:claim.id,cells:blocks.length,msg:`Saved blueprint ${label} (${blocks.length} blocks)`});this.changed();return entry;
 }
 delete(entity,key){const b=this.saved.find(b=>b.key===key);if(!b||b.ownerId!==entity.id)throw Error('Only the blueprint owner can delete it.');this.saved=this.saved.filter(x=>x!==b);this.room.trace('blueprint.deleted',{who:entity.id,blueprint:key,msg:`Deleted blueprint ${b.label}`});this.changed();}
}
