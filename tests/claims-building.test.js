import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { Claims } from '../server/claims.js';
import { planBuild } from '../server/building/planner.js';
import { BuildTask } from '../server/building/build-task.js';
import { forModel } from '../server/observation.js';
import { flatWorld,runTask } from './helpers.js';
test('Claude building planner and running build both respect real claims',()=>{
 const world=flatWorld({x:[0,20],z:[0,20]});
 const simulation=new Simulation(world),room={world,simulation,extend(){},save(){},sendAll(){}},claims=new Claims(room),owner=simulation.spawn('owner'),builder=simulation.spawn('claude-companion');owner.position={x:5.5,y:1,z:5.5};builder.position={x:8.5,y:1,z:10.5};builder.grounded=true;
 const args={blueprint:'stairs',anchor:{x:10,y:1,z:10},facing:'north',params:{height:2,width:1}},plan=planBuild(room,builder,args);
 claims.receive(owner,{operation:'create',name:'House',min:{x:9,y:1,z:8},max:{x:12,y:6,z:12},protectPlayers:true});
 assert.throws(()=>planBuild(room,builder,args),/protected/);
 const before=world.blocks.slice(),task=new BuildTask(room,builder,plan);
 runTask(room,task,{limit:600});
 assert.deepEqual(world.blocks,before);assert.equal(task.result?.ok,false);
 assert.deepEqual(forModel({claims:claims.items,reachableBlocks:[],pointableBlocks:[]}).claims,claims.items);
});
