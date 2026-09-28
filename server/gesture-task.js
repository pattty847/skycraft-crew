export class GestureTask {
 constructor(room,entity,action){
  this.room=room;this.entity=entity;this.action=action;this.result=null;this.started=null;this.requestedAt=room.simulation.time;
  if(action.type==='emote')entity.actions.emote(action.name);else entity.actions.pointAt(action.pos);
 }
 tick(){
  if(this.result)return;
  const g=this.entity.gesture,time=this.room.simulation.time;
  if(!this.started){
   if(g&&g.startedAt>this.requestedAt&&g.kind===(this.action.type==='pointAt'?'point':this.action.name))this.started=g;
   else if(time-this.requestedAt>.25)this.result={ok:false,message:'Gesture could not start. The target may have changed or the companion is moving.'};
  }else if(!g||g.startedAt!==this.started.startedAt){
   const ok=time>=this.started.endsAt;
   this.result={ok,message:ok?(this.started.kind==='point'?`Pointed at block (${this.started.pos.x}, ${this.started.pos.y}, ${this.started.pos.z}).`:`Finished a ${this.started.kind}.`):'Gesture interrupted.'};
  }
 }
 cancel(){if(!this.result){this.entity.actions.emote(null);this.result={ok:false,message:'Gesture stopped.'};}}
}
