import { BLOCKS, isPlant } from '../src/blocks.js';
import { blockAccess } from '../src/block-access.js';
import { POINT_REACH } from '../src/gestures.js';
import { islandAt, LANDMARKS } from '../src/world.js';
import { isCompanionId } from '../src/presence.js';
import { findTrees } from './tasks/trees.js';
import { findStructures, describeStructures } from './building/structures.js';
import { placeNames } from './navigation/places.js';
const round=p=>({x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10,z:Math.round(p.z*10)/10});
const distance=(a,b)=>Math.round(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)*10)/10;
export const displayName=(e,names={})=>names[e.id]??`Player ${e.id.slice(0,4)}`;
// A bounded description of what a companion can perceive from where it stands.
// Visible blocks within pointing reach, characters and trees within sight are
// fair; buried ore, distant builds and the full block grid are not included.
export function observe(room,e,requester,{names={}}={}){
 const p=e.position,visible=[];
 for(let x=Math.floor(p.x)-12;x<=p.x+12;x++)for(let y=Math.floor(p.y)-6;y<=p.y+8;y++)for(let z=Math.floor(p.z)-12;z<=p.z+12;z++){
  const id=room.world.get(x,y,z),pos={x,y,z};
  if(id&&blockAccess(room.world,e,pos,false,POINT_REACH).ok)visible.push({pos,id,name:BLOCKS[id].name,hardness:BLOCKS[id].hardness,d:distance({x:x+.5,y:y+.5,z:z+.5},p)});
 }
 visible.sort((a,b)=>a.d-b.d);
 const strip=({d,...block})=>block;
 const others=[...room.simulation.entities.values()].filter(other=>other!==e&&distance(other.position,p)<40);
 const daylight=Math.sin((room.phase??.24)*Math.PI*2);
 return {
  places:placeNames(room,requester,e),
  claims:room.claims?.items??[],
  blueprints:room.blueprints?.catalog().map(({key,label,summary,params})=>({key,label,summary,params}))??[],
  missions:room.missions?.view().filter(m=>m.status==='open'||m.status==='accepted').map(({id,title,objective,reward,progress,expires})=>({id,title,objective,reward,progress,expires}))??[],
  requester:requester?{id:requester.id,name:displayName(requester,names),position:round(requester.position),distance:distance(requester.position,p)}:null,
  you:{id:e.id,position:round(p),island:islandAt(p.x,p.z),facing:round(e.direction)},
  timeOfDay:daylight>.2?'day':daylight<-.2?'night':'dusk',
  players:others.filter(o=>!isCompanionId(o.id)).map(o=>({id:o.id,name:displayName(o,names),position:round(o.position),distance:distance(o.position,p),island:islandAt(o.position.x,o.position.z)})),
  companions:others.filter(o=>isCompanionId(o.id)).map(o=>({id:o.id,name:displayName(o,names),position:round(o.position),distance:distance(o.position,p)})),
  nearbyTrees:findTrees(room.world,p,16).slice(0,5).map(t=>({base:t.base,height:t.trunk.length,distance:Math.round(t.distance)})),
  // Player-made builds (connected planks), with size and roof height, nearest first.
  structures:nameStructures(describeStructures(findStructures(room.world,p,16)),room.claims?.items??[],e.id),
  revision:room.world.revision,position:round(p),
  inventory:Array.from(e.inventory,(count,id)=>({id,name:BLOCKS[id]?.name??'Air',count})).filter(item=>item.count>0),
  // Trees and buildings first, so grass does not crowd them out.
  reachableBlocks:[...visible.filter(b=>b.id>=5),...visible.filter(b=>b.id<5)].filter(b=>b.d<=7.5&&blockAccess(room.world,e,b.pos).ok&&room.simulation.canEdit(e,b.pos,'break')).slice(0,80).map(strip),
  pointableBlocks:[...visible.filter(b=>b.id>=5).slice(0,60),...visible.filter(b=>b.id<5).slice(0,60)].map(strip),
 };
}
// A friendly name for each structure: a protected area's name, a world landmark,
// or a plain description. The observer's own home is "your ...".
export function nameStructures(structures,claims,observerId){
 const inside=(s,box)=>s.from.x>=box.min.x-1&&s.to.x<=box.max.x+1&&s.from.z>=box.min.z-1&&s.to.z<=box.max.z+1;
 return structures.map(s=>{
  const claim=claims.find(c=>c.min&&c.max&&inside(s,{min:c.min,max:c.max}));
  const landmark=LANDMARKS.find(l=>inside(s,l));
  const name=claim?`“${claim.name}”`:landmark?(landmark.owner===observerId?`your ${landmark.name.replace(/^.*'s /,'')}`:landmark.name):s.kind==='building'?'a plank building':s.kind==='walkway'?'a plank walkway':'a small build';
  return {...s,name};
 });
}
// The observation for the player behind `socket`.
export function describeWorld(room,e,socket,options){return observe(room,e,room.clients.get(socket)?.entity,options);}
// Heavy observation fields and the skills that need them. A model turn carries a
// field only when a skill allowed in that mode declares it in `needs`.
export const HEAVY_FIELDS=['reachableBlocks','pointableBlocks','structures','claims','nearbyTrees'];
const COMPASS=['east','south-east','south','south-west','west','north-west','north','north-east'];
export function bearing(from,to){
 const dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz);
 if(d<.8)return 'right here';
 return `${Math.round(d)} block${Math.round(d)===1?'':'s'} ${COMPASS[Math.round((Math.atan2(dz,dx)/(Math.PI/4)+8))%8]}`;
}
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
// A few plain sentences describing the scene around a companion, written the way
// a person would describe a room. Everything comes from the bounded observation.
export function describeScene(o){
 try{return scene(o);}catch{return '';}
}
function scene(o){
 const me=o.you?.position??o.position,lines=[];if(!me)return '';
 lines.push(`You are on ${o.you?.island??'an island'}. It is ${o.timeOfDay??'day'}.`);
 const people=[...(o.requester?[{...o.requester,requester:true}]:[]),...(o.players??[]).filter(p=>p.id!==o.requester?.id),...(o.companions??[])];
 if(people.length)lines.push(people.filter(p=>p.position).slice(0,5).map(p=>`${p.name}${p.requester?' (talking to you)':''} is ${bearing(me,p.position)}`).join('; ')+'.');
 else lines.push('Nobody else is within sight.');
 for(const s of (o.structures??[]).filter(s=>s.from&&s.to).slice(0,3)){
  const centre={x:(s.from.x+s.to.x+1)/2,z:(s.from.z+s.to.z+1)/2};
  const label=s.name??`a ${s.kind}`;
  // Say plainly when a build is right here, so a companion notices what it is standing in or next to.
  const inside=me.x>=s.from.x&&me.x<=s.to.x+1&&me.z>=s.from.z&&me.z<=s.to.z+1,near=Math.hypot(centre.x-me.x,centre.z-me.z)<=4;
  const where=inside?'— you are standing in it or on it':near?`is right beside you (${bearing(me,centre)})`:`is ${bearing(me,centre)}`;
  lines.push(`${label[0].toUpperCase()+label.slice(1)} (${s.id}), ${plural(s.size.y,'block')} tall, ${where}.`);
 }
 const mine=(o.claims??[]).filter(c=>c.min&&c.max);
 if(mine.length)lines.push(`Protected areas nearby: ${mine.slice(0,3).map(c=>`“${c.name}”`).join(', ')}. Companions may not edit inside them.`);
 const trees=(o.nearbyTrees??[]).filter(t=>t.base);
 lines.push(trees.length?`${plural(trees.length,'tree')} within 16 blocks; the nearest trunk is ${bearing(me,{x:trees[0].base.x+.5,z:trees[0].base.z+.5})}.`:'No trees within 16 blocks.');
 const carry=(o.inventory??[]).map(i=>`${i.count} ${i.name.toLowerCase()}`);
 lines.push(carry.length?`You carry ${carry.join(', ')}.`:'You carry nothing.');
 const counts={},plants={};for(const b of o.pointableBlocks??[])(isPlant(b.id)?plants:counts)[b.name]=((isPlant(b.id)?plants:counts)[b.name]??0)+1;
 const seen=Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([name,n])=>`${name.toLowerCase()} ×${n}`);
 if(seen.length)lines.push(`Visible blocks within 12: ${seen.join(', ')}.`);
 const forage=Object.entries(plants).map(([name,n])=>`${name.toLowerCase()} ×${n}`);
 if(forage.length)lines.push(`Plants growing nearby: ${forage.join(', ')}. You can pick them by breaking them.`);
 return lines.join(' ');
}
// What the model reads: a scene description, the small structured fields, and only
// the heavy fields some allowed skill needs, with block lists grouped by name as
// [x,y,z] triples. Validation keeps using the full observation.
export function forModel(observation,{needs=HEAVY_FIELDS}={}){
 const group=list=>{const out={};for(const b of list??[])(out[b.name]??=[]).push([b.pos.x,b.pos.y,b.pos.z]);return out;};
 const out={scene:describeScene(observation)};
 const named=({position,...rest})=>rest;
 for(const [key,value] of Object.entries(observation)){
  if(HEAVY_FIELDS.includes(key)&&!needs.includes(key))continue;
  // Raw positions stay out of what the model reads (it would repeat them); the
  // block lists that skills pick targets from keep their coordinates.
  if(key==='position'||key==='revision')continue;
  out[key]=key==='reachableBlocks'||key==='pointableBlocks'?group(value)
   :key==='you'||key==='requester'?(value&&named(value))
   :key==='players'||key==='companions'?value.map(named)
   :key==='structures'?value.map(({from,to,roofCells,...rest})=>rest)
   :key==='nearbyTrees'?value.map(({base,...rest})=>rest)
   :value;
 }
 if(needs.includes('reachableBlocks')||needs.includes('pointableBlocks'))out.blockFormat='Block lists map a block name to [x,y,z] cells, nearest first. In actions write a cell as {"x":..,"y":..,"z":..}.';
 return out;
}
