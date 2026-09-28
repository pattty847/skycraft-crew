import test from 'node:test';
import assert from 'node:assert/strict';
import {World,generateWorld} from '../src/world.js';
import {Simulation} from '../src/simulation.js';
import {findApproachPath,canTraverse,nearPlayer,PathSearch,pointGoal,standable} from '../server/navigation/pathfinder.js';
import {ApproachTask,NavigateTask} from '../server/navigation/approach.js';
function floor(){const w=new World();for(let x=5;x<20;x++)for(let z=5;z<20;z++)w.set(x,0,z,3);return w;}
function fixture(world,from,to){const simulation=new Simulation(world),e=simulation.spawn('codex-companion'),p=simulation.spawn('player');e.position={...from};p.position={...to};e.grounded=p.grounded=true;return {world,simulation,e,p,task:new ApproachTask({world,simulation},e,p.id)};}
function run(f,limit=2400){for(let i=0;i<limit&&!f.task.result;i++){f.task.tick(1/60);f.simulation.tick(1/60);}return f.task.result;}
test('approach walks around a wall, arrives nearby, faces the player and leaves terrain intact',()=>{
 const w=floor();for(let z=5;z<13;z++)for(let y=1;y<4;y++)w.set(11,y,z,9);
 const f=fixture(w,{x:8.5,y:1,z:9.5},{x:15.5,y:1,z:9.5}),before=w.blocks.slice();
 assert.equal(run(f)?.ok,true);assert.ok(nearPlayer(w,f.e.position,f.p.position));assert.deepEqual(w.blocks,before);
 assert.ok(f.e.direction.x*(f.p.position.x-f.e.position.x)+f.e.direction.z*(f.p.position.z-f.e.position.z)>0);
});
test('navigation can jump one-block stairs using real entity physics',()=>{
 const w=floor();for(let x=12;x<20;x++)for(let z=5;z<20;z++)w.set(x,1,z,3);
 assert.ok(canTraverse(w,{x:11.5,y:1,z:10.5},{x:12.5,y:2,z:10.5}));
 const f=fixture(w,{x:9.5,y:1,z:10.5},{x:16.5,y:2,z:10.5});assert.equal(run(f)?.ok,true);assert.ok(f.e.position.y>1.9);
});
test('no route across a void, no two-block climbing and no low-ceiling jump',()=>{
 const w=new World();w.set(5,0,5,3);w.set(12,0,5,3);assert.equal(findApproachPath(w,{x:5.5,y:1,z:5.5},{x:12.5,y:1,z:5.5}).ok,false);
 const flat=floor();flat.set(11,1,10,3);flat.set(11,2,10,3);assert.equal(canTraverse(flat,{x:10.5,y:1,z:10.5},{x:11.5,y:3,z:10.5}),false);
 flat.set(11,2,10,0);flat.set(10,3,10,3);assert.equal(canTraverse(flat,{x:10.5,y:1,z:10.5},{x:11.5,y:2,z:10.5}),false);
});
test('approach replans for a moving player and stops when the target disconnects',()=>{
 const f=fixture(floor(),{x:6.5,y:1,z:6.5},{x:17.5,y:1,z:6.5});for(let i=0;i<30;i++){f.task.tick(1/60);f.simulation.tick(1/60);}f.p.position={x:17.5,y:1,z:16.5};assert.equal(run(f)?.ok,true);assert.ok(f.task.replans>=2);
 const g=fixture(floor(),{x:6.5,y:1,z:6.5},{x:17.5,y:1,z:6.5});g.simulation.entities.delete('player');assert.equal(run(g).ok,false);
});
test('terrain edits invalidate the route; cancellation emits no later movement',()=>{
 const w=floor(),f=fixture(w,{x:7.5,y:1,z:7.5},{x:17.5,y:1,z:7.5});f.task.tick(1/60);f.simulation.tick(1/60);
 for(let z=5;z<20;z++)for(let y=1;y<5;y++)w.set(11,y,z,9);assert.equal(run(f)?.ok,false);
 const g=fixture(floor(),{x:7.5,y:1,z:7.5},{x:17.5,y:1,z:7.5});g.task.cancel();g.simulation.tick(1/60);const pos={...g.e.position};g.task.tick(1/60);g.simulation.tick(1/60);assert.equal(g.e.position.x,pos.x);
});
test('generated island supports an actual approach without falling',()=>{
 const f=fixture(generateWorld(),{x:36.5,y:22,z:39.5},{x:30.5,y:24,z:36.5});
 for(let i=0;i<60;i++)f.simulation.tick(1/60);assert.equal(run(f)?.ok,true);
});

