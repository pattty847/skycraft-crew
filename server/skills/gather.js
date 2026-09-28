import { B, BLOCKS } from '../../src/blocks.js';
import { GatherTask } from '../tasks/gather.js';
import { SurfaceGatherTask, SURFACE_MATERIALS, SURFACE_LIMIT } from '../tasks/surface-gather.js';
const MATERIALS=[B.WOOD,...SURFACE_MATERIALS];
const rejection=`Gather accepts 1–${SURFACE_LIMIT} wood, stone, dirt, sand or clay. Ore needs a mining trip. No blocks changed.`;
export default {
 name:'gather',types:['gather'],modes:['gather','auto'],requester:true,followUp:true,verb:'gather materials',needs:['claims'],
 mode:{key:'gather',label:'Gather materials',order:10,
  intro:name=>`Gather materials · ${name} may collect natural wood or visible surface stone, dirt, sand and clay, then hand them to you.`,
  policy:'Mode: GATHER MATERIALS. Otherwise action null.',rejection},
 prompt:{gather:`For wood, stone, dirt, sand, clay or natural leaves, action is {"type":"gather","blockId":ID,"count":N,"for":"self"|"player"}; IDs are wood 5, stone 3, dirt 2, sand 4, clay 10, leaves 6. N is 1–${SURFACE_LIMIT}. Use "for":"self" when asked to gather for yourself; otherwise deliver to the player. The game mines through actions. Use mine-trip for ore.`},
 validate(a){
  const blockId=a.blockId??B.WOOD;if(!MATERIALS.includes(blockId)||!Number.isInteger(a.count)||a.count<1||a.count>SURFACE_LIMIT)throw Error(rejection);
  if(a.for!==undefined&&!['self','player'].includes(a.for))throw Error('Gather destination must be self or player.');
  return {type:'gather',blockId,count:a.count,for:a.for??'player'};
 },
 announce:({name,who,action})=>({status:`${name} is gathering ${action.count} ${BLOCKS[action.blockId].name.toLowerCase()}…`,receipt:`${name} will gather ${action.count} ${BLOCKS[action.blockId].name.toLowerCase()} for ${action.for==='self'?'themselves':who}. Allowed edits: visible, reachable, unprotected natural material only.`}),
 start:({room,entity,player,action,progress})=>{if(action.for==='self')room.trace?.('gather.self',{who:entity.id,blockId:action.blockId,count:action.count,msg:`${entity.id.slice(0,8)} gathering for own inventory`});return action.blockId===B.WOOD?new GatherTask(room,entity,{requesterId:action.for==='self'?entity.id:player.id,count:action.count,onProgress:progress}):new SurfaceGatherTask(room,entity,{requesterId:action.for==='self'?entity.id:player.id,blockId:action.blockId,count:action.count,onProgress:progress});},
};
