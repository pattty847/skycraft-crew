import { blockAccess } from './block-access.js';
export const POINT_REACH=12;
export const GESTURE_DURATION={wave:2.4,nod:1.5,point:4};
export function startGesture(world,e,action,time){
 if(action.type==='emote'&&action.name===null){e.gesture=null;return;}
 const kind=action.type==='pointAt'?'point':action.name;
 if(!(kind in GESTURE_DURATION))return;
 if(kind==='point'&&!blockAccess(world,e,action.pos,false,POINT_REACH).ok)return;
 e.gesture={kind,startedAt:time,endsAt:time+GESTURE_DURATION[kind]};
 if(kind==='point'){
  e.gesture.pos={...action.pos};e.gesture.blockId=world.get(action.pos.x,action.pos.y,action.pos.z);
  const x=action.pos.x+.5-e.position.x,z=action.pos.z+.5-e.position.z,l=Math.hypot(x,z);
  if(l)e.direction={x:x/l,y:0,z:z/l};
 }
}
export function updateGesture(world,e,intent,time){
 const g=e.gesture;if(!g)return;
 if(time>=g.endsAt||intent.jump||intent.breaking||Math.hypot(intent.dir.x,intent.dir.z)>.01||!e.grounded||
  (g.kind==='point'&&(world.get(g.pos.x,g.pos.y,g.pos.z)!==g.blockId||!blockAccess(world,e,g.pos,false,POINT_REACH).ok)))e.gesture=null;
}
