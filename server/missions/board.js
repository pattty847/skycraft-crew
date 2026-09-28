import { randomUUID } from 'node:crypto';
import { BLOCK_COUNT } from '../../src/blocks.js';

const ACTIVE=new Set(['open','accepted']);
const validStack=stack=>stack&&Object.getPrototypeOf(stack)===Object.prototype&&Object.keys(stack).sort().join(',')==='blockId,count'&&Number.isInteger(stack.blockId)&&stack.blockId>0&&stack.blockId<BLOCK_COUNT&&Number.isInteger(stack.count)&&stack.count>=1&&stack.count<=64;
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{8,36}$/.test(id);

// A mission owns its reward until a verified receipt or order outcome settles it.
export class MissionBoard {
 constructor(room,{now=()=>Date.now()}={}){
  this.room=room;this.now=now;this.items=[];
  room.extend('missions',{save:()=>this.items,load:data=>{if(!Array.isArray(data)||data.length>1000)throw Error('Invalid saved missions');this.items=data;},snapshot:()=>this.view()});
 }
 prune(){const finished=this.items.filter(m=>!ACTIVE.has(m.status)&&!m.escrow);const keep=new Set(finished.slice(-40));this.items=this.items.filter(m=>ACTIVE.has(m.status)||m.escrow||keep.has(m));}
 view(){return this.items.filter(m=>ACTIVE.has(m.status)).concat(this.items.filter(m=>!ACTIVE.has(m.status)).slice(-12)).map(m=>({id:m.id,title:m.title,postedBy:m.postedBy,objective:m.objective,reward:m.reward,status:m.status,progress:m.progress,acceptedBy:m.acceptedBy??null,expires:m.expires,postedAt:m.postedAt,escrow:m.escrow,payouts:m.payouts??[]}));}
 changed(){this.room.sendAll({type:'missions',missions:this.view()});this.room.markDirty?.();}
 refuse(who,error){this.room.trace('mission.refused',{level:'warn',who,reason:error.message,msg:`Mission refused: ${error.message}`});throw error;}
 playerInventory(id){
  const live=this.room.simulation.entities.get(id);
  if(live)return live.inventory;
  for(const state of this.room.players.values())if(state.id===id)return state.inventory;
  return null;
 }
 credit(id,blockId,count){
  const inventory=this.playerInventory(id);if(!inventory)return 0;
  const paid=Math.min(count,65535-(inventory[blockId]??0));
  if(paid){inventory[blockId]=(inventory[blockId]??0)+paid;this.room.simulation.inventoryRevision++;this.room.simulation.onChange();}
  return paid;
 }
 settle(m,shares,type){
  const payouts=[];for(const [who,count] of shares){const paid=this.credit(who,m.reward.blockId,count);payouts.push({who,count:paid,pending:count-paid});}
  m.payouts=payouts;m.escrow=payouts.reduce((n,p)=>n+p.pending,0);
  this.room.trace(type,{who:m.postedBy,mission:m.id,blockId:m.reward.blockId,payouts,msg:`Mission ${m.id} ${m.status}`});
  this.prune();
  this.changed();
 }
 retryPayouts(id){
  for(const m of this.items)if(m.escrow&&m.payouts?.some(p=>p.who===id&&p.pending)){
   for(const p of m.payouts)if(p.who===id&&p.pending){const paid=this.credit(id,m.reward.blockId,p.pending);p.count+=paid;p.pending-=paid;m.escrow-=paid;if(paid)this.room.trace('mission.paid',{who:id,mission:m.id,blockId:m.reward.blockId,count:paid,msg:`Paid ${paid} escrowed items from mission ${m.id}`});}
   this.changed();
  }
 }
 post(player,message){
  try{
   if(this.room.access?.isGuest(player.id))throw Error('Only members can post missions.');
   if(!message||Object.getPrototypeOf(message)!==Object.prototype)throw Error('Invalid mission.');
   if(Object.keys(message).sort().join(',')!=='hours,objective,reward,title,type')throw Error('Invalid mission fields.');
   const {title,objective,reward,hours}=message;
   if(typeof title!=='string'||title.trim().length<1||title.length>80||/[\x00-\x1f]/.test(title))throw Error('Use a title of 1–80 characters.');
   if(!Number.isInteger(hours)||hours<1||hours>72)throw Error('Expiry must be 1–72 whole hours.');
   if(!validStack(reward))throw Error('Choose 1–64 reward items.');
   if(!objective||Object.getPrototypeOf(objective)!==Object.prototype)throw Error('Invalid objective.');
   let goal;
   if(objective.type==='deliver'&&Object.keys(objective).sort().join(',')==='blockId,count,type'&&validStack({blockId:objective.blockId,count:objective.count}))goal={type:'deliver',blockId:objective.blockId,count:objective.count};
   else if(objective.type==='build'&&Object.keys(objective).sort().join(',')==='orderId,type'&&validId(objective.orderId)){
    const order=this.room.orders?.items.find(o=>o.id===objective.orderId);
    if(!order||!this.room.orders.active(order))throw Error('Choose an open build order.');
    goal={type:'build',orderId:order.id};
   }else throw Error('Choose a valid delivery or open build order.');
   this.expire();
   const active=this.items.filter(m=>ACTIVE.has(m.status));
   if(active.length>=12||active.filter(m=>m.postedBy===player.id).length>=3)throw Error('Open mission limit reached.');
   if(player.inventory[reward.blockId]<reward.count)throw Error('Not enough reward items.');
   player.inventory[reward.blockId]-=reward.count;this.room.simulation.inventoryRevision++;this.room.simulation.onChange();
   const now=this.now(),m={id:randomUUID(),title:title.trim(),postedBy:player.id,objective:goal,reward:{...reward},status:'open',progress:{count:0,contributors:[]},expires:now+hours*3600e3,postedAt:now,escrow:reward.count};
   this.items.push(m);this.room.trace('mission.posted',{who:player.id,mission:m.id,objective:goal,reward:m.reward,expires:m.expires,msg:`Mission posted: ${m.title}`});this.changed();return m;
  }catch(error){this.refuse(player?.id,error);}
 }
 cancel(player,id){
  try{const m=this.items.find(m=>m.id===id);if(!validId(id)||!m||!ACTIVE.has(m.status))throw Error('No open mission with that ID.');if(m.postedBy!==player.id)throw Error('Only the poster can cancel this mission.');m.status='cancelled';this.settle(m,[[m.postedBy,m.escrow]],'mission.cancelled');return m;}catch(error){this.refuse(player?.id,error);}
 }
 accept(player,id){
  try{const m=this.items.find(m=>m.id===id);if(!validId(id)||!m||!ACTIVE.has(m.status))throw Error('No open mission with that ID.');m.status='accepted';m.acceptedBy=player.id;this.room.trace('mission.accepted',{who:player.id,mission:id,msg:`Accepted mission ${id}`});this.changed();return m;}catch(error){this.refuse(player?.id,error);}
 }
 expire(){
  for(const m of this.items)if(ACTIVE.has(m.status)&&m.expires<=this.now()){m.status='expired';this.settle(m,[[m.postedBy,m.escrow]],'mission.expired');}
 }
 tick(){
  this.expire();
  if(this.now()<(this.nextRetry??0))return;
  this.nextRetry=this.now()+1000;
  const owed=new Set(this.items.flatMap(m=>m.payouts?.filter(p=>p.pending).map(p=>p.who)??[]));
  for(const id of owed)if(this.room.simulation.entities.has(id))this.retryPayouts(id);
 }
 deposit(who,blockId,count){
  this.expire();
  for(const m of this.items)if(count&&ACTIVE.has(m.status)&&m.objective.type==='deliver'&&m.objective.blockId===blockId){
   const add=Math.min(count,m.objective.count-m.progress.count);if(!add)continue;count-=add;m.progress.count+=add;
   const index=m.progress.contributors.findIndex(c=>c.who===who);
   if(index>=0){const [c]=m.progress.contributors.splice(index,1);c.count+=add;m.progress.contributors.push(c);}
   else m.progress.contributors.push({who,count:add});
   this.room.trace('mission.progress',{who,mission:m.id,count:m.progress.count,total:m.objective.count,added:add,msg:`Mission ${m.id}: ${m.progress.count}/${m.objective.count} delivered`});
   if(m.progress.count===m.objective.count)this.complete(m,who);else this.changed();
  }
 }
 orderDone(job){
  for(const m of this.items)if(ACTIVE.has(m.status)&&m.objective.type==='build'&&m.objective.orderId===job.id&&job.status==='done'){
   const order=this.room.orders?.items.find(o=>o.id===job.id);
   if(!order||!order.cells.every(c=>this.room.world.get(c.x,c.y,c.z)===c.id))continue;
   const who=job.assignee;if(!who||!this.playerInventory(who))continue;
   m.progress={count:1,contributors:[{who,count:1}]};this.room.trace('mission.progress',{who,mission:m.id,count:1,total:1,msg:`Build order ${job.id} verified`});this.complete(m,who);
  }
 }
 complete(m,last){
  m.status='done';m.completedBy=last;
  const total=m.progress.count,contributors=m.progress.contributors;
  let allocated=0;const shares=contributors.map((c,i)=>{const amount=i===contributors.length-1?m.escrow-allocated:Math.floor(m.escrow*c.count/total);allocated+=amount;return [c.who,amount];});
  this.settle(m,shares,'mission.done');
 }
}
