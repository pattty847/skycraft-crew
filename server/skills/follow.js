import { FollowTask } from '../tasks/follow.js';
import { requireRequester } from './checks.js';
export default {
 name:'follow',types:['follow'],modes:['talk','gather','auto'],requester:true,verb:'follow you',needs:[],
 prompt:{talk:'If they ask you to follow them, come along or stick with them, action is {"type":"follow","targetId":observation.requester.id}; the game follows for up to 2.5 minutes.',
  gather:'You can also use follow as in chat.'},
 validate(a,observation){return {type:'follow',targetId:requireRequester(a,observation)};},
 announce:({name,who})=>({status:`${name} is following you`,receipt:`${name} is following ${who} for up to 2.5 minutes. Walking and jumping only.`}),
 start:({room,entity,player})=>new FollowTask(room,entity,player.id),
};
