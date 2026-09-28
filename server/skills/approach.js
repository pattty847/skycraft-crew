import { ApproachTask } from '../navigation/approach.js';
import { requireRequester } from './checks.js';
export default {
 name:'approach',types:['approach'],modes:['talk','gather','auto'],requester:true,followUp:true,verb:'come over',needs:[],
 prompt:{talk:'If the player asks you to come to them (including casual phrases like come here or mere), action is {"type":"approach","targetId":observation.requester.id}. The game computes a safe route and faces the player on arrival; do not guess coordinates.',
  gather:'You can also use approach as in chat.'},
 validate(a,observation){return {type:'approach',targetId:requireRequester(a,observation)};},
 announce:({name,who})=>({status:`${name} is finding a route to you…`,receipt:`${name} is walking to ${who}. Walking and jumping only.`}),
 start:({room,entity,player})=>new ApproachTask(room,entity,player.id),
};
