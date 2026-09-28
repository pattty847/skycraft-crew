import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, MODE_KEYS, modeMenu, policyFor, skillFor } from '../server/skills/index.js';
import { parseCompanionReply } from '../server/chat.js';
test('skills are discovered from files and each action type has exactly one owner',()=>{
 const names=SKILLS.map(s=>s.name);assert.equal(new Set(names).size,names.length);
 for(const name of ['approach','follow','gesture','gather','mine-trip'])assert.ok(names.includes(name),name);
 const types=SKILLS.flatMap(s=>s.types);assert.equal(new Set(types).size,types.length);
 assert.equal(skillFor('follow').name,'follow');assert.equal(skillFor('breakBlock'),null);assert.equal(skillFor('teleport'),null);
});
test('modes and the model policy are assembled from the registry',()=>{
 assert.deepEqual(modeMenu().map(m=>m.key),MODE_KEYS);assert.equal(MODE_KEYS[0],'auto');assert.ok(MODE_KEYS.includes('talk'));assert.ok(!MODE_KEYS.includes('mine'));
 const talk=policyFor('talk');assert.match(talk,/"type":"approach"/);assert.match(talk,/"type":"follow"/);assert.match(talk,/pointableBlocks/);assert.doesNotMatch(talk,/"type":"gather"/);
 assert.match(policyFor('gather'),/"type":"gather"/);assert.doesNotMatch(policyFor('gather'),/"type":"breakBlock"/);
});
test('Auto offers every on-request skill but never raw block mining',()=>{
 const auto=policyFor('auto');for(const type of ['approach','follow','emote','gather','build','mine-trip'])assert.match(auto,new RegExp(`"type":"${type}"`),type);
 assert.doesNotMatch(auto,/breakBlock/);
 assert.throws(()=>parseCompanionReply('{"message":"Mining","action":{"type":"breakBlock","pos":{"x":1,"y":2,"z":3}}}','auto',{reachableBlocks:[{pos:{x:1,y:2,z:3}}]}),/not available/);
});
