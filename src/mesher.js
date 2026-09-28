import { CHUNK } from './world.js';
import { textureFor, B, isPlant, isSolid } from './blocks.js';
import { TILE_COUNT } from './atlas.js';
// Counterclockwise vertices seen from outside; neighbor test removes hidden faces.
const FACES = [
 {n:[1,0,0],v:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]],shade:.83},
 {n:[-1,0,0],v:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],shade:.75},
 {n:[0,1,0],v:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],shade:1},
 {n:[0,-1,0],v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],shade:.6},
 {n:[0,0,1],v:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],shade:.9},
 {n:[0,0,-1],v:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],shade:.8},
];
// Ambient occlusion: a corner darkens with each of the three blocks that touch it
// on the face's open side (two edges and the diagonal). Two edges fully close it.
const AO=[.5,.68,.84,1];
export function cornerOcclusion(world,x,y,z,n,corner){
 const solid=(a,b,c)=>isSolid(world.get(a,b,c))?1:0,nx=x+n[0],ny=y+n[1],nz=z+n[2];
 const sx=corner[0]*2-1,sy=corner[1]*2-1,sz=corner[2]*2-1;
 let a,b,c;
 if(n[0]){a=solid(nx,y+sy,z);b=solid(nx,y,z+sz);c=solid(nx,y+sy,z+sz);}
 else if(n[1]){a=solid(x+sx,ny,z);b=solid(x,ny,z+sz);c=solid(x+sx,ny,z+sz);}
 else{a=solid(x+sx,y,nz);b=solid(x,y+sy,nz);c=solid(x+sx,y+sy,nz);}
 return a&&b?0:3-a-b-c;
}
export function meshChunk(world, cx,cy,cz) {
 const positions=[],normals=[],uvs=[],colors=[],indices=[],lampIndices=[],plantIndices=[];
 for(let x=cx*CHUNK;x<(cx+1)*CHUNK;x++) for(let y=cy*CHUNK;y<(cy+1)*CHUNK;y++) for(let z=cz*CHUNK;z<(cz+1)*CHUNK;z++) {
  const id=world.get(x,y,z); if(!id||!isSolid(id)&&!isPlant(id))continue;
  if(isPlant(id)){
   const t=textureFor(id,[0,1,0]),pad=.01;
   for(const vertices of [ [[.15,0,.15],[.85,0,.85],[.85,1,.85],[.15,1,.15]], [[.85,0,.15],[.15,0,.85],[.15,1,.85],[.85,1,.15]] ]){
    const offset=positions.length/3;
    vertices.forEach((v,i)=>{positions.push(x+v[0],y+v[1],z+v[2]);normals.push(0,0,1);colors.push(1,1,1);uvs.push((t+(i===0||i===3?pad:1-pad))/TILE_COUNT,i<2?pad:1-pad);});
    plantIndices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
   }
   continue;
  }
  for(const {n,v,shade} of FACES) {
   if(isSolid(world.get(x+n[0],y+n[1],z+n[2])))continue;
   const offset=positions.length/3, t=textureFor(id,n), pad=.02, ao=[];
   const uv=[[pad,pad],[1-pad,pad],[1-pad,1-pad],[pad,1-pad]];
   for(let i=0;i<4;i++){
    const level=cornerOcclusion(world,x,y,z,n,v[i]),light=shade*AO[level];ao.push(level);
    positions.push(x+v[i][0],y+v[i][1],z+v[i][2]);normals.push(...n);colors.push(light,light,light);uvs.push((t+uv[i][0])/TILE_COUNT,uv[i][1]);
   }
   // Split the quad along the diagonal that keeps the occlusion gradient symmetric.
   const quad=ao[0]+ao[2]>ao[1]+ao[3]?[offset,offset+1,offset+2,offset,offset+2,offset+3]:[offset+1,offset+2,offset+3,offset+1,offset+3,offset];
   ([B.LAMP,B.LANTERN].includes(id)?lampIndices:indices).push(...quad);
  }
 }
 const solidCount=indices.length,lampCount=lampIndices.length;indices.push(...lampIndices,...plantIndices);
 return {positions,normals,uvs,colors,indices,solidCount,lampCount};
}
