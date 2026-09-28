import { B } from '../../src/blocks.js';
const FACES=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
// Blocks only people place: planks, and the crafted materials Clay and Lamp.
const BUILT=new Set([B.PLANKS,B.CLAY,B.LAMP].filter(Number.isInteger));
// Things people built, as the model should understand them: connected groups
// of planks (plus any wood touching those planks, such as posts). Trees are
// wood and leaves without planks, so they never appear here. Each structure
// reports its size and its roof: the highest cells a player could stand on.
export function findStructures(world,around,radius=16){
 const cx=Math.floor(around.x),cy=Math.floor(around.y),cz=Math.floor(around.z),seen=new Set(),out=[];
 const key=(x,y,z)=>`${x},${y},${z}`;
 const inRange=(x,y,z)=>Math.abs(x-cx)<=radius&&Math.abs(z-cz)<=radius&&y>=cy-10&&y<=cy+12;
 for(let x=cx-radius;x<=cx+radius;x++)for(let y=cy-10;y<=cy+12;y++)for(let z=cz-radius;z<=cz+radius;z++){
  if(!BUILT.has(world.get(x,y,z))||seen.has(key(x,y,z)))continue;
  const cells=[],queue=[{x,y,z}];seen.add(key(x,y,z));
  while(queue.length&&cells.length<2000){
   const c=queue.pop();cells.push(c);
   for(const [dx,dy,dz] of FACES){
    const n={x:c.x+dx,y:c.y+dy,z:c.z+dz},id=world.get(n.x,n.y,n.z),k=key(n.x,n.y,n.z);
    if(seen.has(k)||!inRange(n.x,n.y,n.z))continue;
    // Planks join the group; wood joins where it touches the group (posts and beams
    // connect a floor to its roof). Groups only ever start from planks, so a tree
    // on its own never becomes a structure.
    if(BUILT.has(id)||id===B.WOOD){seen.add(k);queue.push(n);}
   }
  }
  if(cells.length<3)continue;
  const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
  for(const c of cells)for(const a of ['x','y','z']){min[a]=Math.min(min[a],c[a]);max[a]=Math.max(max[a],c[a]);}
  const height=max.y-min.y+1,d=c=>Math.hypot(c.x+.5-around.x,c.z+.5-around.z);
  // Roof: the top layer's cells with two free blocks above to stand in.
  const roof=cells.filter(c=>c.y===max.y&&!world.get(c.x,c.y+1,c.z)&&!world.get(c.x,c.y+2,c.z)).sort((a,b)=>d(a)-d(b));
  out.push({cells,min,max,height,roof,distance:Math.min(...cells.map(d)),kind:height>=3?'building':height<=2&&(max.x-min.x>=5||max.z-min.z>=5)?'walkway':'small build'});
 }
 return out.sort((a,b)=>a.distance-b.distance).slice(0,8).map((s,i)=>({...s,id:`S${i+1}`}));
}
// Compact form for the model's observation.
export function describeStructures(structures){
 return structures.map(s=>({id:s.id,kind:s.kind,blocks:s.cells.length,size:{x:s.max.x-s.min.x+1,y:s.height,z:s.max.z-s.min.z+1},from:s.min,to:s.max,roofY:s.max.y,roofCells:s.roof.length,distance:Math.round(s.distance)}));
}
