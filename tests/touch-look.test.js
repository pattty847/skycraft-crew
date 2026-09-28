import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchLook, HOLD_MS, HOLD_SLOP } from '../src/touch-look.js';
test('a quick still tap is a tap, and does not mine',()=>{
 const look=new TouchLook();look.down(1,100,100,0);
 assert.equal(look.mining(HOLD_MS/2).active,false);assert.equal(look.up(1,HOLD_MS/2),true);
});
test('holding still mines; dragging while holding keeps mining and turns the camera',()=>{
 const look=new TouchLook();look.down(1,100,100,0);
 assert.deepEqual(look.mining(HOLD_MS),{active:true,started:true});
 assert.deepEqual(look.move(1,160,90),{orbit:[60,-10]},'the held finger still turns the camera');
 assert.deepEqual(look.mining(HOLD_MS+500),{active:true,started:false},'and keeps mining after moving');
 assert.equal(look.up(1,HOLD_MS+600),false,'a hold is not a tap');assert.equal(look.mining(HOLD_MS+700).active,false);
});
test('a swipe only looks: it never mines and is not a tap',()=>{
 const look=new TouchLook();look.down(1,100,100,0);
 look.move(1,100+HOLD_SLOP+1,100);assert.equal(look.mining(HOLD_MS*4).active,false);
 assert.equal(look.up(1,50),false);
});
test('small jitter while holding still counts as a hold',()=>{
 const look=new TouchLook();look.down(1,100,100,0);look.move(1,100+HOLD_SLOP-2,100);
 assert.equal(look.mining(HOLD_MS).active,true);
});
test('two fingers pinch to zoom, never mine, and the finger left behind only looks',()=>{
 const look=new TouchLook();look.down(1,100,100,0);look.down(2,200,100,10);
 assert.deepEqual(look.move(2,250,100),{zoom:-50});assert.equal(look.mining(HOLD_MS*4).active,false);
 assert.equal(look.up(2,20),false,'lifting a pinch finger is not a tap');
 assert.deepEqual(look.move(1,110,100),{orbit:[10,0]});assert.equal(look.mining(HOLD_MS*8).active,false);
});
