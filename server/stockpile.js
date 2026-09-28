import { BLOCK_COUNT } from '../src/blocks.js';
import { GIVE_REACH } from '../src/simulation.js';

export const STOCKPILE_POSITION=Object.freeze({x:56.5,y:20,z:96.5});

export class Stockpile {
 constructor(room){
  this.room=room;this.items=new Uint16Array(BLOCK_COUNT);
  room.extend('stockpile',{
   save:()=>Array.from(this.items),
   load:data=>{
    if(!Array.isArray(data)||data.length>BLOCK_COUNT||!data.every(n=>Number.isInteger(n)&&n>=0&&n<=65535))throw Error('Invalid saved stockpile');
    this.items.set(data);
   },
   snapshot:()=>({position:STOCKPILE_POSITION,items:Array.from(this.items)})
  });
  room.simulation.stockpileTransfer=(entity,type,id,count)=>this.transfer(entity,type,id,count);
 }
 transfer(entity,type,id,count){
  const result={type:'stockpile-result',action:type,blockId:id,count,ok:false};
  const p=entity.position,q=STOCKPILE_POSITION;
  let reason='invalid';
  if(['deposit','withdraw'].includes(type)&&Number.isInteger(id)&&id>0&&id<BLOCK_COUNT&&Number.isInteger(count)&&count>0&&count<=64){
   reason='reach';if(Math.hypot(p.x-q.x,p.z-q.z)<=GIVE_REACH&&Math.abs(p.y-q.y)<=1.5){
   const from=type==='deposit'?entity.inventory:this.items,to=type==='deposit'?this.items:entity.inventory;
   reason='inventory';
   if(from[id]>=count&&to[id]+count<=65535){
    from[id]-=count;to[id]+=count;this.room.simulation.inventoryRevision++;
    this.room.simulation.onChange();this.room.markDirty?.();
    this.room.sendAll({type:'stockpile',stockpile:this.room.extensionSnapshots().stockpile});
    result.ok=true;
    if(type==='deposit')this.room.missions?.deposit(entity.id,id,count);
   }
   }
  }
  if(!result.ok)this.room.simulation.refuse(entity,type,null,reason);
  for(const [socket,client] of this.room.clients)if(client.entity===entity&&socket.readyState===1)socket.send(JSON.stringify(result));
  return result.ok;
 }
}
