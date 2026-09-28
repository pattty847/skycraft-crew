import { resolvePlace } from '../navigation/places.js';

export default {
 name:'path-to',types:['path-to'],modes:['build','auto'],requester:true,followUp:false,verb:'plan a walkway between named places',needs:[],
 prompt:{auto:'For a walkway or bridge between two places, use path-to: {"type":"path-to","from":"NAME","to":"NAME"}. Choose both names exactly from observation.places, including "where you are standing now". Never send coordinates.',
  build:'For a walkway or bridge between two places, use {"type":"path-to","from":"NAME","to":"NAME"}. Both must be names from observation.places. The server chooses every block, checks claims and posts a crew build job. Never send coordinates.'},
 validate(a,o){
  const names=o.places??[];
  if(typeof a.from!=='string'||typeof a.to!=='string'||!names.some(n=>n.toLowerCase()===a.from.trim().toLowerCase())||!names.some(n=>n.toLowerCase()===a.to.trim().toLowerCase()))throw Error(`Choose two named places from observation.places: ${names.join(', ')}.`);
  return {type:'path-to',from:a.from.trim(),to:a.to.trim()};
 },
 announce:({name,action})=>({status:`${name} is planning a walkway from ${action.from} to ${action.to}…`}),
 start({room,entity,player,action}){
  const done=(ok,message)=>({result:{ok,message},tick(){},cancel(){}});
  try{
   const from=resolvePlace(room,action.from,player,entity).pos,to=resolvePlace(room,action.to,player,entity).pos;
   const order=room.orders.post(player,{blueprint:'path-to',from:{x:Math.floor(from.x),y:Math.round(from.y),z:Math.floor(from.z)},to:{x:Math.floor(to.x),y:Math.round(to.y),z:Math.floor(to.z)},params:{width:1}});
   return done(true,`Posted walkway order ${order.id} from ${action.from} to ${action.to}. The crew will gather planks and build it; the job board tracks completion.`);
  }catch(error){room.trace('path.refused',{level:'warn',who:player.id,reason:error.message,msg:`Walkway refused: ${error.message}`});return done(false,error.message);}
 },
};
