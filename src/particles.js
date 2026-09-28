import * as THREE from 'three';
// Small voxel crumbs when a block breaks and a puff when one is placed.
// One instanced mesh; purely visual, spawned from server-confirmed changes.
const TINTS=[0,0x6faf5a,0x8a6a4a,0x8d9499,0xe4d6a0,0x7a5a3a,0x3f7f4e,0x3c3c3c,0xc19a78,0xc89a5e,0xcc8061,0xffe3a0];
export class Particles {
 constructor(scene,capacity=240){
  this.mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial({color:0xffffff}),capacity);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.frustumCulled=false;this.mesh.count=0;scene.add(this.mesh);
  this.items=[];this.capacity=capacity;this.matrix=new THREE.Matrix4();this.color=new THREE.Color();this.quaternion=new THREE.Quaternion();this.euler=new THREE.Euler();this.position=new THREE.Vector3();this.scale=new THREE.Vector3();
 }
 burst(p,blockId,{count=12,speed=2.6,size=.14,life=.9}={}){
  for(let i=0;i<count;i++){
   if(this.items.length>=this.capacity)this.items.shift();
   this.items.push({x:p.x+.2+Math.random()*.6,y:p.y+.2+Math.random()*.6,z:p.z+.2+Math.random()*.6,vx:(Math.random()-.5)*speed,vy:Math.random()*speed*1.1,vz:(Math.random()-.5)*speed,
    spin:Math.random()*6,age:0,life:life*(.7+Math.random()*.6),size:size*(.6+Math.random()*.8),color:TINTS[blockId]??0xffffff});
  }
 }
 broke(p,blockId){this.burst(p,blockId);}
 placed(p,blockId){this.burst(p,blockId,{count:6,speed:1.2,size:.09,life:.45});}
 update(dt){
  // Compact the live particles in place (no per-frame arrays or vectors).
  const alive=this.items;let n=0;
  for(const item of alive){
   item.age+=dt;if(item.age>=item.life)continue;
   item.vy-=14*dt;item.x+=item.vx*dt;item.y+=item.vy*dt;item.z+=item.vz*dt;alive[n++]=item;
  }
  alive.length=n;
  for(let i=0;i<alive.length;i++){
   const item=alive[i],scale=item.size*(1-item.age/item.life*.6);
   this.euler.set(item.age*item.spin,item.age*item.spin*.7,0);this.quaternion.setFromEuler(this.euler);
   this.matrix.compose(this.position.set(item.x,item.y,item.z),this.quaternion,this.scale.setScalar(scale));
   this.mesh.setMatrixAt(i,this.matrix);this.mesh.setColorAt(i,this.color.setHex(item.color));
  }
  this.mesh.count=alive.length;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
 }
}
