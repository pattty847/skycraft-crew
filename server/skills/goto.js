import { GotoTask } from '../navigation/goto.js';
import { placeNames } from '../navigation/places.js';

export default {
 name:'goto',types:['goto'],modes:['talk','auto'],requester:false,followUp:true,verb:'travel to named places',needs:[],
 prompt:{talk:'For a request to travel to a named place, use {"type":"goto","place":"Ironcrag"}. Choose a name exactly from observation.places. For “where I am standing now”, use that exact name; this captures one point, not a moving player. Never give coordinates. Use approach when asked to come to a moving player.'},
 validate(a,o){
  if(typeof a.place!=='string'||!o.places?.some(n=>n.toLowerCase()===a.place.trim().toLowerCase()))throw Error(`Choose a named place: ${(o.places??[]).join(', ')}.`);
  return {type:'goto',place:a.place.trim()};
 },
 announce:({name,action})=>({status:`${name} is finding a route to ${action.place}…`,receipt:`${name} is travelling to ${action.place}. Walking and jumping only.`}),
 start:({room,entity,player,action})=>new GotoTask(room,entity,action.place,player),
};
