import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraRig, DEFAULT_FOV, FOV_RANGE, EYE_HEIGHT } from '../src/camera.js';
import { clampBox, chatBox } from '../src/chat-box.js';
import { FakeElement, fire as dispatch, stubGlobals, memoryStorage } from './helpers.js';
const air={get:()=>0};
const rig=()=>{const r=new CameraRig(new THREE.PerspectiveCamera(43,1,.08,520),air);r.overview=false;return r;};
test('zooming all the way in enters first person; zooming out leaves it',()=>{
 const r=rig();r.distance=3;r.zoom(-100);assert.equal(r.firstPerson,true);
 r.zoom(-100);assert.equal(r.firstPerson,true,'further zoom-in stays in first person');
 r.zoom(50);assert.equal(r.firstPerson,false);assert.ok(r.distance>=3);
 const far=rig();far.distance=10;far.zoom(-100);assert.equal(far.firstPerson,false,'one zoom step from far away only moves closer');
});
test('first person puts the camera at the eyes with its own field of view',()=>{
 const r=rig(),entity={position:{x:10,y:20,z:30}};r.setFirstPerson(true);r.update(entity,1/60);
 assert.deepEqual(r.camera.position.toArray(),[10,20+EYE_HEIGHT,30]);assert.equal(r.actualDistance,0);assert.equal(r.camera.fov,DEFAULT_FOV.first);
 r.setFov('first',500);assert.equal(r.fov.first,FOV_RANGE.max,'field of view is clamped');
 r.setFirstPerson(false);r.update(entity,1/60);assert.equal(r.camera.fov,DEFAULT_FOV.third);assert.ok(r.actualDistance>=3);
 r.overview=true;r.setFirstPerson(true);r.update(entity,1/60);assert.equal(r.camera.fov,DEFAULT_FOV.third,'the island overview keeps its framing');
});
test('the chat box stays on screen and above a minimum size',()=>{
 const view={w:1024,h:768};
 assert.deepEqual(clampBox({x:-50,y:900,w:100,h:100},view),{x:8,y:768-220-8,w:260,h:220});
 assert.deepEqual(clampBox({x:2000,y:10,w:5000,h:300},view),{x:8,y:10,w:1024-16,h:300});
});
test('dragging the chat corner resizes by exactly how far the pointer moved',t=>{
 const storage=memoryStorage(),store=storage.map;
 stubGlobals(t,{matchMedia:()=>({matches:true}),innerWidth:1600,innerHeight:1000,addEventListener(){},localStorage:storage});
 const panel=new FakeElement({left:100,top:120,width:360,height:300}),header=new FakeElement(),corner=new FakeElement();
 chatBox(panel,header,corner).collapsed(false);
 const fire=(el,type,x,y)=>dispatch(el,type,{pointerId:1,button:0,clientX:x,clientY:y,target:{closest:()=>null}});
 fire(corner,'pointerdown',460,420);fire(corner,'pointermove',490,460);fire(corner,'pointerup',490,460);
 assert.deepEqual(JSON.parse(store.get('sky:chat-box')),{x:100,y:120,w:390,h:340},'the corner grows by the pointer distance, not by where the panel sits');
 fire(header,'pointerdown',200,130);fire(header,'pointermove',260,150);fire(header,'pointerup',260,150);
 assert.deepEqual(JSON.parse(store.get('sky:chat-box')),{x:160,y:140,w:390,h:340},'the header moves the box by the pointer distance');
});
