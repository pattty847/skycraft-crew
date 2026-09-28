import * as THREE from 'three';
import { meshChunk } from './mesher.js';
import { CHUNK } from './world.js';
const defaultNow=()=>performance.now(),HIDDEN=new THREE.MeshBasicMaterial({visible:false});
export class ChunkRenderer {
 constructor(scene, world, texture) {
  this.scene=scene;this.world=world;this.meshes=new Map();
  this.material=new THREE.MeshLambertMaterial({map:texture,vertexColors:true});
  this.lampMaterial=new THREE.MeshLambertMaterial({map:texture,vertexColors:true,emissive:0xffdc93,emissiveMap:texture,emissiveIntensity:.8});
  this.plantMaterial=new THREE.MeshLambertMaterial({map:texture,vertexColors:true,transparent:true,alphaTest:.5,side:THREE.DoubleSide,depthWrite:true,forceSinglePass:true});
  // Chunks draw in two layers, so the shadow pass renders every solid, then every
  // plant (a different depth program), instead of switching programs per chunk.
  this.solids=new THREE.Group();this.plants=new THREE.Group();scene.add(this.solids,this.plants);
  // The first update (in the draw loop) meshes the whole world, a budget at a time.
  world.markAllDirty();
 }
 // Meshes dirty chunks nearest to `focus` first, stopping once `budgetMs` is spent
 // (always at least one), so joining a world never freezes one frame. Returns the
 // number of chunks rebuilt; the rest stay in world.dirty for the next frame.
 update({budgetMs=Infinity,focus=null,now=defaultNow}={}) {
  const dirty=this.world.dirty;if(!dirty.size)return 0;
  let keys=[...dirty];
  if(focus&&keys.length>1){
   const distance=key=>{const [x,y,z]=key.split(',').map(Number);return ((x+.5)*CHUNK-focus.x)**2+((y+.5)*CHUNK-focus.y)**2+((z+.5)*CHUNK-focus.z)**2;};
   keys=keys.map(key=>[distance(key),key]).sort((a,b)=>a[0]-b[0]).map(entry=>entry[1]);
  }
  const start=now();let built=0;
  for(const key of keys){
   if(built&&now()-start>=budgetMs)break;
   dirty.delete(key);this.build(key);built++;
  }
  return built;
 }
 build(key) {
  const old=this.meshes.get(key);
  if(old){for(const mesh of old)mesh.parent.remove(mesh);old[0].geometry.dispose();this.meshes.delete(key);}
  const data=meshChunk(this.world,...key.split(',').map(Number));if(!data.indices.length)return;
  const geometry=new THREE.BufferGeometry();
  for(const [name,values,size] of [['position',data.positions,3],['normal',data.normals,3],['uv',data.uvs,2],['color',data.colors,3]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
  // Only non-empty groups: three issues a draw call per group, even an empty one.
  const counts=[data.solidCount,data.lampCount,data.indices.length-data.solidCount-data.lampCount];let start=0;
  counts.forEach((count,material)=>{if(count)geometry.addGroup(start,count,material);start+=count;});
  geometry.setIndex(data.indices); geometry.computeBoundingSphere();
  // Both layers share the geometry; each hides the other's groups.
  const meshes=[];
  const add=(layer,materials)=>{const mesh=new THREE.Mesh(geometry,materials);mesh.receiveShadow=true;mesh.castShadow=true;layer.add(mesh);meshes.push(mesh);};
  if(counts[0]||counts[1])add(this.solids,[this.material,this.lampMaterial,HIDDEN]);
  if(counts[2])add(this.plants,[HIDDEN,HIDDEN,this.plantMaterial]);
  this.meshes.set(key,meshes);
 }
}
