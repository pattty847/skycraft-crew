import { extractJson } from './chat.js';
// Each companion's own short goal list ("Stock the crew stockpile with planks").
// Goals are set in a slow reflection pass (see Companion.reflect), persisted with the
// world, shown to players, and shown back to the companion as data, never as orders.
// A reflection may also choose one harmless action: travel to a named place or a gesture.
export const GOAL_LIMIT=5,GOAL_LENGTH=80;
export const REFLECT_EVERY=10*60*1000,REFLECT_MIN_GAP=2*60*1000;
export const REFLECT_POLICY=`Mode: REFLECT. Nobody asked you anything: this is your own quiet moment. Look at your observation, your memory notes and the recent chat, and keep a short list of your own goals on this island: at most ${GOAL_LIMIT}, each under ${GOAL_LENGTH} characters, concrete and doable here (for example "Stock the crew stockpile with planks", "Visit Sam's house on Origin Island", "Find a way onto Lookout Rock"). Keep goals that still matter, drop finished or stale ones, and add at most one new one. Return ONLY JSON: {"goals":[...],"message":"","action":null}. "message" is one short sentence to the players only if it is genuinely worth saying now; otherwise leave it empty. "action" is null, {"type":"goto","place":"<a name exactly from observation.places>"} or {"type":"emote","name":"wave"|"nod"}; do not travel home (your routine does that at night) and do not repeat a trip you just made. Never edit blocks in this mode. Most quiet moments need no message at all.`;
const clean=list=>[...new Set((Array.isArray(list)?list:[]).filter(g=>typeof g==='string').map(g=>g.replace(/\s+/g,' ').trim().slice(0,GOAL_LENGTH)).filter(Boolean))].slice(0,GOAL_LIMIT);
const books=new WeakMap();
export function goalsFor(room){
 let book=books.get(room);if(book)return book;
 let goals={};
 book={
  list:id=>[...(goals[id]??[])],
  all:()=>structuredClone(goals),
  set(id,list){const next=clean(list);if(JSON.stringify(next)===JSON.stringify(goals[id]??[]))return false;goals[id]=next;room.markDirty?.();room.sendAll?.({type:'goals',goals:book.all()});return true;},
 };
 room.extend?.('goals',{save:()=>goals,load:data=>{if(data&&typeof data==='object')goals=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,clean(v)]));},snapshot:()=>book.all()});
 books.set(room,book);return book;
}
// A reflection reply: goals, an optional line, and at most one harmless action.
export function parseReflection(text){
 const reply=extractJson(text);if(!reply||typeof reply!=='object')throw Error('Reflection must be a JSON object.');
 const message=typeof reply.message==='string'?reply.message.trim().slice(0,200):'';
 let action=null;const a=reply.action;
 if(a&&typeof a==='object'){
  if(a.type==='goto'&&typeof a.place==='string')action={type:'goto',place:a.place.trim().slice(0,80)};
  else if(a.type==='emote'&&['wave','nod'].includes(a.name))action={type:'emote',name:a.name};
 }
 return {goals:clean(reply.goals),message,action};
}
