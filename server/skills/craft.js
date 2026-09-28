import { B, BLOCKS } from '../../src/blocks.js';
import { recipeFor, RECIPES, stationInReach } from '../../src/recipes.js';
import { SIZE } from '../../src/world.js';
import { NavigateTask } from '../navigation/approach.js';

const stationId={table:B.TABLE,furnace:B.FURNACE};
const stationName={table:'crafting table',furnace:'furnace'};
const stationTarget=(world,e,station)=>{
 const id=stationId[station],spots=[];
 for(let x=0;x<SIZE.x;x++)for(let z=0;z<SIZE.z;z++)for(let y=1;y<SIZE.y-1;y++)if(world.get(x,y,z)===id)spots.push({x,y,z,d:Math.hypot(x+.5-e.position.x,y+.5-e.position.y,z+.5-e.position.z)});
 return spots.sort((a,b)=>a.d-b.d)[0]??null;
};

export class CraftTask {
 constructor(room,entity,{recipe,count,give,requesterId}){
  Object.assign(this,{room,entity,recipe,count,give,requesterId});this.result=null;this.state='craft';this.made=0;this.walk=null;this.wait=0;
  const r=recipeFor(recipe);this.output=r.output;this.outputCount=r.count;
 }
 finish(ok,message){this.walk?.cancel();this.entity.actions.move({x:0,y:0,z:0});this.result={ok,message,made:this.made};if(!ok)this.room.trace?.('craft.refused',{level:'warn',who:this.entity.id,recipe:this.recipe,reason:message,msg:message});return this.result;}
 cancel(){if(!this.result)this.finish(false,'Crafting stopped.');}
 tick(dt){
  if(this.result)return;
  const e=this.entity,sim=this.room.simulation,r=recipeFor(this.recipe);
  if(this.walk){this.walk.tick(dt);if(!this.walk.result)return;const result=this.walk.result;this.walk=null;if(!result.ok){this.finish(false,`Could not reach ${this.state==='station'?stationName[r.station]:'the requester'}: ${result.message}`);return;}this.state=this.state==='station'?'craft':'give';}
  if(this.state==='station'){this.state='craft';}
  if(this.state==='craft'){
   if(this.made>=this.count){if(!this.give){this.finish(true,`Crafted ${this.made*this.outputCount} ${BLOCKS[this.output].name.toLowerCase()}; kept in inventory.`);return;}this.state='return';}
   else {
    if(r.station&&!stationInReach(this.room.world,e,r.station)){
     const target=stationTarget(this.room.world,e,r.station);if(!target){this.finish(false,`Need a ${stationName[r.station]}; none is available.`);return;}
     this.walk=new NavigateTask(this.room,e,{type:'custom',pos:{x:target.x+.5,y:target.y+1,z:target.z+.5},isGoal:p=>stationInReach(this.room.world,{position:p},r.station),heuristic:p=>Math.max(0,Math.hypot(p.x-target.x-.5,p.z-target.z-.5)-3)},{timeout:70});this.state='station';return;
    }
    if(r.inputs.some(([id,n])=>e.inventory[id]<n)){this.finish(false,`Missing ingredients after ${this.made} craft${this.made===1?'':'s'}.`);return;}
    if(e.inventory[this.output]+this.outputCount>65535){this.finish(false,'Output stack is full.');return;}
    this.before=e.inventory[this.output];this.inputBefore=r.inputs.map(([id])=>e.inventory[id]);this.wait=0;e.actions.craft(this.recipe);this.state='verify-craft';return;
   }
  }
  if(this.state==='verify-craft'){
   if(e.inventory[this.output]===this.before+this.outputCount&&r.inputs.every(([id,n],i)=>e.inventory[id]===this.inputBefore[i]-n)){this.made++;this.room.trace?.('craft.progress',{who:e.id,recipe:this.recipe,done:this.made,msg:`Crafted ${this.made}/${this.count} ${this.recipe}`});this.state='craft';return;}
   if((this.wait+=dt)>1)this.finish(false,'Craft action was refused or did not change inventory.');return;
  }
  if(this.state==='return'){
   const target=sim.entities.get(this.requesterId);if(!target){this.finish(false,'Requester left; crafted items stay with me.');return;}
   this.walk=new NavigateTask(this.room,e,{type:'entity',id:this.requesterId},{timeout:70});this.state='walk-give';return;
  }
  if(this.state==='give'){
   const amount=this.made*this.outputCount,before=sim.entities.get(this.requesterId)?.inventory[this.output];if(before===undefined){this.finish(false,'Requester left; crafted items stay with me.');return;}
   this.before=before;this.sequence=sim.receiptSequence;this.wait=0;e.actions.give(this.requesterId,this.output,amount);this.state='verify-give';return;
  }
  if(this.state==='verify-give'){
   const target=sim.entities.get(this.requesterId),receipt=e.transferReceipt,amount=this.made*this.outputCount;
   if(target&&receipt?.sequence>this.sequence&&receipt.ok&&receipt.targetId===this.requesterId&&receipt.blockId===this.output&&receipt.count===amount&&target.inventory[this.output]===this.before+amount){this.finish(true,`Crafted and handed over ${amount} ${BLOCKS[this.output].name.toLowerCase()}; verified by receipt.`);return;}
   if((this.wait+=dt)>1)this.finish(false,'Could not verify the handover; crafted items stay with me.');
  }
 }
}

export default {
 name:'craft',types:['craft'],modes:['auto','build'],requester:true,followUp:true,verb:'craft recipes',needs:['inventory'],
 prompt:{build:`To craft, use {"type":"craft","recipe":"<key>","count":N,"give":true|false}. Keys: ${Object.keys(RECIPES).join(', ')}. Count is recipe executions (1–16); planks make four per execution. Use give true to hand the result to the requester, false to keep it. The server checks ingredients and stations.`,auto:`To craft, use {"type":"craft","recipe":"<key>","count":N,"give":true|false}. Keys: ${Object.keys(RECIPES).join(', ')}. Count is recipe executions (1–16); planks make four per execution. Use give true when the player asks for the result, false when keeping it for yourself. The server checks ingredients and stations.`},
 validate(a,observation){
  const r=recipeFor(a.recipe);if(!r)throw Error('Unknown recipe.');
  if(!Number.isInteger(a.count)||a.count<1||a.count>16||typeof a.give!=='boolean')throw Error('Craft count must be 1–16 and give must be true or false.');
  const held=new Map((observation?.inventory??[]).map(i=>[i.id,i.count]));
  for(const [id,n] of r.inputs)if((held.get(id)??0)<n*a.count)throw Error(`Need ${n*a.count} ${BLOCKS[id].name.toLowerCase()} to craft ${a.count} times.`);
  return {type:'craft',recipe:a.recipe,count:a.count,give:a.give};
 },
 announce:({name,action})=>({status:`${name} is crafting ${action.recipe}…`,receipt:`${name} will craft ${action.recipe} ${action.count} time${action.count===1?'':'s'}${action.give?' and hand over the result':''}.`}),
 start:({room,entity,player,action})=>new CraftTask(room,entity,{...action,requesterId:player.id}),
};
