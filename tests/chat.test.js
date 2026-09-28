import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCompanionReply,validateChat,WorldChat } from '../server/chat.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('talk replies are valid without any action; talk rejects all block actions',()=>{
 assert.equal(parseCompanionReply('{"message":"Nice house!","action":null}','talk',{}).action,null);
 assert.throws(()=>parseCompanionReply('{"message":"Mining","action":{"type":"breakBlock","pos":{"x":1,"y":2,"z":3}}}','talk',{reachableBlocks:[{pos:{x:1,y:2,z:3}}]}),/Talk mode/);
});
test('chat validates size and mode; pointing must choose an observed target',()=>{
 assert.throws(()=>validateChat({mode:'talk',text:'x'.repeat(1001)}));assert.throws(()=>validateChat({mode:'teleport',text:'hello'}));assert.throws(()=>validateChat({mode:'mine',text:'hello'}),/available mode/);assert.equal(validateChat({mode:'build',text:'stairs please'}).mode,'build');
 assert.throws(()=>parseCompanionReply('{"message":"There","action":{"type":"pointAt","pos":{"x":1,"y":2,"z":3}}}','talk',{pointableBlocks:[]}),/gesture is not available/);
});
test('shared messages survive restart and history is bounded',t=>{
 const directory=mkdtempSync(join(tmpdir(),'sky-chat-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const room={directory,clients:new Map()},chat=new WorldChat(room);for(let i=0;i<105;i++)chat.add('user','Player',`message ${i}`);
 const restored=new WorldChat(room);assert.equal(restored.entries.length,100);assert.equal(restored.entries.at(-1).text,'message 104');
});
test('chat approach targets only the requesting player and cannot grant mining permission',()=>{
 const observation={requester:{id:'pat'},reachableBlocks:[]};
 assert.equal(parseCompanionReply('{"message":"Coming!","action":{"type":"approach","targetId":"pat"}}','talk',observation).action.targetId,'pat');
 assert.throws(()=>parseCompanionReply('{"message":"Coming!","action":{"type":"approach","targetId":"someone-else"}}','talk',observation),/requesting player/);
 assert.throws(()=>parseCompanionReply('{"message":"Coming!","action":{"type":"approach","targetId":"pat"}}','build',observation));
});
