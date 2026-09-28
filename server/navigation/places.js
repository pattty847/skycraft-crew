import { ISLANDS, LANDMARKS, islandAt } from '../../src/world.js';
import { PERSONAS } from '../personas/index.js';
import { STOCKPILE_POSITION } from '../stockpile.js';
import { standable, horizontalDistance } from './pathfinder.js';
import { isCompanionId } from '../../src/presence.js';

const homes=()=>Object.values(PERSONAS).map(p=>({name:`${p.name}'s home`,x:p.home?.x??30.5,z:p.home?.z??30.5,kind:'home'}));
const visiblePlayers=(room,observer)=>observer?[...room.simulation.entities.values()].filter(e=>!isCompanionId(e.id)&&e!==observer&&horizontalDistance(e.position,observer.position)<40).map(e=>({name:`where Player ${e.id.slice(0,4)} is standing now`,point:{...e.position},kind:'player'})):[];

export function standingPoint(world,x,z,{min=1,max=46}={}){
 const cx=Math.floor(x),cz=Math.floor(z);
 for(let radius=0;radius<=5;radius++)for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){
  if(Math.max(Math.abs(dx),Math.abs(dz))!==radius)continue;
  for(let y=max;y>=min;y--){const p={x:cx+dx+.5,y,z:cz+dz+.5};
   if(standable(world,p)&&![5,6].includes(world.get(cx+dx,y-1,cz+dz)))return p;
  }
 }
 return null;
}
export function placeNames(room,requester,observer){
 const names=[...ISLANDS.map(i=>i.name),...LANDMARKS.map(l=>l.name)];
 names.push(...homes().map(h=>h.name));
 names.push('Crew stockpile');
 for(const c of room.claims?.items??[])if(!names.some(n=>n.toLowerCase()===c.name.toLowerCase()))names.push(c.name);
 if(requester)names.push('where you are standing now');
 names.push(...visiblePlayers(room,observer).map(p=>p.name));
 return names;
}
const normalize=s=>s.trim().toLowerCase().replace(/^the /,'').replace(/\s+/g,' ');
export function resolvePlace(room,name,requester,observer){
 if(typeof name!=='string'||name.length>100)throw Error('Choose a named place.');
 const query=normalize(name),world=room.world;
 const entries=[...ISLANDS.map(i=>({name:i.name,x:i.x,z:i.z,kind:'island'})),
  ...LANDMARKS.map(l=>({name:l.name,x:(l.min.x+l.max.x)/2,z:(l.min.z+l.max.z)/2,kind:'landmark'})),
  ...homes(),
  {name:'Crew stockpile',x:STOCKPILE_POSITION.x,z:STOCKPILE_POSITION.z,kind:'stockpile'},
  ...(room.claims?.items??[]).map(c=>({name:c.name,x:(c.min.x+c.max.x)/2,z:(c.min.z+c.max.z)/2,kind:'claim'})),
  ...visiblePlayers(room,observer)];
 if(requester)entries.push({name:'where you are standing now',aliases:[`where Player ${requester.id.slice(0,4)} is standing now`,'where the player is standing now','where I am standing now'],point:{...requester.position},kind:'player'});
 const found=entries.find(e=>normalize(e.name)===query||e.aliases?.some(a=>normalize(a)===query));
 if(!found)throw Error(`Unknown place “${name}”. Try: ${placeNames(room,requester,observer).join(', ')}.`);
 const pos=found.point??standingPoint(world,found.x,found.z);
 if(!pos||!standable(world,{x:Math.floor(pos.x)+.5,y:Math.round(pos.y),z:Math.floor(pos.z)+.5}))throw Error(`${found.name} has no safe standing point right now.`);
 return {name:found.name,pos:{...pos},kind:found.kind,island:islandAt(pos.x,pos.z)};
}

// Fixed crossing anchors describe the generated walkable links. Every leg still
// runs a bounded PathSearch against the current (possibly edited) world.
export const CROSSINGS={
 'Origin Island|Clover Rise':[[42,38],[70,38]],
 'Origin Island|the Sandbox':[[29,43],[29,45],[29,47],[29,49],[25,55]],
 'Clover Rise|Ironcrag':[[84,43],[84,48],[85,56],[85,64],[86,72],[86,80]],
 'Origin Island|Sandbar':[[32,43],[32,46],[32,54],[32,62],[33,70],[33,78],[33,86]],
 'Sandbar|Crew Isle':[[38,96],[43,96],[49,96]],
};
export function crossingLegs(world,from,to){
 const start=islandAt(from.x,from.z),end=islandAt(to.x,to.z);
 if(start===end)return [];
 const links=Object.keys(CROSSINGS).map(k=>k.split('|'));
 const queue=[[start,[]]],seen=new Set([start]);
 while(queue.length){const [at,path]=queue.shift();if(at===end){
   const points=[];for(const [a,b] of path){const key=`${a}|${b}`,reverse=!CROSSINGS[key],coords=CROSSINGS[key]??CROSSINGS[`${b}|${a}`];
    for(const [x,z] of reverse?[...coords].reverse():coords){const pos=standingPoint(world,x,z,key==='Origin Island|Sandbar'?{max:24}:{});if(pos&&horizontalDistance(pos,from)>1.5&&horizontalDistance(pos,to)>1.5)points.push({pos,label:`${a} → ${b} crossing`});}
   }return points;
  }
  for(const [a,b] of links){const next=a===at?b:b===at?a:null;if(next&&!seen.has(next)){seen.add(next);queue.push([next,[...path,[at,next]]]);}}
 }
 return null;
}
