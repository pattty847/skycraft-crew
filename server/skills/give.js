import { BLOCKS, BLOCK_COUNT } from '../../src/blocks.js';
import { DeliverTask } from '../tasks/deliver.js';
export default {
 name:'give',types:['give'],modes:['talk','auto'],requester:true,followUp:true,verb:'hand you items',needs:[],
 prompt:{talk:'To hand the requester items you already carry (see observation.inventory), action is {"type":"give","blockId":ID,"count":N} with N from 1 to 64 and no more than you have. The game walks you over, hands them across and checks their inventory. To fetch wood you do not have yet, use gather instead.'},
 validate(a,observation){
  if(!Number.isInteger(a.blockId)||a.blockId<1||a.blockId>=BLOCK_COUNT||!Number.isInteger(a.count)||a.count<1||a.count>64)throw Error('Give needs a block id and a count from 1 to 64. Nothing changed.');
  const have=observation.inventory?.find(item=>item.id===a.blockId)?.count??0;
  if(have<a.count)throw Error(`I only have ${have} ${BLOCKS[a.blockId].name.toLowerCase()}. Nothing changed.`);
  return {type:'give',blockId:a.blockId,count:a.count};
 },
 announce:({name,who,action})=>({status:`${name} is bringing ${action.count} ${BLOCKS[action.blockId].name.toLowerCase()}…`,receipt:`${name} is bringing ${who} ${action.count} ${BLOCKS[action.blockId].name.toLowerCase()} from its own inventory.`}),
 start:({room,entity,player,action})=>new DeliverTask(room,entity,{requesterId:player.id,blockId:action.blockId,count:action.count}),
};
