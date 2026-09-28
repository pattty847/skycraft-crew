// Touch on the world. One finger drags the camera; holding that finger still for a
// moment starts mining at the crosshair, and dragging while it stays down keeps
// mining, so the crosshair can sweep from block to block. Two fingers pinch to zoom.
// A finger that moves before the hold time is a plain camera swipe and never mines;
// one lifted before the hold time without moving is a tap (the caller jumps).
export const HOLD_MS=250,HOLD_SLOP=12;
export class TouchLook {
 constructor(){this.touches=new Map();this.drag=null;this.pinch=null;}
 spread(){const [a,b]=[...this.touches.values()];return Math.hypot(a.x-b.x,a.y-b.y);}
 down(id,x,y,t){
  this.touches.set(id,{x,y});
  if(this.touches.size===2){this.drag=null;this.pinch=this.spread();}
  else if(!this.drag&&this.touches.size===1)this.drag={id,x,y,startX:x,startY:y,t,moved:false,mining:false};
 }
 // Returns {zoom} for a pinch, {orbit:[dx,dy]} for the dragging finger, or null.
 move(id,x,y){
  if(this.touches.has(id))this.touches.set(id,{x,y});
  if(this.pinch!==null&&this.touches.size>=2){const d=this.spread(),zoom=this.pinch-d;this.pinch=d;return {zoom};}
  const drag=this.drag;if(drag?.id!==id)return null;
  if(!drag.mining&&Math.hypot(x-drag.startX,y-drag.startY)>HOLD_SLOP)drag.moved=true;
  const orbit=[x-drag.x,y-drag.y];drag.x=x;drag.y=y;return {orbit};
 }
 // Returns true when this finger was a tap.
 up(id,t){
  const d=this.drag,tap=d?.id===id&&!d.moved&&!d.mining&&this.pinch===null&&t-d.t<HOLD_MS;
  this.touches.delete(id);if(this.touches.size<2)this.pinch=null;if(this.drag?.id===id)this.drag=null;
  // After a pinch, the finger still down carries on orbiting (without mining) from where it is.
  if(this.touches.size===1&&!this.drag){const [[rest,p]]=this.touches;this.drag={id:rest,x:p.x,y:p.y,startX:p.x,startY:p.y,t:0,moved:true,mining:false};}
  return tap;
 }
 // Called every tick; true while the held finger is mining. `started` is true on the first tick.
 mining(t){
  const drag=this.drag;if(!drag)return {active:false,started:false};
  if(!drag.mining&&!drag.moved&&t-drag.t>=HOLD_MS){drag.mining=true;return {active:true,started:true};}
  return {active:drag.mining,started:false};
 }
 clear(){this.touches.clear();this.drag=null;this.pinch=null;}
}
