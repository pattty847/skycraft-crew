import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { blockAccess } from '../src/block-access.js';

const entity = {position:{x:30.5,y:23,z:30.5}};
test('visible tops remain mineable when neighboring terrain hides the block center',()=>{
  const world=new World();
  for(let x=30;x<=35;x++)world.set(x,22,30,2);
  assert.equal(blockAccess(world,entity,{x:35,y:22,z:30}).ok,true);
});
test('access reports actual distance separately from an obstructed path',()=>{
  const world=new World();world.set(38,24,30,2);
  assert.equal(blockAccess(world,entity,{x:38,y:24,z:30}).reason,'distance');
  world.set(33,24,30,2);
  for(let y=23;y<=26;y++)for(let z=29;z<=32;z++)world.set(32,y,z,3);
  assert.equal(blockAccess(world,entity,{x:33,y:24,z:30}).reason,'blocked');
});
