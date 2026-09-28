import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, next, closed } from './helpers.js';
test('unjoined sockets cannot write the trace, floods are disconnected, and pages carry security headers',async t=>{
 const {dir:directory,port,open}=await startServer(t);
 const code=s=>closed(s).then(c=>c.code);
 // Before joining: junk closes the socket at once, with no trace line and no notice.
 for(const junk of ['null','{"type":"day"}','not json']){const s=await open(),shut=code(s);let replied=false;s.on('message',()=>{replied=true;});s.send(junk);assert.equal(await shut,1008);assert.equal(replied,false);}
 await new Promise(r=>setTimeout(r,1500));// the trace flushes every second
 const traceDir=join(directory,'trace'),lines=existsSync(traceDir)?readdirSync(traceDir).flatMap(f=>readFileSync(join(traceDir,f),'utf8').trim().split('\n')).filter(Boolean).map(l=>JSON.parse(l)):[];
 assert.deepEqual(lines.filter(r=>r.type==='handle.error'),[],'unjoined junk wrote nothing');
 // After joining: a burst far beyond the budget is disconnected.
 const player=await open(),welcome=next(player,'welcome');player.send(JSON.stringify({type:'join'}));await welcome;
 const kicked=code(player);for(let i=0;i<300;i++)player.send(JSON.stringify({type:'save'}));assert.equal(await kicked,1008);
 const page=await fetch(`http://127.0.0.1:${port}/health`);
 assert.equal(page.headers.get('x-content-type-options'),'nosniff');assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
