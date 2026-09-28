import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GestureTask } from '../server/gesture-task.js';
import { describeWorld } from '../server/observation.js';
import { parseCompanionReply } from '../server/chat.js';
import { animateGesture } from '../src/gesture-pose.js';
import * as THREE from 'three';
import { tempRoom,join,input } from './helpers.js';
function setup(t){const room=tempRoom(t,{prefix:'sky-gestures-'}),{socket:a,entity:e}=join(room),{socket:b}=join(room);room.tick(1/60);return {room,a,b,e};}
test('gestures replicate with identical timing, expire, and never persist or edit terrain',t=>{
 const {room,a,b,e}=setup(t),before=room.world.blocks.slice(),inventory=e.inventory.slice();
 input(room,a,0,{type:'emote',name:'wave'});room.broadcast();
 const gesture=s=>s.messages.at(-1).entities.find(x=>x.id===e.id).ge;
 assert.equal(gesture(a).kind,'wave');assert.deepEqual(gesture(a),gesture(b));
 room.save();assert.equal(JSON.parse(readFileSync(room.file)).players[0][1].gesture,undefined);
 for(let i=0;i<150;i++)room.tick(1/60);
 assert.equal(e.gesture,null);assert.deepEqual(room.world.blocks,before);assert.deepEqual(e.inventory,inventory);
});
test('pointing uses observed visible blocks; removed targets and movement interrupt',t=>{
 const {room,a,e}=setup(t),obs=describeWorld(room,e,a),pos=obs.pointableBlocks[0].pos;
 e.actions.pointAt(pos);room.tick(1/60);assert.equal(e.gesture.kind,'point');
 room.world.set(pos.x,pos.y,pos.z,0);room.tick(1/60);assert.equal(e.gesture,null);
 e.actions.emote('nod');room.tick(1/60);assert.equal(e.gesture.kind,'nod');
 e.actions.move({x:1,y:0,z:0});room.tick(1/60);assert.equal(e.gesture,null);
 e.actions.pointAt({x:0,y:47,z:0});room.tick(1/60);assert.equal(e.gesture,null);
 assert.throws(()=>e.actions.emote('dance'));assert.throws(()=>e.actions.pointAt({x:1.2,y:0,z:0}));
});
test('model gesture proposals cannot grant block edits or select unobserved targets',()=>{
 const pos={x:1,y:2,z:3},obs={pointableBlocks:[{pos}],reachableBlocks:[]};
 const parse=action=>parseCompanionReply(JSON.stringify({message:'Here',action}),'talk',obs);
 assert.equal(parse({type:'pointAt',pos}).action.type,'pointAt');assert.equal(parse({type:'emote',name:'nod'}).action.name,'nod');
 assert.throws(()=>parse({type:'pointAt',pos:{x:2,y:2,z:3}}));assert.throws(()=>parse({type:'emote',name:'dance'}));
 assert.throws(()=>parse({type:'placeBlock',pos,blockId:9}));
});
test('gesture task verifies completion and cancellation through simulation',t=>{
 const {room,e}=setup(t),task=new GestureTask(room,e,{type:'emote',name:'nod'});
 for(let i=0;i<110;i++){room.tick(1/60);task.tick();}
 assert.equal(task.result.ok,true);
 const stopped=new GestureTask(room,e,{type:'emote',name:'wave'});room.tick(1/60);stopped.tick();stopped.cancel();room.tick(1/60);
 assert.equal(e.gesture,null);assert.equal(stopped.result.ok,false);
});
test('pose points the arm toward target and reduced motion holds gestures steady',()=>{
 const head=new THREE.Group(),arm=new THREE.Group(),e={position:{x:0,y:0,z:0},gesture:{kind:'point',pos:{x:0,y:2,z:3},startedAt:0,endsAt:4}};
 animateGesture(e,1,false,head,arm,0);
 const actual=new THREE.Vector3(0,-1,0).applyQuaternion(arm.quaternion),expected=new THREE.Vector3(.1,1.4,3.5).normalize();
 assert.ok(actual.distanceTo(expected)<1e-10);
 e.gesture.kind='wave';animateGesture(e,1,true,head,arm,0);const first=arm.rotation.z;animateGesture(e,2,true,head,arm,0);assert.equal(first,arm.rotation.z);
});
