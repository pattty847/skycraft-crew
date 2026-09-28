import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Room } from '../server/room.js';
import { Access } from '../server/access.js';
import { MissionDeliverTask } from '../server/missions/deliver-task.js';
import { B } from '../src/blocks.js';
import { STOCKPILE_POSITION } from '../server/stockpile.js';

const socket=()=>({readyState:1,messages:[],send(raw){this.messages.push(JSON.parse(raw));}});
function setup(t){
 const dir=mkdtempSync(join(tmpdir(),'sky-missions-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const room=new Room(dir),a=socket(),b=socket(),poster=room.connect(a),helper=room.connect(b);
 room.access=new Access(room);const traces=[];room.trace=(type,fields)=>traces.push({type,...fields});
 poster.inventory[B.WOOD]=20;poster.inventory[B.CLAY]=20;
 return {room,a,b,poster,helper,traces};
}
const post=(room,poster,{count=3,reward=6,id=B.WOOD,hours=2}={})=>room.missions.post(poster,{type:'mission-post',title:'Supply wood',objective:{type:'deliver',blockId:id,count},reward:{blockId:B.CLAY,count:reward},hours});

test('mission escrow, refunds, expiry and strict posting limits conserve inventory',t=>{
 const {room,poster,helper,traces}=setup(t);
 const first=post(room,poster);assert.equal(poster.inventory[B.CLAY],14);assert.equal(first.escrow,6);
 room.missions.cancel(poster,first.id);assert.equal(poster.inventory[B.CLAY],20);assert.equal(first.escrow,0);
 let clock=Date.now();room.missions.now=()=>clock;
 const expiring=post(room,poster,{hours:1});clock+=3600e3+1;room.missions.expire();
 assert.equal(expiring.status,'expired');assert.equal(poster.inventory[B.CLAY],20);
 assert.throws(()=>room.missions.post(poster,{type:'mission-post',title:'bad',objective:{type:'deliver',blockId:B.WOOD,count:1},reward:{blockId:B.CLAY,count:1},hours:1,extra:1}),/fields/);
 assert.throws(()=>room.missions.post(poster,{type:'mission-post',title:'bad',objective:{type:'deliver',blockId:'__proto__',count:1},reward:{blockId:B.CLAY,count:1},hours:1}),/valid delivery/);
 room.access.markGuest(helper.id);assert.throws(()=>post(room,helper),/members/);
 post(room,poster);post(room,poster);post(room,poster);assert.throws(()=>post(room,poster),/limit/);
 assert(traces.some(x=>x.type==='mission.refused'&&x.level==='warn'));
});

test('postdated deposit receipts advance one mission at a time and split escrow by contribution',t=>{
 const {room,poster,helper,traces}=setup(t),board=room.missions;
 poster.position={...STOCKPILE_POSITION};helper.position={...STOCKPILE_POSITION};
 helper.inventory[B.WOOD]=4;poster.inventory[B.WOOD]=20;
 assert(room.stockpile.transfer(helper,'deposit',B.WOOD,1));
 const m=post(room,poster,{count:3,reward:7});assert.equal(m.progress.count,0);
 assert(room.stockpile.transfer(helper,'deposit',B.WOOD,1));assert.equal(m.progress.count,1);
 assert(room.stockpile.transfer(poster,'deposit',B.WOOD,2));
 assert.equal(m.status,'done');assert.equal(helper.inventory[B.CLAY],2);assert.equal(poster.inventory[B.CLAY],18);
 assert.deepEqual(m.payouts.map(p=>p.count),[2,5]);assert(traces.some(x=>x.type==='mission.done'&&x.payouts.length===2));
 const next=post(room,poster,{count:2,reward:2});assert.equal(next.progress.count,0);
 assert(room.stockpile.transfer(helper,'deposit',B.WOOD,2));assert.equal(next.status,'done');assert.equal(helper.inventory[B.CLAY],4);
});

test('verified build order pays its credited assignee; stale cells do not',t=>{
 const {room,poster,helper}=setup(t);
 const cell={x:20,y:25,z:20,id:B.PLANKS},job={id:'abcdef12',status:'open',assignee:helper.id};
 room.jobs={find:id=>id===job.id?job:null};room.orders.items.push({id:job.id,jobId:job.id,cells:[cell],status:'open'});
 const m=room.missions.post(poster,{type:'mission-post',title:'Finish bridge',objective:{type:'build',orderId:job.id},reward:{blockId:B.CLAY,count:4},hours:2});
 job.status='done';room.missions.orderDone(job);assert.equal(m.status,'open');
 room.world.set(cell.x,cell.y,cell.z,cell.id);room.missions.orderDone(job);
 assert.equal(m.status,'done');assert.equal(helper.inventory[B.CLAY],4);
});

test('companion deposits carried mission material through actions and receives escrow',t=>{
 const {room,poster}=setup(t),bot=room.simulation.spawn('codex-companion');
 const m=post(room,poster,{count:2,reward:4});bot.position={...STOCKPILE_POSITION};bot.inventory[B.WOOD]=2;
 const task=new MissionDeliverTask(room,bot,m.id);
 for(let i=0;i<180&&!task.result;i++){task.tick(1/60);room.simulation.tick(1/60);}
 assert.equal(task.result?.ok,true,task.result?.message);assert.equal(m.status,'done');assert.equal(bot.inventory[B.CLAY],4);assert.equal(bot.inventory[B.WOOD],0);
});

test('offline poster receives refund and full inventory leaves a payable escrow balance',t=>{
 const {room,a,poster,helper}=setup(t),m=post(room,poster,{count:1,reward:3});
 const token=a.messages[0].token;room.disconnect(a);room.missions.cancel({id:poster.id},m.id);
 const reconnect=socket(),back=room.connect(reconnect,token);assert.equal(back.inventory[B.CLAY],20);
 const second=post(room,back,{count:1,reward:3});helper.inventory[B.CLAY]=65535;room.missions.deposit(helper.id,B.WOOD,1);
 assert.equal(second.status,'done');assert.equal(second.escrow,3);assert.equal(second.payouts[0].pending,3);
 helper.inventory[B.CLAY]-=3;room.missions.retryPayouts(helper.id);
 assert.equal(helper.inventory[B.CLAY],65535);assert.equal(second.escrow,0);
});
