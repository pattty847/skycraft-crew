import test from 'node:test';
import assert from 'node:assert/strict';
import { bindDesktopInput, PLACE_REPEAT_MS } from '../src/desktop-input.js';
import { FakeElement, fire, stubGlobals } from './helpers.js';

function setup(t, {overview = false} = {}) {
  const document = new FakeElement();
  stubGlobals(t, {document});
  const canvas = new FakeElement(), rotations = [], notices = [], hints = [], rig = {overview, orbit:(x,y)=>rotations.push([x,y])};
  canvas.requestPointerLock = () => {
    document.pointerLockElement = canvas;
    fire(document,'pointerlockchange');
    return Promise.resolve();
  };
  document.exitPointerLock = () => {
    document.pointerLockElement = null;
    fire(document,'pointerlockchange');
  };
  const input = bindDesktopInput(canvas,rig,text=>notices.push(text),show=>hints.push(show));
  const down = button => fire(canvas,'mousedown',{button,clientX:100,clientY:100});
  const up = button => fire(document,'mouseup',{button});
  return {canvas,document,input,rig,rotations,notices,hints,down,up};
}

test('the first click only captures the mouse; then left mines and the mouse looks', t => {
  const {canvas,document,input,rotations,hints,down,up} = setup(t);
  down(0);
  assert.equal(document.pointerLockElement,canvas);
  assert.equal(input.isMining(),false,'the capturing click does not mine');
  assert.equal(input.takePlace(),false);
  assert.deepEqual(hints,[false],'capturing hides the click hint');
  up(0);
  fire(document,'mousemove',{movementX:2000,movementY:-12,clientX:100,clientY:100});
  assert.deepEqual(rotations,[[2000,-12]],'relative movement is not bounded by screen edges');
  down(0);assert.equal(input.isMining(),true);
  up(0);assert.equal(input.isMining(),false);
  assert.equal(document.pointerLockElement,canvas,'releasing mine keeps the capture');
});

test('right click places once, repeats while held, and leaves left mining alone', t => {
  const {input,down,up} = setup(t);
  down(0);up(0);          // capture
  down(0);down(2);
  const now = performance.now();
  assert.equal(input.takePlace(now),true,'a click places');
  assert.equal(input.takePlace(now),false,'once');
  assert.equal(input.takePlace(now+PLACE_REPEAT_MS+1),true,'holding repeats');
  up(2);
  assert.equal(input.takePlace(now+PLACE_REPEAT_MS*3),false,'release stops');
  assert.equal(input.isMining(),true,'left is still held');
});

test('Escape (losing the capture) cancels mining and held placing', t => {
  const {document,input,hints,down} = setup(t);
  down(0);down(0);down(2);input.takePlace();
  document.pointerLockElement=null;fire(document,'pointerlockchange');
  assert.equal(input.isMining(),false);
  assert.equal(input.takePlace(performance.now()+PLACE_REPEAT_MS*2),false);
  assert.deepEqual(hints,[false,true],'losing the capture brings the hint back');
});

test('a capture granted after switching to island view is handed back', t => {
  const {canvas,document,rig,down} = setup(t);
  canvas.requestPointerLock = () => undefined;
  down(0);
  rig.overview = true;
  document.pointerLockElement=canvas;fire(document,'pointerlockchange');
  assert.equal(document.pointerLockElement,null);
});

test('island view drags to orbit without capturing', t => {
  const {document,input,rotations,down,up} = setup(t,{overview:true});
  down(0);
  assert.equal(document.pointerLockElement,undefined);
  fire(document,'mousemove',{clientX:110,clientY:96});
  assert.deepEqual(rotations,[[10,-4]]);
  assert.equal(input.isMining(),false);
  up(0);
});

test('when capture is refused, right-drag looks and left still mines', t => {
  const {canvas,document,input,rotations,notices,hints,down,up} = setup(t);
  canvas.requestPointerLock = () => { throw Error('Unavailable'); };
  down(0);up(0);
  assert.equal(notices.length,1);
  assert.deepEqual(hints,[false],'the fallback needs no click hint');
  down(2);
  fire(document,'mousemove',{clientX:120,clientY:95});
  assert.deepEqual(rotations,[[20,-5]]);
  up(2);down(0);
  assert.equal(input.isMining(),true);
  fire(document,'mousemove',{clientX:140,clientY:95});
  assert.equal(rotations.length,1,'moving without right held does not look');
});

test('a refused capture (say, right after Esc) asks for another click; only three in a row fall back to drag-look', async t => {
  const {canvas,document,notices,hints,down,up} = setup(t);
  const refuse = () => { fire(document,'pointerlockerror'); return Promise.reject(Error('refused')); };
  canvas.requestPointerLock = refuse;
  down(0);up(0);await Promise.resolve();
  assert.deepEqual(notices,['Click again to look around.'],'one refusal, counted once');
  assert.deepEqual(hints,[],'still waiting for a click, not in the fallback');
  canvas.requestPointerLock = () => { document.pointerLockElement = canvas; fire(document,'pointerlockchange'); return Promise.resolve(); };
  down(0);up(0);assert.equal(document.pointerLockElement,canvas,'the next click captures');
  document.exitPointerLock();canvas.requestPointerLock = refuse;
  for (let i = 0; i < 3; i++) { down(0);up(0);await Promise.resolve(); }
  assert.equal(notices.at(-1),'Mouse capture unavailable. Hold right mouse and drag to look.');
  assert.equal(hints.at(-1),false);
});
