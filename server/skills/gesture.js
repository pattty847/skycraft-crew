import { GestureTask } from '../gesture-task.js';
const same=(a,b)=>['x','y','z'].every(k=>a[k]===b[k]);
export default {
 name:'gesture',types:['emote','pointAt'],modes:['talk','auto'],requester:false,verb:'wave, nod or point',needs:['pointableBlocks'],
 prompt:{talk:'Gestures are allowed when requested or useful to answer which block: {"type":"emote","name":"wave"} or name nod; {"type":"pointAt","pos":{"x":integer,"y":integer,"z":integer}} must select an existing block from observation.pointableBlocks. Pointing highlights that single block for four seconds; it does not build anything or mark a whole edge.'},
 validate(a,observation){
  if(a.type==='emote'&&['wave','nod'].includes(a.name))return {type:'emote',name:a.name};
  if(a.type==='pointAt'&&a.pos&&observation.pointableBlocks?.some(b=>same(b.pos,a.pos)))return {type:'pointAt',pos:{x:a.pos.x,y:a.pos.y,z:a.pos.z}};
  throw Error('That gesture is not available. No action executed.');
 },
 announce:({name})=>({status:`${name} is gesturing…`}),
 start:({room,entity,action})=>new GestureTask(room,entity,action),
};
