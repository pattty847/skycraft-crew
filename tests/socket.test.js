import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, next, closed } from './helpers.js';
test('real WebSocket clients share day state, crafting and reconnect identity',async t=>{
 const server=await startServer(t);
 async function connect(token){const socket=await server.open();const welcome=next(socket,'welcome');socket.send(JSON.stringify({type:'join',token}));return {socket,welcome:await welcome};}
 const a=await connect(),b=await connect();assert.notEqual(a.welcome.you,b.welcome.you);
 // A state broadcast already in flight can arrive first, so wait for the one that shows the change.
 const target=a.welcome.phase<.5?.76:.24,flipped=m=>Math.abs(m.phase-target)<.02;
 const stateA=next(a.socket,'state',{where:flipped}),stateB=next(b.socket,'state',{where:flipped});a.socket.send(JSON.stringify({type:'day'}));
 const [sa,sb]=await Promise.all([stateA,stateB]);assert.ok(Math.abs(sa.phase-sb.phase)<.001,'both players see the same time of day');assert.equal(sa.entities.filter(e=>!e.id.endsWith('-companion')).length,2);assert.ok(sa.entities.some(e=>e.id==='claude-companion'),'Claude lives on the island from the start');
 const planks=m=>m.entities.find(e=>e.id===a.welcome.you)?.i?.[9];
 a.socket.send(JSON.stringify({type:'craft'}));const crafted=await next(a.socket,'state',{where:m=>planks(m)!==24});assert.equal(crafted.entities.find(e=>e.id===a.welcome.you).i[9],28);
 // Reconnect only after the server has seen the leave: a join that beats it replaces the open
 // tab and restores the last save instead of the live inventory.
 a.socket.close();await closed(a.socket);
 for(let i=0;i<100&&(await (await fetch(`http://127.0.0.1:${server.port}/health`)).json()).players!==1;i++)await new Promise(r=>setTimeout(r,20));
 const again=await connect(a.welcome.token);assert.equal(again.welcome.you,a.welcome.you);assert.equal(again.welcome.entities.find(e=>e.id===again.welcome.you).i[9],28);
 await assert.rejects(()=>server.open({origin:'https://untrusted.example'}),/closed before opening/,'a foreign origin is refused');
});
