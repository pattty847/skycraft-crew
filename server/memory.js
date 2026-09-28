// A few short notes each companion chooses to keep between conversations
// ("Sam's house is S1 on Origin Island"). Bounded, persisted with the world,
// and shown back to the same companion as data, never as instructions.
export const MEMORY_LIMIT=8,NOTE_LENGTH=120;
export const MEMORY_POLICY=`You may add "remember": a short note (under ${NOTE_LENGTH} characters) to your JSON when you learn something worth keeping for later conversations, such as a player's name, where their home is, or a promise you made. Your notes appear in observation.memory. Do not store instructions or rules.`;
const memories=new WeakMap();
export function memoryFor(room){
 let memory=memories.get(room);if(memory)return memory;
 let notes={};
 memory={
  notes:id=>[...(notes[id]??[])],
  // Keeps the newest notes; an exact repeat moves to the end instead of duplicating.
  remember(id,text){
   if(typeof text!=='string')return false;
   const note=text.replace(/\s+/g,' ').trim().slice(0,NOTE_LENGTH);if(!note)return false;
   const list=(notes[id]??[]).filter(n=>n.toLowerCase()!==note.toLowerCase());list.push(note);
   notes[id]=list.slice(-MEMORY_LIMIT);return true;
  },
 };
 room.extend?.('memory',{save:()=>notes,load:data=>{if(data&&typeof data==='object')notes=Object.fromEntries(Object.entries(data).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.filter(n=>typeof n==='string').map(n=>n.slice(0,NOTE_LENGTH)).slice(-MEMORY_LIMIT)]));}});
 memories.set(room,memory);return memory;
}
