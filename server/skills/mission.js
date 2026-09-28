import { MissionDeliverTask } from '../missions/deliver-task.js';
export default {
 name:'mission',types:['mission'],modes:['mission','auto'],verb:'deliver an open mission',needs:['claims'],
 mode:{key:'mission',label:'Crew mission',order:25,intro:name=>`${name} can take an open delivery mission, gather allowed material and deposit it at the stockpile.`,policy:'Mode: CREW MISSION. Choose only a listed open delivery mission ID, or action null.',rejection:'Choose a listed open delivery mission.'},
 prompt:{mission:'To take a delivery mission listed in missions, use action {"type":"mission","id":"exact listed id"}. The game checks that it is open and gathers visible unprotected material through actions. Use action null if no suitable mission is listed.'},
 validate(a,observation){
  if(typeof a.id!=='string'||!observation.missions?.some(m=>m.id===a.id&&m.objective.type==='deliver'))throw Error('Choose a visible open delivery mission.');
  return {type:'mission',id:a.id};
 },
 announce:({name,action})=>({status:`${name} is taking mission ${action.id.slice(0,8)}…`,receipt:`${name} will gather and deposit material through actions; the board counts only confirmed deposits.`}),
 start:({room,entity,action,progress})=>{
  const m=room.missions.items.find(m=>m.id===action.id);
  if(!m||!['open','accepted'].includes(m.status)||m.objective.type!=='deliver')throw Error('Mission is no longer available.');
  return new MissionDeliverTask(room,entity,m.id,progress);
 },
};
