import { B } from '../../src/blocks.js';
const GROUND=[B.GRASS,B.DIRT,B.SAND];
const SIDES=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1]];
// A natural tree trunk: a wood column standing on ground, capped directly by
// leaves, with no planks touching it. Shelter posts, beams and anything built
// against planks fail at least one of these, so gathering leaves them alone.
export function treeTrunkAt(world,x,y,z){
 if(world.get(x,y,z)!==B.WOOD)return null;
 let bottom=y,top=y;
 while(world.get(x,bottom-1,z)===B.WOOD)bottom--;
 while(world.get(x,top+1,z)===B.WOOD)top++;
 if(!GROUND.includes(world.get(x,bottom-1,z))||world.get(x,top+1,z)!==B.LEAVES)return null;
 const trunk=[];
 for(let yy=bottom;yy<=top;yy++){
  for(const [dx,dy,dz] of SIDES)if(world.get(x+dx,yy+dy,z+dz)===B.PLANKS)return null;
  trunk.push({x,y:yy,z});
 }
 return trunk;
}
// Trees whose trunks are within `radius` blocks horizontally, nearest first.
export function findTrees(world,around,radius=20){
 const trees=[],cx=Math.floor(around.x),cz=Math.floor(around.z),cy=Math.floor(around.y);
 for(let x=cx-radius;x<=cx+radius;x++)for(let z=cz-radius;z<=cz+radius;z++){
  if(Math.hypot(x-cx,z-cz)>radius)continue;
  for(let y=Math.max(1,cy-10);y<=cy+10;y++){
   if(world.get(x,y,z)!==B.WOOD||world.get(x,y-1,z)===B.WOOD)continue;
   const trunk=treeTrunkAt(world,x,y,z);
   if(trunk)trees.push({base:trunk[0],trunk,distance:Math.hypot(x+.5-around.x,z+.5-around.z)+Math.abs(y-around.y)*.5});
  }
 }
 return trees.sort((a,b)=>a.distance-b.distance);
}

// Spread a wide search across game ticks so a companion never stalls the room.
export class TreeScan {
 constructor(world,around,radius=40){Object.assign(this,{world,around,radius});this.x=Math.max(0,Math.floor(around.x)-radius);this.endX=Math.min(127,Math.floor(around.x)+radius);this.z=Math.max(0,Math.floor(around.z)-radius);this.startZ=this.z;this.endZ=Math.min(127,Math.floor(around.z)+radius);this.y=Math.max(1,Math.floor(around.y)-10);this.startY=this.y;this.endY=Math.min(46,Math.floor(around.y)+10);this.trees=[];this.done=false;}
 tick(budget=2000){
  for(let n=0;n<budget&&!this.done;n++){
   const {x,y,z,world,around,radius}=this;
   if(Math.hypot(x-Math.floor(around.x),z-Math.floor(around.z))<=radius&&world.get(x,y,z)===B.WOOD&&world.get(x,y-1,z)!==B.WOOD){
    const trunk=treeTrunkAt(world,x,y,z);if(trunk)this.trees.push({base:trunk[0],trunk,distance:Math.hypot(x+.5-around.x,z+.5-around.z)+Math.abs(y-around.y)*.5});
   }
   if(++this.y>this.endY){this.y=this.startY;if(++this.z>this.endZ){this.z=this.startZ;if(++this.x>this.endX)this.done=true;}}
  }
  if(this.done)this.trees.sort((a,b)=>a.distance-b.distance);
  return this.done;
 }
}
