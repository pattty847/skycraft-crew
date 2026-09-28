import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HEAVY_FIELDS } from '../observation.js';
// Companion skills are discovered from this directory: one file per ability.
// A skill file default-exports:
//   name        unique id
//   types       action types it accepts from the model, e.g. ['follow']
//   modes       chat modes in which those actions are allowed
//   mode        optional: a chat mode this skill introduces
//               {key, label, order, intro(name), policy, rejection}
//   prompt      {[mode]: text} policy lines shown to the model in that mode
//   requester   true when the requesting player must still be connected
//   validate(action, observation) -> sanitized action, or throw a player-facing Error
//   start(context) -> task with tick(dt), cancel(), result {ok, message, retry?}
//   announce(context) -> {status, receipt} shown when the task starts
// Adding a skill never requires editing the controller, the chat parser, the
// Python bridge or the browser; two contributors can add skills side by side.
const TALK={key:'talk',label:'Chat',order:0,
 intro:name=>`Chat with ${name} · no block edits.`,
 policy:'Mode: CHAT. action is null for ordinary conversation.',
 rejection:'Talk mode rejected an action; no blocks changed.'};
// The default: the model picks whichever allowed skill fits the request. Every
// action is still validated and executed by its skill exactly as in its own mode.
const AUTO={key:'auto',label:'Auto',order:-1,
 intro:name=>`${name} · picks the right action for your request; every action is checked by the server.`,
 policy:'Mode: AUTO. Act only when the player asks you to do something; questions, compliments and small talk get a reply with action null. When they do ask, choose the single action that fits from those below. Ask a short question instead of guessing when the request is unclear.',
 rejection:'That action is not available. No blocks changed.'};
const directory=fileURLToPath(new URL('.',import.meta.url));
const files=readdirSync(directory).filter(f=>f.endsWith('.js')&&f!=='index.js').sort();
export const SKILLS=(await Promise.all(files.map(f=>import(new URL(f,import.meta.url))))).map(m=>m.default).filter(Boolean);
for(const skill of SKILLS)if(!skill.name||!Array.isArray(skill.types)||!Array.isArray(skill.modes)||typeof skill.start!=='function')throw Error(`Skill ${skill.name??'?'} is incomplete`);
export const MODES=[AUTO,TALK,...SKILLS.map(s=>s.mode).filter(Boolean)].sort((a,b)=>a.order-b.order);
export const MODE_KEYS=MODES.map(m=>m.key);
export const modeInfo=key=>MODES.find(m=>m.key===key)??TALK;
// A skill's prompt for a mode; in Auto it reuses the text from its own main mode.
const promptFor=(skill,mode)=>skill.prompt?.[mode]??(mode==='auto'?skill.prompt?.[skill.modes.find(m=>m!=='auto')]:undefined);
export const skillFor=type=>SKILLS.find(s=>s.types.includes(type))??null;
// The complete action policy text for one mode, assembled from every skill allowed in it.
export function policyFor(mode){
 const lines=[modeInfo(mode).policy];
 for(const skill of SKILLS)if(skill.modes.includes(mode)&&promptFor(skill,mode))lines.push(promptFor(skill,mode));
 if(mode==='talk'){const others=MODES.filter(m=>m.key!=='talk').map(m=>m.label);if(others.length)lines.push(`Movement is allowed; mining and placing are forbidden in chat. For those, suggest the player picks one of these modes: ${others.join(', ')}.`);}
 return lines.join(' ')+'\n';
}
// Heavy observation fields a mode's model turn must carry: the union of what its
// skills declare in `needs`. A skill without `needs` gets every field.
export function needsFor(mode){
 const fields=new Set();
 for(const skill of SKILLS)if(skill.modes.includes(mode))for(const field of skill.needs??HEAVY_FIELDS)fields.add(field);
 return [...fields];
}
// Browser-facing list for the chat mode picker.
export const modeMenu=()=>MODES.map(({key,label})=>({key,label}));
