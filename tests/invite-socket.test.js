import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, next, closed } from './helpers.js';
test('invite-only over real WebSockets: owner joins, strangers are turned away, invited friends join as guests',async t=>{
 const {open}=await startServer(t,{requireInvite:true});
 const owner=await open(),ownerAccess=next(owner,'access');owner.send(JSON.stringify({type:'join'}));assert.equal((await ownerAccess).role,'member');
 const stranger=await open(),shut=closed(stranger);stranger.send(JSON.stringify({type:'join'}));
 const refusal=await shut;assert.equal(refusal.code,4003);assert.match(refusal.reason,/invite-only/);
 const invite=next(owner,'invite');owner.send(JSON.stringify({type:'invite-create'}));const {code}=await invite;
 const friend=await open(),friendWelcome=next(friend,'welcome'),friendAccess=next(friend,'access');friend.send(JSON.stringify({type:'join',invite:code}));assert.equal((await friendAccess).role,'guest');
 const notice=next(friend,'notice');friend.send(JSON.stringify({type:'day'}));assert.match((await notice).text,/Only island members/);
 // The owner sees the guest's pass and switches it off: the friend is disconnected and cannot return.
 const {you:friendId,token:friendToken}=await friendWelcome;
 const kicked=closed(friend);
 const listed=next(owner,'guests');owner.send(JSON.stringify({type:'guest-pass',id:friendId,on:false}));
 assert.deepEqual((await listed).guests.map(g=>[g.id,g.on]),[[friendId,false]]);
 const off=await kicked;assert.equal(off.code,4003);assert.match(off.reason,/switched off/);
 const again=await open(),refused=closed(again);again.send(JSON.stringify({type:'join',token:friendToken,invite:code}));assert.equal((await refused).code,4003);
});
