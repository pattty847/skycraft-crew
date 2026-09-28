import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInput } from '../src/input.js';
import { FakeElement, fire, stubGlobals } from './helpers.js';

const el = () => new FakeElement({left:0,top:0,width:108,height:108});
// A page with the touch controls; the document and window listeners are stubbed for this test.
function page(t, document = el()) {
  stubGlobals(t, {document, addEventListener: () => {}});
  return {joystick:el(),stick:el(),jump:el(),place:el(),break:el(),help:{open:false}};
}
const pointer = (surface, type, id, x = 50, y = 50) => fire(surface, type, {pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y});

test('a quick tap on the world jumps and does not release a separate held Mine button', t => {
  const ui = page(t), canvas = el(), calls = [];let jumps = 0;
  const entity = {position:{x:0,y:0,z:0},actions:{move(){},jump(){jumps++;},breakBlock(pos){calls.push(pos);}}};
  const input = bindInput({canvas,entity,ui,onPlay(){},getTarget:()=>({pos:{x:1,y:1,z:1}}),rig:{overview:false,movement:()=>({x:0,y:0,z:0})}});
  pointer(ui.break,'pointerdown',10);
  pointer(canvas,'pointerdown',20);
  pointer(canvas,'pointerup',20);
  input.tick();
  assert.equal(calls.length,1, 'independent mine touch remains held');
  assert.equal(jumps,1, 'the quick tap jumped');
  pointer(ui.break,'pointercancel',10);
  input.tick();
  assert.equal(calls.length,1, 'cancelling the mine touch ends mining');
});

test('typing in island chat stops held mining and emits no movement',t=>{
 const document=el();document.activeElement={closest:()=>true};const ui=page(t,document),calls=[];
 const entity={position:{x:0,y:0,z:0},actions:{move:dir=>calls.push(dir),breakBlock(){throw Error('Typing must not mine');}}};
 const input=bindInput({canvas:el(),entity,ui,onPlay(){},getTarget:()=>({pos:{x:1,y:1,z:1}}),rig:{overview:false,movement:()=>({x:1,y:0,z:0})}});
 pointer(ui.break,'pointerdown',10);input.tick();assert.deepEqual(calls,[{x:0,y:0,z:0}]);
});

test('two fingers on the world pinch the camera; one finger keeps orbiting',t=>{
 const ui=page(t),canvas=el(),zooms=[],orbits=[];
 bindInput({canvas,entity:{position:{x:0,y:0,z:0},actions:{move(){}}},ui,onPlay(){},getTarget:()=>null,rig:{overview:false,movement:()=>({x:0,y:0,z:0}),zoom:d=>zooms.push(d),orbit:(x,y)=>orbits.push([x,y])}});
 const at=(type,id,x,y)=>pointer(canvas,type,id,x,y);
 at('pointerdown',1,100,100);at('pointermove',1,110,100);assert.deepEqual(orbits,[[10,0]]);
 at('pointerdown',2,200,100);at('pointermove',2,300,100);
 assert.equal(orbits.length,1,'no orbit while pinching');assert.ok(zooms.at(-1)<0,'spreading fingers zooms in');
 at('pointermove',2,150,100);assert.ok(zooms.at(-1)>0,'pinching together zooms out');
 at('pointerup',2,150,100);at('pointermove',1,120,100);assert.deepEqual(orbits.at(-1),[10,0],'the remaining finger orbits again');
});

test('sliding a held Mine button turns the camera while it keeps mining',t=>{
 const ui=page(t),orbits=[],mined=[];
 const input=bindInput({canvas:el(),entity:{position:{x:0,y:0,z:0},actions:{move(){},breakBlock:p=>mined.push(p)}},ui,onPlay(){},getTarget:()=>({pos:{x:1,y:1,z:1}}),rig:{overview:false,movement:()=>({x:0,y:0,z:0}),orbit:(x,y)=>orbits.push([x,y])}});
 const at=(type,x,y)=>pointer(ui.break,type,7,x,y);
 at('pointerdown',50,50);input.tick();at('pointermove',80,40);input.tick();
 assert.deepEqual(orbits,[[30,-10]]);assert.equal(mined.length,2,'mining continued through the slide');
 at('pointerup',80,40);input.tick();assert.equal(mined.length,2,'lifting the finger stops mining');
});
