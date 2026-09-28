import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { addCrewIsle, addSandbox, generateWorld, SIZE } from '../src/world.js';
import { isPlant, B } from '../src/blocks.js';

export const TERRAIN_VERSION=4;
export function registerTerrain(room,{fresh=false}={}){
 let version=fresh?TERRAIN_VERSION:1;
 room.extend('terrain',{save:()=>({frontier:version}),load:data=>{
  if(!data||!Number.isInteger(data.frontier)||data.frontier<1||data.frontier>TERRAIN_VERSION)throw Error('Invalid saved terrain version');
  version=data.frontier;
 },snapshot:()=>({frontier:version})});
 if(version>=TERRAIN_VERSION)return false;
 // The original save stays available even if the later atomic save fails.
 copyFileSync(room.file,join(room.directory,`${version<3?'before-forage':'before-sandbox'}-${new Date().toISOString().replaceAll(':','-')}.json`));
 if(version<2)addCrewIsle(room.world);
 if(version<4){addSandbox(room.world);room.sandboxMigrated=true;}
 const natural=generateWorld(room.world.seed);
 for(let x=0;x<SIZE.x;x++)for(let z=0;z<SIZE.z;z++){
  const y=natural.top(x,z),id=natural.get(x,y,z);
  if(isPlant(id)&&room.world.get(x,y-1,z)===B.GRASS&&!room.world.get(x,y,z))room.world.set(x,y,z,id);
 }
 version=TERRAIN_VERSION;return true;
}
