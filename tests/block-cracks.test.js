import test from 'node:test';
import assert from 'node:assert/strict';
import { crackStage } from '../src/block-cracks.js';
import { B, BLOCKS } from '../src/blocks.js';
test('crack stage follows mining progress and hides when idle',()=>{
 const h=BLOCKS[B.STONE].hardness,at=elapsed=>crackStage({pos:{x:0,y:0,z:0},id:B.STONE,elapsed});
 assert.equal(crackStage(null),-1);
 assert.deepEqual([0,.21,.41,.61,.81,.999].map(f=>at(f*h)),[0,1,2,3,4,4]);
});
