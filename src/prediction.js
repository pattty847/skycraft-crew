import { moveBody } from './physics.js';
const axes=['x','y','z'];
// Presentation-side simulation only. Blocks and inventory are always server-owned.
export class MovementPrediction {
 constructor(world,entity){this.world=world;this.entity=entity;this.frames=[];this.offset={x:0,y:0,z:0};}
 apply(frame){
  let dir={x:0,y:0,z:0},jump=false;
  for(const a of frame.actions){if(a.type==='move')dir=a.dir;if(a.type==='jump')jump=true;if(a.type==='lookAt'){const x=a.target.x-this.entity.position.x,z=a.target.z-this.entity.position.z,l=Math.hypot(x,z);if(l)this.entity.direction={x:x/l,y:0,z:z/l};}}
  moveBody(this.world,this.entity,dir,jump,1/60);
 }
 step(frame){this.frames.push(frame);if(this.frames.length>120)this.frames.shift();this.apply(frame);}
 reconcile(state,ack){
  const before=Object.fromEntries(axes.map(k=>[k,this.entity.position[k]+this.offset[k]]));
  const selected=this.entity.selected;Object.assign(this.entity,state,{position:{...state.position},velocity:{...state.velocity},inventory:new Uint16Array(state.inventory),selected});
  this.frames=this.frames.filter(f=>f.sequence>ack);for(const frame of this.frames)this.apply(frame);
  const distance=Math.hypot(...axes.map(k=>before[k]-this.entity.position[k]));
  for(const k of axes)this.offset[k]=distance<2?before[k]-this.entity.position[k]:0;
 }
 view(dt){for(const k of axes)this.offset[k]*=Math.exp(-20*dt);return {...this.entity,position:Object.fromEntries(axes.map(k=>[k,this.entity.position[k]+this.offset[k]]))};}
}
