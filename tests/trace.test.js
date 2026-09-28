import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Trace } from '../server/trace.js';
import { readRows,options,match,cutoff } from '../scripts/trace.js';
import { tempDir,startServer,next,closed } from './helpers.js';

test('trace rotates by event day, retains 14 days, caps fields and ignores IO errors',async t=>{
 const dir=tempDir(t,'sky-trace-');
 mkdirSync(join(dir,'trace'));writeFileSync(join(dir,'trace','2026-09-01.jsonl'),'old\n');
 let now=new Date('2026-09-26T23:59:59Z');const trace=new Trace(dir,{now:()=>now});
 trace.record('test.first',{who:'1234567890',msg:'x'.repeat(1000),token:'private',inviteCode:'abcdefgh'});
 now=new Date('2026-09-27T00:00:01Z');trace.record('test.second',{msg:'second'});await trace.close();
 assert.deepEqual(readdirSync(join(dir,'trace')).sort(),['2026-09-26.jsonl','2026-09-27.jsonl']);
 const first=JSON.parse(readFileSync(join(dir,'trace','2026-09-26.jsonl'),'utf8'));assert.equal(first.msg.length,512);assert.equal(first.who,'12345678');assert.equal(first.inviteCode,'abcd');assert.ok(!('token' in first));
 const bad=new Trace(join(dir,'trace','2026-09-26.jsonl'));assert.doesNotThrow(()=>bad.record('test.bad',{value:()=>{}}));await assert.doesNotReject(()=>bad.close());
});
test('trace reader spans days, filters records and skips a torn line',async t=>{
 const dir=tempDir(t,'sky-trace-read-');
 writeFileSync(join(dir,'2026-09-26.jsonl'),'{"t":"2026-09-26T23:59:00Z","type":"join.refused","level":"warn","msg":"Denied"}\n{"t":');
 writeFileSync(join(dir,'2026-09-27.jsonl'),'{"t":"2026-09-27T00:01:00Z","type":"notice","level":"info","who":"abc","msg":"Hello"}\n');
 const rows=await readRows(dir,Date.parse('2026-09-26T23:50:00Z'));assert.equal(rows.length,2);
 assert.equal(rows.filter(r=>match(r,options(['--errors']),cutoff('20m',Date.parse('2026-09-27T00:05:00Z')))).length,1);
 assert.equal(rows.filter(r=>match(r,options(['--who','abc']),0)).length,1);
});
test('real socket traces refused join and player notice',async t=>{
 const {dir,open,stop}=await startServer(t,{requireInvite:true});
 const owner=await open();owner.send(JSON.stringify({type:'join'}));await next(owner,'welcome');
 const refused=await open();refused.send(JSON.stringify({type:'join'}));await closed(refused);
 const notice=next(owner,'notice');owner.send(JSON.stringify({type:'unknown'}));await notice;
 await stop();
 const rows=await readRows(join(dir,'trace'),0);assert.ok(rows.some(r=>r.type==='join.refused'));assert.ok(rows.some(r=>r.type==='notice'&&r.msg==='Unknown message'));assert.ok(rows.some(r=>r.type==='handle.error'));
});
