import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { B } from '../src/blocks.js';
import { observe, forModel, describeScene, nameStructures } from '../server/observation.js';
import { leaks, conversation, VOICE_POLICY } from '../server/voice.js';
import { needsFor } from '../server/skills/index.js';
test('leak detection finds the machinery and leaves ordinary talk alone',()=>{
 assert.deepEqual(leaks('On my way! The bridge looks great.'),[]);
 assert.deepEqual(leaks('I can see trees around 20,24,33'),['coordinates']);
 assert.ok(leaks('From my latest observation, S1 is west').includes('observation'));
 assert.ok(leaks('Switch me to Build mode').includes('mode'));
 assert.ok(leaks('Confirmed: built').includes('receipt'));
});
test('what the model reads carries names and distances, not raw positions',()=>{
 const world=generateWorld(),simulation=new Simulation(world),room={world,simulation,phase:.3};
 const me=simulation.spawn('claude-companion'),player=simulation.spawn('player');me.position={x:80.5,y:25,z:38.5};player.position={x:80.5,y:25,z:40.5};
 const o=observe(room,me,player,{names:{'claude-companion':'Claude'}}),scene=describeScene(o),model=forModel(o,{needs:needsFor('auto')});
 assert.deepEqual(leaks(scene.replace(/ \(S\d\)/g,'')),[],scene);// ids stay available for build actions
 assert.match(scene,/Your nook \(S1\), 5 blocks tall/);assert.match(scene,/south/);
 assert.equal(model.position,undefined);assert.equal(model.you.position,undefined);assert.equal(model.requester.position,undefined);
 assert.ok(model.structures.every(s=>s.from===undefined&&s.name));assert.ok(Object.values(model.pointableBlocks).flat().length>0,'block lists keep their cells for skills');
 assert.ok(o.you.position&&o.structures[0].from,'validation keeps the full observation');
});
test('structures take a protected area’s name, a landmark’s, or a plain description',()=>{
 const s=[{kind:'building',from:{x:10,z:10},to:{x:14,z:14}},{kind:'walkway',from:{x:45,z:36},to:{x:60,z:40}},{kind:'building',from:{x:83,z:32},to:{x:86,z:35}},{kind:'building',from:{x:0,z:0},to:{x:2,z:2}}];
 const named=nameStructures(s,[{name:'Sam’s house',min:{x:9,y:0,z:9},max:{x:15,y:9,z:15}}],'claude-companion').map(x=>x.name);
 assert.deepEqual(named,['“Sam’s house”','the plank bridge between Origin Island and Clover Rise','your nook','a plank building']);
 assert.equal(nameStructures([s[2]],[],'codex-companion')[0].name,"Claude's nook");
});
test('history reads as conversation: receipt jargon is gone, system lines are skipped',()=>{
 const h=conversation([{kind:'system',name:'World',text:'Chat · no edits'},{kind:'user',name:'Sam',text:'hi'},{kind:'action',name:'World',text:'Confirmed: Handed you 5 wood; your inventory confirms it.'}]);
 assert.deepEqual(h,[{who:'Sam',said:'hi'},{who:'(what happened)',said:'Handed you 5 wood.'}]);
 assert.match(VOICE_POLICY,/Never mention observations/);
});
