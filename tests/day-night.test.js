import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePhase, DAY_SECONDS, NIGHT_SECONDS } from '../server/room.js';
test('a day lasts about 10 minutes and a night about 4',()=>{
 let phase=.24,was=null,run=0;const days=[],nights=[];
 for(let t=0;t<(DAY_SECONDS+NIGHT_SECONDS)*4;t+=.25){
  const night=Math.sin(phase*Math.PI*2)<-.2;
  if(was!==null&&night!==was){(was?nights:days).push(run);run=0;}
  was=night;run+=.25;phase=advancePhase(phase,.25);
 }
 for(const d of days.slice(1))assert.ok(Math.abs(d-DAY_SECONDS)<2,`day ${d}s`);
 for(const n of nights)assert.ok(Math.abs(n-NIGHT_SECONDS)<2,`night ${n}s`);
 assert.equal(DAY_SECONDS,600);assert.equal(NIGHT_SECONDS,240);
});
