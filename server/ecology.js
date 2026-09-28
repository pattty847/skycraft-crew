import { B, isPlant } from '../src/blocks.js';
import { SIZE, generateWorld, growTree, treeSpaceClear, hash, islandAt } from '../src/world.js';

const GROUND=new Set([B.GRASS,B.DIRT]);
const FORAGE=new Set([B.RED_MUSHROOM,B.BROWN_MUSHROOM,B.YELLOW_FLOWER,B.WHITE_FLOWER]);
const key=(w,p)=>w.index(p.x,p.y,p.z);
const due=(index,salt,low,high)=>low+hash(index,salt,1741)*(high-low);
export function woodNearby(w,p){
 // Four diagonal/orthogonal leaf hops retain the outer corners of existing crowns.
 const seen=new Set([w.index(p.x,p.y,p.z)]),queue=[[p.x,p.y,p.z,0]];
 for(let head=0;head<queue.length;head++){
  const [x,y,z,depth]=queue[head];if(depth===4)continue;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
   if(!dx&&!dy&&!dz)continue;
   const nx=x+dx,ny=y+dy,nz=z+dz,id=w.get(nx,ny,nz);
   if(id===B.WOOD)return true;
   if(id!==B.LEAVES||!w.inside(nx,ny,nz))continue;
   const i=w.index(nx,ny,nz);if(seen.has(i))continue;seen.add(i);queue.push([nx,ny,nz,depth+1]);
  }
 }
 return false;
}
export class Ecology {
 constructor(room){
  this.room=room;this.world=room.world;this.clock=0;this.step=0;this.sequence=0;this.placedLeaves=new Set();this.leaves=new Map();this.saplings=new Map();this.saplingIterator=null;this.disturbed=new Set();this.counts=new Map();this.woodScans=[];
  this.natural=generateWorld(this.world.seed);
  let loaded=false;
  room.extend('ecology',{save:()=>({clock:this.clock,step:this.step,sequence:this.sequence,placedLeaves:[...this.placedLeaves],leaves:[...this.leaves],saplings:[...this.saplings],disturbed:[...this.disturbed]}),load:data=>{
   if(!data||!Number.isFinite(data.clock)||!Array.isArray(data.placedLeaves)||!Array.isArray(data.leaves)||!Array.isArray(data.saplings))throw Error('Invalid saved ecology');
   this.clock=data.clock;this.step=data.step??0;this.sequence=data.sequence??0;this.placedLeaves=new Set(data.placedLeaves);this.leaves=new Map(data.leaves);this.saplings=new Map(data.saplings);this.disturbed=new Set(data.disturbed??[]);loaded=true;
  }});
  this.scan(loaded);
 }
 resetForImport(){
  this.clock=0;this.step=0;this.sequence=0;this.woodScans=[];this.placedLeaves.clear();this.leaves.clear();this.saplings.clear();this.saplingIterator=null;this.disturbed.clear();this.counts.clear();
  this.natural=generateWorld(this.world.seed);this.scan(false);
 }
 scan(loaded){for(let i=0;i<this.world.blocks.length;i++){
   const id=this.world.blocks[i],p=this.world.position(i);
   if(FORAGE.has(id))this.adjust(p,1);
   if(id===B.SAPLING&&!this.saplings.has(i))this.saplings.set(i,this.clock+due(i,0,180,480));
   if(id===B.LEAVES){
    // Older saves had no placed-leaf flag; protect leaves outside the original canopy.
    if(!loaded&&this.natural.blocks[i]!==B.LEAVES)this.placedLeaves.add(i);
    else if(!this.placedLeaves.has(i)&&!woodNearby(this.world,p)&&!this.leaves.has(i))this.scheduleLeaf(p);
   }
  }}
 adjust(p,delta){const island=islandAt(p.x+.5,p.z+.5);this.counts.set(island,Math.max(0,(this.counts.get(island)??0)+delta));}
 scheduleLeaf(p){const i=key(this.world,p);if(!this.placedLeaves.has(i)&&!this.leaves.has(i))this.leaves.set(i,this.clock+due(i,++this.sequence,2,3));}
 changed(p,before,after){
  const i=key(this.world,p);
  if(before===B.GRASS&&this.natural.blocks[i]===B.GRASS)this.disturbed.add(i);
  if(FORAGE.has(before))this.adjust(p,-1);
  if(FORAGE.has(after))this.adjust(p,1);
  if(before===B.LEAVES){this.placedLeaves.delete(i);this.leaves.delete(i);}
  if(before===B.SAPLING)this.saplings.delete(i);
  if(after===B.SAPLING)this.saplings.set(i,this.clock+due(i,++this.sequence,180,480));
  if(after===B.LEAVES&&!woodNearby(this.world,p))this.scheduleLeaf(p);
  if(before===B.WOOD)this.woodScans.push({p:{...p},cursor:0});
 }
 placed(p,id){if(id===B.LEAVES){const i=key(this.world,p);this.placedLeaves.add(i);this.leaves.delete(i);}}
 tick(dt){
  this.clock+=dt;
  // Spread a trunk's nearby leaf check over ticks, at most 64 positions each.
  for(let budget=64;budget>0&&this.woodScans.length;budget--){const scan=this.woodScans[0],n=scan.cursor++,dx=Math.floor(n/289)-8,dy=Math.floor(n/17)%17-8,dz=n%17-8;
   if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)<=8){const q={x:scan.p.x+dx,y:scan.p.y+dy,z:scan.p.z+dz};if(this.world.inside(q.x,q.y,q.z)&&this.world.get(q.x,q.y,q.z)===B.LEAVES){const i=key(this.world,q);if(woodNearby(this.world,q))this.leaves.delete(i);else this.scheduleLeaf(q);}}
   if(scan.cursor>=4913)this.woodScans.shift();
  }
  const target=Math.floor(this.clock*4);
  while(this.step<target){this.step++;this.checkGrowth();if(this.step%2===0)this.decayOne();if(this.step%4===0)this.respawn();}
 }
 decayOne(){
  for(const [i,when] of this.leaves){if(when>this.clock)continue;this.leaves.delete(i);const p=this.world.position(i);
   if(this.world.blocks[i]!==B.LEAVES||this.placedLeaves.has(i)||woodNearby(this.world,p))continue;
   this.world.set(p.x,p.y,p.z,B.AIR);
   if(hash(i,17,42)<1/12)this.dropSapling(p);
   break;
  }
 }
 dropSapling(p){for(let y=p.y-1;y>=0;y--){const id=this.world.get(p.x,y,p.z);if(!id||isPlant(id))continue;
  if(GROUND.has(id)&&!this.world.get(p.x,y+1,p.z))this.world.set(p.x,y+1,p.z,B.SAPLING);return;
 }}
 checkGrowth(){for(let checked=0;checked<2;checked++){
  this.saplingIterator??=this.saplings.entries();let next=this.saplingIterator.next();
  if(next.done){this.saplingIterator=this.saplings.entries();next=this.saplingIterator.next();if(next.done)return;}
  const [i,when]=next.value;if(when>this.clock)continue;const p=this.world.position(i);if(this.world.blocks[i]!==B.SAPLING){this.saplings.delete(i);continue;}
  const h=3+Math.floor(hash(i,19,52)*3);
  if(GROUND.has(this.world.get(p.x,p.y-1,p.z))&&treeSpaceClear(this.world,p.x,p.y,p.z,h)&&![...this.room.simulation.entities.values()].some(e=>Math.abs(e.position.x-p.x-.5)<2.5&&Math.abs(e.position.z-p.z-.5)<2.5&&e.position.y<p.y+h+3)){
   this.world.set(p.x,p.y,p.z,B.AIR);growTree(this.world,p.x,p.y,p.z,h);
  }else this.saplings.set(i,this.clock+30);
 }}
 respawn(){
  for(let n=0;n<4;n++){
   const x=Math.floor(hash(this.step,n,803)*SIZE.x),z=Math.floor(hash(n,this.step,804)*SIZE.z),top=this.natural.top(x,z),y=isPlant(this.natural.get(x,top,z))?top-1:top;
   if(y<0||this.natural.get(x,y,z)!==B.GRASS||this.world.get(x,y,z)!==B.GRASS||this.disturbed.has(this.world.index(x,y,z))||this.world.get(x,y+1,z))continue;
   const p={x,y:y+1,z},island=islandAt(x+.5,z+.5);
   if((this.counts.get(island)??0)>=30||hash(this.step,n,805)>.025)continue;
   const roll=hash(x,z,this.step),id=roll<.22?B.RED_MUSHROOM:roll<.44?B.BROWN_MUSHROOM:roll<.72?B.YELLOW_FLOWER:B.WHITE_FLOWER;
   this.world.set(x,y+1,z,id);
  }
 }
}
