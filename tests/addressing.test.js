import test from 'node:test';
import assert from 'node:assert/strict';
import { addressees } from '../server/addressing.js';
import { validateChat } from '../server/chat.js';
import { tempRoom, companion, scriptModel, attachPlayer } from './helpers.js';
const NAMES={claude:'Claude',codex:'Codex'};
const to=(text,selected=['codex'])=>addressees(text,selected,NAMES).sort().join('+');
test('a message goes to whoever it opens with, then group words, then names, then the lit buttons',()=>{
 assert.equal(to('Claude, go to Crew Isle'),'claude','an opening name wins, and "Crew" is not a group word');
 assert.equal(to('@claude hi'),'claude');
 assert.equal(to('codex, claude says hi',['claude']),'codex','only the opening name is addressed');
 assert.equal(to('Claude and Codex, come here'),'claude+codex');
 assert.equal(to('what do you guys think',['claude']),'claude+codex');
 assert.equal(to('Claude, what do you both think?',['claude']),'claude+codex','speaking to the group includes everyone');
 assert.equal(to('hey claude, nice house'),'claude','a name anywhere picks that companion');
 assert.equal(to('nice house',['codex']),'codex');
 assert.equal(to('nice house',['claude','codex']),'claude+codex','both lit means both hear it');
 assert.equal(to('nice house',[]),'claude','someone always hears a message');
 assert.equal(to('the claudette is here'),'codex','names match whole words only');
});
test('chat validation keeps only known companions from the lit buttons',()=>{
 assert.deepEqual(validateChat({mode:'talk',text:' hi ',agent:'claude',agents:['claude','codex','nobody','codex']}).agents,['claude','codex']);
 assert.deepEqual(validateChat({mode:'talk',text:'hi',agent:'codex'}).agents,['codex'],'older clients send one agent');
});
test('a message for two companions is posted once and each is told the other is answering',async t=>{
 const room=tempRoom(t,{prefix:'sky-both-',chat:true}),{socket}=attachPlayer(room);
 const policies={};
 const agents=['claude','codex'].map(key=>{const a=companion(room,key);scriptModel(a,payload=>{policies[key]=payload.policy;return '{"message":"Hi","action":null}';},{observation:{}});return a;});
 const together=['Claude','Codex'];
 await Promise.all(agents.map((a,i)=>a.run(socket,{mode:'talk',text:'hi both',together,echoed:i>0})));
 assert.equal(room.chat.entries.filter(e=>e.kind==='user').length,1,'the player line appears once');
 assert.match(policies.claude,/Codex will answer separately/);assert.match(policies.codex,/Claude will answer separately/);
});
