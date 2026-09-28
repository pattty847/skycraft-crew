import { NavigateTask } from '../navigation/approach.js';
import { horizontalDistance, standable } from '../navigation/pathfinder.js';
import { isCompanionId } from '../../src/presence.js';
// Deterministic ambient life for a resident companion: potter around home, turn
// to look at nearby players, say hello now and then, and walk home after a
// while away. No model is called; everything goes through Entity actions.
// Each persona chooses its night: 'sleep' (walk home and doze) or 'watch' (walk
// home and keep a quiet night shift, awake, looking out over the edge).
export class IdleBehavior {
 constructor(room,entity,{home,radius=5,lines=[],nightLines=lines,random=Math.random,homeAfter=150,sleepAtNight=false,night=sleepAtNight?'sleep':null,homeLine='Heading home!',nightLine='Getting sleepy… heading home ✻',lookOut=null}={}){
  this.room=room;this.entity=entity;this.home=home;this.night=night;this.homeLine=homeLine;this.nightLine=nightLine;this.lookOut=lookOut;this.radius=radius;this.lines=lines;this.nightLines=nightLines;this.random=random;this.homeAfter=homeAfter;
  this.walk=null;this.wait=2;this.away=0;this.greeted=new Map();this.time=0;
 }
 isNight(){return Math.sin((this.room.phase??.24)*Math.PI*2)<-.2;}
 cancel(){this.walk?.cancel();this.walk=null;this.entity.actions.move({x:0,y:0,z:0});}
 pick(list){return list[Math.floor(this.random()*list.length)];}
 nearestPlayer(){
  let best=null,distance=5;
  for(const other of this.room.simulation.entities.values()){
   if(other===this.entity||isCompanionId(other.id))continue;
   const d=horizontalDistance(other.position,this.entity.position);
   if(d<distance&&Math.abs(other.position.y-this.entity.position.y)<3){best=other;distance=d;}
  }
  return best;
 }
 tick(dt){
  this.time+=dt;const e=this.entity;
  if(this.walk){this.walk.tick(dt);if(this.walk.result){this.walk=null;this.wait=6+this.random()*8;}return;}
  // Night: walk home once, then stay put — dozing (the browser draws the sleep) or on watch.
  if(this.night&&this.home&&this.isNight()){
   if(horizontalDistance(e.position,this.home)>1.5){if(e.grounded&&(this.homeTries=(this.homeTries??0)+1)<=3){e.actions.say(this.nightLine);this.walk=new NavigateTask(this.room,e,{type:'point',pos:this.home,radius:1},{timeout:120});}return;}
   const visitor=this.nearestPlayer();
   if(this.night==='watch'){
    // On watch: greet visitors awake with a nod, otherwise look out over the edge.
    if(visitor){e.actions.lookAt({x:visitor.position.x,y:visitor.position.y+1.4,z:visitor.position.z});if(this.time-(this.greeted.get(visitor.id)??-Infinity)>90&&this.nightLines.length){this.greeted.set(visitor.id,this.time);e.actions.emote('nod');e.actions.say(this.pick(this.nightLines));}}
    else if(this.lookOut)e.actions.lookAt({x:this.home.x+this.lookOut.x*8,y:this.home.y+1,z:this.home.z+this.lookOut.z*8});
    return;
   }
   if(visitor&&this.time-(this.greeted.get(visitor.id)??-Infinity)>90){this.greeted.set(visitor.id,this.time);e.actions.lookAt({x:visitor.position.x,y:visitor.position.y+1.4,z:visitor.position.z});e.actions.say('zzz… oh! hi ✻ …zzz');}
   return;
  }
  this.homeTries=0;
  const player=this.nearestPlayer();
  if(player){
   e.actions.lookAt({x:player.position.x,y:player.position.y+1.4,z:player.position.z});
   const last=this.greeted.get(player.id)??-Infinity;
   // A wave with the first hello; later hellos are just words.
   if(this.time-last>90&&this.lines.length){if(last===-Infinity)e.actions.emote('wave');this.greeted.set(player.id,this.time);e.actions.say(this.pick(this.isNight()?this.nightLines:this.lines));}
   return;
  }
  if(!e.grounded)return;
  this.wait-=dt;
  const far=this.home&&horizontalDistance(e.position,this.home)>this.radius*2;
  this.away=far?this.away+dt:0;
  if(this.wait>0)return;
  if(far&&this.away>this.homeAfter){e.actions.say(this.homeLine);this.walk=new NavigateTask(this.room,e,{type:'point',pos:this.home,radius:1.5},{timeout:120});return;}
  if(this.random()<.25){e.actions.jump();this.wait=3+this.random()*5;return;}
  const anchor=far?e.position:this.home??e.position;
  for(let attempt=0;attempt<8;attempt++){
   const x=Math.floor(anchor.x+(this.random()*2-1)*this.radius)+.5,z=Math.floor(anchor.z+(this.random()*2-1)*this.radius)+.5;
   for(const dy of [0,1,-1,2,-2]){const p={x,y:Math.round(anchor.y)+dy,z};if(standable(this.room.world,p)&&this.room.world.get(Math.floor(x),p.y-1,Math.floor(z))!==6){this.walk=new NavigateTask(this.room,e,{type:'point',pos:p},{timeout:12,maxExpanded:500,maxReplans:2});return;}}
  }
  this.wait=4;
 }
}
