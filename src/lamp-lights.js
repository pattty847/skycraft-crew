import * as THREE from 'three';
import { B } from './blocks.js';
// A fixed pool of point lights shared by every glowing thing: placed lamps,
// torches and lanterns, plus scenery lights (the lanterns on Origin Island,
// Claude's glow). three.js compiles the light count into every shader, so the
// pool never grows or shrinks; unused lights sit at intensity 0. Emissive faces
// still glow without a light.
const GLOWS=new Uint8Array(256);GLOWS[B.LAMP]=1;GLOWS[B.TORCH]=1;GLOWS[B.LANTERN]=1;
export const LAMP_RANGE=32;
const lampLight=id=>id===B.TORCH?{strength:.55,distance:6}:id===B.LANTERN?{strength:1.35,distance:12}:{strength:1,distance:9};

// Fills `out` with the `count` sources nearest to `position` (nearest first) and
// returns how many it chose. Sources farther than their own `range` are skipped.
export function nearestSources(sources,position,count,out,distances){
 let n=0;
 for(const s of sources){
  const d=(s.x-position.x)**2+(s.y-position.y)**2+(s.z-position.z)**2;
  if(!(s.intensity>0)||d>=s.range*s.range)continue;
  let i;
  if(n<count)i=n++;
  else if(count>0&&d<distances[count-1])i=count-1;
  else continue;
  while(i>0&&distances[i-1]>d){distances[i]=distances[i-1];out[i]=out[i-1];i--;}
  distances[i]=d;out[i]=s;
 }
 return n;
}

export function createLampLights(scene,world,{size=6}={}){
 const lamps=new Map(),lights=Array.from({length:size},()=>{const light=new THREE.PointLight(0xffce84,0,9,2);scene.add(light);return light;});
 const chosen=new Array(size),distances=new Float64Array(size),candidates=[];let revision=-1,night=0;
 const lamp=(p,id)=>{const {strength,distance}=lampLight(id);return {x:p.x+.5,y:p.y+.5,z:p.z+.5,color:0xffce84,decay:2,distance,range:LAMP_RANGE,strength,get intensity(){return Math.max(.15,night)*12*this.strength;}};};
 function refresh(force=false){
  if(!force&&revision===world.revision)return;
  const edits=force?null:world.editsSince(revision);
  if(revision<0||!edits){lamps.clear();const blocks=world.blocks;for(let i=0;i<blocks.length;i++)if(GLOWS[blocks[i]])lamps.set(i,lamp(world.position(i),blocks[i]));}
  else for(const p of edits){const index=world.index(p.x,p.y,p.z),id=world.get(p.x,p.y,p.z);if(GLOWS[id])lamps.set(index,lamp(p,id));else lamps.delete(index);}
  revision=world.revision;
 }
 return {lights,refresh,
  // extra: scenery lights {x,y,z,color,intensity,distance,decay,range?}, in world space.
  update(position,nightness,extra=[]){
   refresh();night=nightness;candidates.length=0;
   for(const l of lamps.values())candidates.push(l);
   for(const s of extra){if(s.range===undefined)s.range=Infinity;candidates.push(s);}
   const n=nearestSources(candidates,position,size,chosen,distances);
   for(let i=0;i<size;i++){
    const light=lights[i],s=i<n?chosen[i]:null;
    if(!s){light.intensity=0;continue;}
    light.intensity=s.intensity;light.distance=s.distance;light.decay=s.decay;light.color.setHex(s.color);light.position.set(s.x,s.y,s.z);
   }
   candidates.length=0;chosen.fill(null);
  }};
}
