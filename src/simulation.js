import { startGesture, updateGesture } from './gestures.js';
import { BLOCKS, B, isPlant, isSolid } from './blocks.js';
import { canMine, miningSpeed } from './tools.js';
import { Entity } from './entity.js';
import { collides, moveBody, overlapsBlock } from './physics.js';
import { blockAccess } from './block-access.js';
import { recipeFor, canCraft } from './recipes.js';
import { insideSandbox } from './world.js';
import { isCompanionId } from './presence.js';
export const GIVE_REACH=3;
const NATURAL_GROUND=[1,2,3,4];
export class Simulation {
  constructor(world) {
    this.world=world;this.entities=new Map();this.queue=[];this.time=0;this.inventoryRevision=0;this.receiptSequence=0;
    this.notice='';this.onChange=()=>{};this.onPlace=()=>{};this.onTransfer=()=>{};this.stockpileTransfer=()=>false;this.trace=()=>{};this.refusals=new Map();
    // Edit policy hook, set by the server (for example protected areas).
    // canEdit(entity, pos, 'break'|'place') -> false refuses the edit before it happens.
    // Skills should also ask it before choosing targets, so they never plan a refused edit.
    this.canEdit=()=>true;
  }
  spawn(id='codex') {
    if(this.entities.has(id))throw new Error('Entity id already exists');
    const entity=new Entity(id,this.findSpawn(),action=>{if(this.queue.length<256)this.queue.push(action);});
    this.entities.set(id,entity);return entity;
  }
  findSpawn() {
    // Respawn searches the remaining world; mining the original spawn cannot trap you.
    for(let r=0;r<64;r++)for(let dx=-r;dx<=r;dx++)for(const dz of r===0?[0]:[-r,r]) {
      const x=34+dx,z=39+dz,y=this.world.top(x,z)+1;
      const p={x:x+.5,y,z:z+.5};
      // Land on natural ground, never on top of someone's build or a tree.
      if(y>0&&y<46&&NATURAL_GROUND.includes(this.world.get(x,y-1,z))&&!collides(this.world,p))return p;
    }
    // If the entire island was mined, restore a tiny recoverable landing pad.
    for(let x=33;x<36;x++)for(let z=38;z<41;z++)this.world.set(x,22,z,3);
    return {x:34.5,y:23,z:39.5};
  }
  blockAccess(entity,pos,placing=false) {
    return blockAccess(this.world,entity,pos,placing);
  }
  tick(dt) {
    this.time+=dt;
    const intents=new Map([...this.entities.keys()].map(id=>[id,{dir:{x:0,y:0,z:0},jump:false,breaking:null}]));
    for(const action of this.queue.splice(0)) {
      const e=this.entities.get(action.entityId),intent=intents.get(action.entityId);if(!e)continue;
      switch(action.type) {
        case 'emote': case 'pointAt': startGesture(this.world,e,action,this.time);break;
        case 'move': intent.dir=action.dir;break;
        case 'jump': intent.jump=true;break;
        case 'lookAt': {
          const x=action.target.x-e.position.x,z=action.target.z-e.position.z,l=Math.hypot(x,z);
          if(l)e.direction={x:x/l,y:0,z:z/l};break;
        }
        case 'breakBlock': intent.breaking=action.pos;break;
        case 'placeBlock': e.gesture=null;this.place(e,action.pos,action.blockId);break;
        case 'give': {const ok=this.give(e,action.targetId,action.blockId,action.count);e.transferReceipt={sequence:++this.receiptSequence,ok,targetId:action.targetId,blockId:action.blockId,count:action.count};this.onTransfer(e,{ok,targetId:action.targetId,blockId:action.blockId,count:action.count});break;}
        case 'deposit':case 'withdraw': {const ok=this.stockpileTransfer(e,action.type,action.blockId,action.count);e.stockpileReceipt={sequence:++this.receiptSequence,ok,action:action.type,blockId:action.blockId,count:action.count};if(ok)this.trace('edit.'+action.type,{who:e.id,blockId:action.blockId,count:action.count,msg:`${e.id.slice(0,8)} ${action.type==='deposit'?'deposited':'withdrew'} ${action.count} ${BLOCKS[action.blockId]?.name??action.blockId}`});break;}
        case 'craft': this.craft(e,action.recipe);break;
        case 'say': e.speech=action.text;e.speechUntil=this.time+5;break;
      }
    }
    for(const e of this.entities.values()) {
      const intent=intents.get(e.id);
      moveBody(this.world,e,intent.dir,intent.jump,dt);
      if(e.position.y < -18) {e.position=this.findSpawn();e.velocity={x:0,y:0,z:0};e.breaking=null;this.notice='Back on solid ground. Your inventory is safe.';}
      updateGesture(this.world,e,intent,this.time);
      this.mine(e,intent.breaking,dt);
    }
  }
  refuse(e,kind,pos,reason){const key=`${e.id}:${kind}:${JSON.stringify(pos)}:${reason}`,now=Date.now();if(now-(this.refusals.get(key)??0)<2000)return;this.refusals.set(key,now);if(this.refusals.size>256)this.refusals.clear();this.trace('edit.refused',{level:'warn',who:e.id,action:kind,pos,reason,msg:`${e.id.slice(0,8)} ${kind} refused: ${reason}`});}
  mine(e,pos,dt) {
    if(!pos){e.breaking=null;return;}
    const access=this.blockAccess(e,pos);if(!access.ok||!this.canEdit(e,pos,'break')){this.refuse(e,'break',pos,access.ok?'claim':access.reason);e.breaking=null;return;}
    const id=this.world.get(pos.x,pos.y,pos.z);
    if(!id){e.breaking=null;return;}
    if(!e.creative&&!canMine(e,id)){this.notice='Iron ore needs a stone pickaxe or better.';this.refuse(e,'break',pos,'Need a stone pickaxe or better for iron ore.');e.breaking=null;return;}
    if(!e.breaking||!samePos(e.breaking.pos,pos)||e.breaking.id!==id)e.breaking={pos:{...pos},id,elapsed:0};
    e.breaking.elapsed+=dt*(e.creative?1:miningSpeed(e,id));
    // An admin in creative mode (server/admin.js) breaks any block in 0.15 s.
    if(e.breaking.elapsed>=(e.creative?.15:BLOCKS[id].hardness)) {
      const drop=BLOCKS[id].drops;
      if(e.inventory[drop]===65535){this.notice='That stack is full.';this.refuse(e,'break',pos,'inventory');e.breaking=null;return;}
      this.world.set(pos.x,pos.y,pos.z,0);e.inventory[drop]++;e.mineReceipt={sequence:++this.receiptSequence,pos:{...pos},blockId:id,drop};this.inventoryRevision++;
      this.notice=`+1 ${BLOCKS[drop].name}`;e.breaking=null;this.onChange();this.trace('edit.break',{who:e.id,pos,blockId:id,drop,msg:`${e.id.slice(0,8)} broke ${BLOCKS[id]?.name??id}`});
    }
  }
  place(e,pos,id) {
    const creative=e.creative||isCompanionId(e.id)&&insideSandbox(pos.x,pos.z);
    const access=this.blockAccess(e,pos,true),reason=!BLOCKS[id]||BLOCKS[id].kind==='item'?'item':!creative&&!e.inventory[id]?'inventory':this.world.get(pos.x,pos.y,pos.z)?'occupied':!access.ok?access.reason:!this.canEdit(e,pos,'place')?'claim':null;
    if(reason){this.refuse(e,'place',pos,reason);return false;}
    if(!isPlant(id)&&[...this.entities.values()].some(other=>overlapsBlock(other.position,pos))){this.refuse(e,'place',pos,'collision');return false;}
    if(isPlant(id)&&id!==B.TORCH&&(![B.GRASS,B.DIRT].includes(this.world.get(pos.x,pos.y-1,pos.z))||this.world.get(pos.x,pos.y+1,pos.z))){this.refuse(e,'place',pos,'ground');return false;}
    const supported=(isPlant(id)&&id!==B.TORCH)||[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([x,y,z])=>isSolid(this.world.get(pos.x+x,pos.y+y,pos.z+z)));
    if(!supported){this.refuse(e,'place',pos,'unsupported');return false;}
    this.world.set(pos.x,pos.y,pos.z,id);this.onPlace(pos,id);if(!creative)e.inventory[id]--;this.inventoryRevision++;this.onChange();this.trace('edit.place',{who:e.id,pos,blockId:id,creative,msg:`${e.id.slice(0,8)} placed ${BLOCKS[id]?.name??id}${creative?' in Sandbox':''}`});return true;
  }
  // Hand items to an Entity within arm's reach. All or nothing.
  give(e,targetId,id,count) {
    const target=this.entities.get(targetId);
    if(!target||target===e||e.inventory[id]<count||target.inventory[id]+count>65535){this.refuse(e,'give',null,!target?'target':'inventory');return false;}
    const p=e.position,q=target.position;
    if(Math.hypot(p.x-q.x,p.z-q.z)>GIVE_REACH||Math.abs(p.y-q.y)>1.5){this.refuse(e,'give',null,'reach');return false;}
    e.inventory[id]-=count;target.inventory[id]+=count;this.inventoryRevision++;this.onChange();this.trace('edit.give',{who:e.id,targetId,blockId:id,count,msg:`${e.id.slice(0,8)} gave ${count} ${BLOCKS[id]?.name??id}`});return true;
  }
  craft(e,key){
    const recipe=recipeFor(key);if(!recipe){this.notice='Unknown recipe.';this.refuse(e,'craft',null,'Unknown recipe.');return false;}
    const check=canCraft(this.world,e,key);if(!check.ok){this.notice=check.reason;this.refuse(e,'craft',null,check.reason);return false;}
    const {output,count,inputs}=recipe;
    for(const [id,n] of inputs)e.inventory[id]-=n;
    e.inventory[output]+=count;this.inventoryRevision++;this.notice=`Crafted ${count} ${BLOCKS[output].name.toLowerCase()}`;this.onChange();this.trace('edit.craft',{who:e.id,recipe:key,blockId:output,count,msg:`${e.id.slice(0,8)} crafted ${count} ${BLOCKS[output]?.name??output}`});return true;
  }
  craftMaterial(e,id){return this.craft(e,id);}
  craftPlanks(e){return this.craft(e,'planks');}
}
function samePos(a,b){return a.x===b.x&&a.y===b.y&&a.z===b.z;}
