import { NavigateTask } from './approach.js';
import { crossingLegs, resolvePlace } from './places.js';
import { horizontalDistance } from './pathfinder.js';

export class GotoTask {
 constructor(room,entity,name,requester){
  this.room=room;this.entity=entity;this.place=resolvePlace(room,name,requester,entity);
  const crossings=crossingLegs(room.world,entity.position,this.place.pos);
  this.legs=[...(crossings??[]),{pos:this.place.pos,label:this.place.name}];
  this.noConnection=crossings===null;this.index=0;this.current=null;this.result=null;
 }
 cancel(){this.current?.cancel();this.entity.actions.move({x:0,y:0,z:0});this.result??={ok:false,message:'Travel stopped by player.'};}
 tick(dt){
  if(this.result)return;
  if(this.noConnection){this.result={ok:false,message:`No known walking crossing toward ${this.place.name}.`};return;}
  if(!this.current){const leg=this.legs[this.index];this.current=new NavigateTask(this.room,this.entity,{type:'point',pos:leg.pos,radius:this.index===this.legs.length-1?1.5:.6},{timeout:120,maxExpanded:4000,maxReplans:12});}
  this.current.tick(dt);
  if(!this.current.result)return;
  const leg=this.legs[this.index],result=this.current.result;
  if(!result.ok){this.result={ok:false,message:`No route on ${leg.label}: ${result.message}`};return;}
  if(++this.index===this.legs.length){
   const p=this.entity.position,g=this.place.pos;
   this.result=horizontalDistance(p,g)<=1.5&&Math.abs(p.y-g.y)<.6&&this.entity.grounded?{ok:true,message:`Arrived at ${this.place.name}.`}:{ok:false,message:`Blocked at ${this.place.name}; arrival was not verified.`};
  }else this.current=null;
 }
}
