import { MineTripTask, MINE_TRIP_LIMIT, ORES } from '../tasks/mine-trip.js';
import { BLOCKS } from '../../src/blocks.js';
const rejection='Mining trips accept 1–5 coal ore (7) or iron ore (8).';
export default {
 name:'mine-trip',types:['mine-trip'],modes:['mine-trip','auto'],requester:true,verb:'fetch ore',needs:['claims'],
 mode:{key:'mine-trip',label:'Mining trip',order:15,intro:name=>`${name} may walk to visible, unprotected ore, mine it, and bring it back.`,policy:'Mode: MINING TRIP. Choose coal or iron ore as requested, or action null.',rejection},
 prompt:{'mine-trip':`For ore requests use {"type":"mine-trip","blockId":7,"count":3}; blockId 7 is coal ore, 8 is iron ore; count must be 1–${MINE_TRIP_LIMIT}. The game only targets visible ore within 24 blocks of the companion, walks, mines and gives it to requester. No tunneling, building edits, teleporting or hidden-ore knowledge. Ask the player to bring you near exposed ore if none is visible. Claims are enforced.`},
 validate(a){if(!ORES.includes(a.blockId)||!Number.isInteger(a.count)||a.count<1||a.count>MINE_TRIP_LIMIT)throw Error(rejection);return {type:'mine-trip',blockId:a.blockId,count:a.count};},
 announce:({name,action})=>({status:`${name} is starting a mining trip…`,receipt:`Collect and deliver ${action.count} ${BLOCKS[action.blockId].name}; visible unprotected ore only.`}),
 start:({room,entity,player,action,progress})=>new MineTripTask(room,entity,{requesterId:player.id,blockId:action.blockId,count:action.count,onProgress:progress}),
};
