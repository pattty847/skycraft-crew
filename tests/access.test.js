import test from 'node:test';
import assert from 'node:assert/strict';
import { Access,GUEST_AI_LIMIT } from '../server/access.js';
import { tempRoom,restart,fakeSocket as socket } from './helpers.js';
function setup(t,options){const room=tempRoom(t,{prefix:'sky-access-'});return {room,access:new Access(room,{requireInvite:true,...options})};}
test('an invite-only island admits members and invited guests, and nobody else',t=>{
 const {room,access}=setup(t),member=socket();room.connect(member);const token=member.messages[0].token,memberId=member.messages[0].you;
 assert.equal(access.admit(token).ok,true,'a known browser always returns');
 assert.equal(access.admit(undefined,undefined).ok,false);assert.equal(access.admit('made-up-token','nope').ok,false);
 const invite=access.createInvite(memberId,{maxUses:2});
 assert.deepEqual(access.admit(undefined,invite.code),{ok:true,guest:true,by:memberId,code:invite.code});assert.equal(access.admit(undefined,invite.code).ok,true);
 assert.equal(access.admit(undefined,invite.code).ok,false,'an invite runs out');
 const guest=socket();const entity=room.connect(guest);access.markGuest(entity.id);
 assert.throws(()=>access.createInvite(entity.id),/Only island members/);
});
test('invites expire, and invites and guests survive a restart',t=>{
 let now=1000;const {room,access}=setup(t,{now:()=>now}),s=socket();room.connect(s);
 const invite=access.createInvite(s.messages[0].you,{hours:1});access.markGuest('guest-1');room.save();
 now+=2*3600e3;assert.equal(access.admit(undefined,invite.code).ok,false,'expired');
 const restored=restart(room),again=new Access(restored,{requireInvite:true,now:()=>1000});
 assert.equal(again.admit(undefined,invite.code).ok,true);assert.ok(again.isGuest('guest-1'));
});
test('guests get a limited number of companion requests; members are not limited',t=>{
 let now=0;const {access}=setup(t,{now:()=>now});access.markGuest('guest');
 for(let i=0;i<GUEST_AI_LIMIT.turns;i++)assert.equal(access.allowAI('guest'),true);
 assert.equal(access.allowAI('guest'),false);for(let i=0;i<50;i++)assert.equal(access.allowAI('member'),true);
 now+=GUEST_AI_LIMIT.windowMs+1;assert.equal(access.allowAI('guest'),true,'the window slides');
});
test('guests cannot edit inside someone else’s protected area or use world-wide controls',t=>{
 const {room,access}=setup(t),w=room.world;
 const owner=room.simulation.spawn('owner'),guest=room.simulation.spawn('guest');access.markGuest('guest');
 room.claims.items=[{id:'c',ownerId:'owner',name:'House',min:{x:30,y:0,z:36},max:{x:36,y:40,z:42},protectPlayers:false}];
 const pos={x:33,y:w.top(33,39),z:39};
 assert.equal(room.simulation.canEdit(guest,pos,'break'),false);assert.equal(room.simulation.canEdit(owner,pos,'break'),true);
 assert.equal(room.simulation.canEdit(guest,{x:10,y:20,z:20},'place'),true,'outside protected areas guests build freely');
 for(const type of ['day','save','import','claim','invite-create'])assert.throws(()=>access.check('guest',type),/Only island members/);
 assert.doesNotThrow(()=>access.check('owner','day'));assert.doesNotThrow(()=>access.check('guest','input'));
});
test('guests may add to the crew stockpile but not take from it',t=>{
 const {room,access}=setup(t),guest=room.simulation.spawn('guest'),member=room.simulation.spawn('member');access.markGuest('guest');
 for(const e of [guest,member])e.position={x:56.5,y:20,z:96.5};
 guest.inventory[9]=10;room.stockpile.items[9]=5;
 assert.equal(room.simulation.stockpileTransfer(guest,'deposit',9,4),true);assert.equal(room.stockpile.items[9],9);
 assert.equal(room.simulation.stockpileTransfer(guest,'withdraw',9,4),false);assert.equal(room.stockpile.items[9],9);
 assert.equal(room.simulation.stockpileTransfer(member,'withdraw',9,4),true);assert.equal(room.stockpile.items[9],5);
});
test('a used-up or expired invite says so, and new invites allow five people',t=>{
 let now=0;const {room,access}=setup(t,{now:()=>now}),s=socket();room.connect(s);
 const invite=access.createInvite(s.messages[0].you);assert.equal(invite.maxUses,5);
 for(let i=0;i<5;i++)assert.equal(access.admit(undefined,invite.code).ok,true);
 assert.match(access.admit(undefined,invite.code).reason,/used up or has expired/);
 assert.match(access.admit(undefined,'no-such-code').reason,/invite-only/);
});
test('members can switch a guest pass off and on; an off pass cannot join',t=>{
 const {room,access}=setup(t),member=socket();room.connect(member);const memberId=member.messages[0].you;
 const invite=access.createInvite(memberId),admitted=access.admit(undefined,invite.code);assert.equal(admitted.by,memberId);
 const guest=socket(),entity=room.connect(guest);access.markGuest(entity.id,admitted.by);const guestToken=guest.messages[0].token;
 assert.deepEqual(access.guestList().map(g=>[g.number,g.by,g.on,g.online]),[[1,memberId,true,true]]);
 assert.throws(()=>access.setPass(entity.id,entity.id,false),/Only island members/);
 assert.throws(()=>access.setPass(entity.id,memberId,false),/Only island members/,'a guest cannot switch anyone off');
 assert.throws(()=>access.setPass(memberId,memberId,false),/Only guest passes/,'members cannot be switched off');
 access.setPass(memberId,entity.id,false);
 assert.match(access.admit(guestToken).reason,/switched off/);assert.equal(access.guestList()[0].on,false);
 room.save();const restored=new Access(restart(room),{requireInvite:true});
 assert.equal(restored.admit(guestToken).ok,false,'an off pass stays off after a restart');
 access.setPass(memberId,entity.id,true);assert.deepEqual(access.admit(guestToken),{ok:true,guest:true});
 assert.throws(()=>access.check(entity.id,'guest-pass'),/Only island members/);
});
test('switching a guest off also closes the invite they came in with',t=>{
 const {room,access}=setup(t),member=socket();room.connect(member);const memberId=member.messages[0].you;
 const invite=access.createInvite(memberId),admitted=access.admit(undefined,invite.code);
 const guest=socket(),entity=room.connect(guest);access.markGuest(entity.id,admitted.by,admitted.code);
 access.setPass(memberId,entity.id,false);
 assert.match(access.admit(undefined,invite.code).reason,/used up/,'a private window cannot rejoin with the same link');
 for(const type of ['build-order','build-order-cancel','blueprint-save','blueprint-delete'])assert.throws(()=>access.check(entity.id,type),/Only island members/);
});
