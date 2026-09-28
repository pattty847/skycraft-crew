import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Entity } from '../src/entity.js';
import { MovementPrediction } from '../src/prediction.js';
const frame=sequence=>({sequence,actions:[{type:'move',dir:{x:1,y:0,z:0}}]});
test('movement begins before a server update and replays only unacknowledged inputs',()=>{
 const world=new World(),entity=new Entity('p',{x:10,y:10,z:10},()=>{}),prediction=new MovementPrediction(world,entity);
 prediction.step(frame(0));const acknowledged={...entity,position:{...entity.position},velocity:{...entity.velocity},inventory:Array.from(entity.inventory)};
 prediction.step(frame(1));const expected={...entity.position};assert.ok(expected.x>10);
 prediction.reconcile(acknowledged,0);assert.deepEqual(entity.position,expected);assert.equal(prediction.frames.length,1);
 assert.equal(world.revision,0);
});
test('prediction cannot walk through solid blocks and teleport corrections snap',()=>{
 const world=new World();for(let y=0;y<4;y++)world.set(11,y,10,3);
 const e=new Entity('p',{x:10.5,y:1,z:10.5},()=>{}),p=new MovementPrediction(world,e);for(let n=0;n<20;n++)p.step(frame(n));assert.ok(e.position.x<11);
 p.reconcile({...e,position:{x:30,y:20,z:30},velocity:{x:0,y:0,z:0},inventory:Array.from(e.inventory)},19);assert.deepEqual(p.view(.016).position,{x:30,y:20,z:30});
});