const ground=(w,x,z)=>{for(let y=46;y>0;y--){const p={x:x+.5,y,z:z+.5};if(standable(w,p)&&![5,6].includes(w.get(x,y-1,z)))return p;}};
function walk(world,from,goal,options){const simulation=new Simulation(world),e=simulation.spawn('walker');e.position={...from};e.grounded=true;const task=new NavigateTask({world,simulation},e,goal,options);let worst=0;
 for(let i=0;i<6000&&!task.result;i++){const t=performance.now();task.tick(1/60);worst=Math.max(worst,performance.now()-t);simulation.tick(1/60);}return {task,e,worst};}
test('route search is incremental: each step does bounded work and the result matches a single pass',()=>{
 const w=generateWorld(),from=ground(w,34,38),goal=pointGoal(ground(w,80,30),.6);
 const whole=new PathSearch(w,from,goal).step(),parts=new PathSearch(w,from,goal);let steps=0,result=null;
 while(!(result=parts.step({maxExpansions:25}))){steps++;assert.ok(parts.expanded<=25*steps);}
 assert.equal(result.ok,true);assert.ok(steps>3);assert.deepEqual(result.path,whole.path);
});
test('walking to Clover Rise crosses the plank bridge without a long tick or terrain change',()=>{
 const w=generateWorld(),before=w.blocks.slice(),{task,e,worst}=walk(w,ground(w,34,38),{type:'point',pos:ground(w,80,30),radius:.6},{timeout:90});
 assert.equal(task.result.ok,true);assert.ok(e.position.x>75);assert.deepEqual(w.blocks,before);assert.ok(worst<100,`worst navigation tick ${worst.toFixed(1)} ms`);
});
test('running jumps cross two-block gaps but never a void',()=>{
 const w=new World();for(const x of [5,6,9,10])w.set(x,0,5,3);
 assert.equal(canTraverse(w,{x:6.5,y:1,z:5.5},{x:9.5,y:1,z:5.5},true),true);assert.equal(canTraverse(w,{x:6.5,y:1,z:5.5},{x:9.5,y:1,z:5.5}),false);
 const {task,e}=walk(w,{x:5.5,y:1,z:5.5},{type:'point',pos:{x:10.5,y:1,z:5.5}});assert.equal(task.result.ok,true);assert.ok(e.position.x>10);
 const stones=generateWorld(),trip=walk(stones,ground(stones,84,40),{type:'point',pos:ground(stones,86,82),radius:.6},{timeout:90});assert.equal(trip.task.result.ok,true);
});
test('an edit far from the route does not trigger a replan; an edit on it does',()=>{
 const w=floor(),f=fixture(w,{x:6.5,y:1,z:10.5},{x:18.5,y:1,z:10.5});for(let i=0;i<5;i++){f.task.tick(1/60);f.simulation.tick(1/60);}
 const plans=f.task.replans;w.set(6,1,18,9);for(let i=0;i<5;i++){f.task.tick(1/60);f.simulation.tick(1/60);}assert.equal(f.task.replans,plans);
 for(let z=5;z<20;z++)if(z!==15)for(let y=1;y<4;y++)w.set(12,y,z,9);assert.equal(run(f)?.ok,true);assert.ok(f.task.replans>plans);
});

test('a companion can reach a player standing on a one-block step',()=>{
 const w=floor();for(let x=14;x<17;x++)for(let z=9;z<12;z++)w.set(x,1,z,9);
 const f=fixture(w,{x:6.5,y:1,z:10.5},{x:15.5,y:2,z:10.5});assert.equal(run(f)?.ok,true);
});
