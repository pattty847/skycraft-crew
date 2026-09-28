import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEntity,presenceSummary,isCompanionId } from '../src/presence.js';
test('presence distinguishes both AI companions from this player and another device',()=>{
 const entities=[{id:'abcd-1'},{id:'efgh-2'},{id:'codex-companion'},{id:'claude-companion'}];
 assert.equal(describeEntity(entities[0],'abcd-1').name,'You');assert.equal(describeEntity(entities[1],'abcd-1').name,'Player efgh');
 assert.equal(describeEntity(entities[2],'abcd-1').name,'Codex · AI');assert.equal(describeEntity(entities[3],'abcd-1').name,'Claude · AI');assert.equal(describeEntity(entities[3],'abcd-1').agent,'claude');
 assert.equal(presenceSummary(entities),'2 players · 2/2 AI companions');assert.equal(presenceSummary(entities.slice(0,1)),'1 player · 0/2 AI companions');
 assert.ok(isCompanionId('claude-companion'));assert.ok(!isCompanionId('abcd-1'));
});
