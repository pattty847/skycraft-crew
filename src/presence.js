// Shared by the browser and the server: who each AI companion is.
export const PERSONAS=Object.freeze({
 codex:Object.freeze({key:'codex',id:'codex-companion',name:'Codex',tint:0x84f1cd,home:Object.freeze({x:17.5,z:24.5}),role:'AI companion · sees a screenshot'}),
 claude:Object.freeze({key:'claude',id:'claude-companion',name:'Claude',tint:0xe08a5f,home:Object.freeze({x:84.5,z:33.5}),role:'AI companion · reads a text observation'}),
});
export const COMPANION_ID=PERSONAS.codex.id;
export const AGENT_KEYS=Object.keys(PERSONAS);
export const isCompanionId=id=>typeof id==='string'&&id.endsWith('-companion');
export const personaFor=id=>Object.values(PERSONAS).find(p=>p.id===id)??null;
export function describeEntity(entity,you) {
 const persona=personaFor(entity.id),self=entity.id===you;
 if(persona)return {name:`${persona.name} · AI`,role:persona.role,tint:persona.tint,agent:persona.key};
 return {name:self?'You':`Player ${entity.id.slice(0,4)}`,role:self?'This browser':'Other browser / device',tint:self?0xd2eadf:0x91bbf5,agent:null};
}
export function presenceSummary(entities){const list=[...entities];const agents=list.filter(e=>personaFor(e.id)).length,total=AGENT_KEYS.length;return `${list.length-agents} player${list.length-agents===1?'':'s'} · ${agents}/${total} AI companion${total===1?'':'s'}`;}
