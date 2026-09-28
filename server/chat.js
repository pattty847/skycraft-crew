import { appendFileSync,existsSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AGENT_KEYS } from '../src/presence.js';
import { MODE_KEYS, modeInfo, skillFor } from './skills/index.js';
export class WorldChat {
 constructor(room){this.room=room;this.path=join(room.directory,'chat.jsonl');this.entries=[];
  if(existsSync(this.path))this.entries=readFileSync(this.path,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).slice(-100);
 }
 add(kind,name,text,entityId=null){const entry={id:randomUUID(),kind,name,text:text.slice(0,1600),entityId,time:Date.now()};this.entries.push(entry);this.entries=this.entries.slice(-100);appendFileSync(this.path,JSON.stringify(entry)+'\n',{mode:0o600});for(const s of this.room.clients.keys())if(s.readyState===1)s.send(JSON.stringify({type:'chat',entry}));return entry;}
}
export function validateChat(message){
 if(!MODE_KEYS.includes(message.mode)||typeof message.text!=='string'||!message.text.trim()||message.text.length>1000)throw Error('Send 1–1000 characters and choose an available mode.');
 const agent=message.agent??'codex';if(!AGENT_KEYS.includes(agent))throw Error('Choose Codex or Claude.');
 // The companions lit in the chat panel; the server still decides who is addressed.
 const agents=Array.isArray(message.agents)?[...new Set(message.agents.filter(k=>AGENT_KEYS.includes(k)))]:[agent];
 return {mode:message.mode,text:message.text.trim(),agent,agents:agents.length?agents:[agent]};
}
// Models sometimes wrap the JSON in a sentence or a code fence. Only one object is accepted.
export function extractJson(text){
 const trimmed=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
 try{return JSON.parse(trimmed);}catch{}
 const start=trimmed.indexOf('{'),end=trimmed.lastIndexOf('}');
 if(start<0||end<=start)throw Error('Companion reply was invalid; no action executed.');
 try{return JSON.parse(trimmed.slice(start,end+1));}catch{throw Error('Companion reply was invalid; no action executed.');}
}
// Parse one model reply. Only an action from a skill allowed in this mode, rebuilt
// by that skill's validator from the fields it accepts, can reach the game.
// Only the words of a reply, for turns that may not act (follow-up reactions).
export function parseMessageOnly(text){
 const result=extractJson(text);
 if(!result||typeof result.message!=='string'||!result.message.trim()||result.message.length>1200)throw Error('Companion reply was invalid.');
 return {message:result.message,action:null,remember:noteFrom(result)};
}
const noteFrom=result=>typeof result.remember==='string'&&result.remember.trim()?result.remember.trim().slice(0,120):null;
export function parseCompanionReply(text,mode,observation){
 const result=extractJson(text);
 if(!result||typeof result.message!=='string'||!result.message.trim()||result.message.length>1200)throw Error('Companion reply was invalid; no action executed.');
 if(result.action===null||result.action===undefined)return {message:result.message,action:null,remember:noteFrom(result)};
 const skill=skillFor(result.action?.type);
 if(!skill||!skill.modes.includes(mode))throw Error(modeInfo(mode).rejection);
 return {message:result.message,action:skill.validate(result.action,observation),remember:noteFrom(result)};
}
