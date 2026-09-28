import build from './build.js';
import { BLUEPRINTS } from '../building/blueprints.js';
import { AGENT_KEYS } from '../../src/presence.js';
export const PLAN_LIMIT=6;
const labelOf=(room,job,who)=>`${job.blueprint==='stairs-to'?'Stairs up':(room.blueprints?.get(job.blueprint)??BLUEPRINTS[job.blueprint]).label} for ${who}`;
// The Architect: one model turn lays out several builds; each is validated like a
// single build and posted to the job board, where the Foreman hands them to
// whichever companion is free. Nothing is placed by this skill itself.
export default {
 name:'plan',types:['plan'],modes:['build','auto'],requester:true,followUp:false,verb:'plan several builds for the crew',needs:['pointableBlocks','structures','claims'],
 prompt:{auto:`For several builds at once, action is {"type":"plan","jobs":[BUILD,...]} with 1 to ${PLAN_LIMIT} build actions without "type" (optional "who":"claude"|"codex"); free companions build them from the crew job board.`,
  build:`For several builds at once (for example "decorate around my house" or "a bench and two arches"), action is {"type":"plan","jobs":[BUILD,...]} with 1 to ${PLAN_LIMIT} jobs, where each BUILD has the same fields as a build action without "type" (blueprint, on or near or target or structure, facing, params) plus optional "who":"claude"|"codex" to suggest a builder. The jobs go on the crew job board and free companions build them one by one, gathering wood first if needed.`},
 validate(a,observation){
  if(!Array.isArray(a.jobs)||a.jobs.length<1||a.jobs.length>PLAN_LIMIT)throw Error(`A plan needs 1 to ${PLAN_LIMIT} jobs. Nothing was posted.`);
  return {type:'plan',jobs:a.jobs.map(job=>({...build.validate({...job,type:'build'},observation),...(AGENT_KEYS.includes(job.who)?{who:job.who}:{})}))};
 },
 announce:({name,action})=>({status:`${name} is posting ${action.jobs.length} job${action.jobs.length===1?'':'s'}…`}),
 start({room,player,action,name}){
  const who=`Player ${player.id.slice(0,4)}`,requester={position:{...player.position},direction:{...player.direction}};
  const done=message=>({result:{ok:true,message},tick(){},cancel(){}});
  if(!room.jobs)return {result:{ok:false,message:'There is no job board in this world.'},tick(){},cancel(){}};
  const posted=[];
  for(const {who:prefer,...job} of action.jobs){
   try{posted.push(room.jobs.post({kind:'build',spec:{action:job,requester},label:labelOf(room,job,who),postedBy:name,requesterId:player.id,prefer:prefer??null}));}
   catch(error){if(!posted.length)return {result:{ok:false,message:error.message},tick(){},cancel(){}};break;}
  }
  return done(`Posted ${posted.length} job${posted.length===1?'':'s'} to the crew board: ${posted.map(j=>j.label).join('; ')}. Free companions will take them.`);
 },
};
