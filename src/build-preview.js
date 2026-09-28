import * as THREE from 'three';
import { personaFor } from './presence.js';
// Ghost blocks for builds in progress: every planned cell that does not yet
// hold its block glows faintly in the builder's colour. Purely visual; the
// server replicates the plans ('builds' messages) and decides every placement.
// Open player build orders ('orders') show the same way, in the assignee's colour
// once a companion takes them (white while they wait).
export function createBuildPreview(scene,network,world,capacity=600){
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.96,.96,.96),new THREE.MeshBasicMaterial({transparent:true,opacity:.3,depthWrite:false}),capacity);
 mesh.frustumCulled=false;mesh.count=0;mesh.renderOrder=2;scene.add(mesh);
 let builds=[],orders=[],refresh=0;const matrix=new THREE.Matrix4(),color=new THREE.Color();
 network.on('builds',m=>{builds=m.builds??[];refresh=0;});
 network.on('extensions',extensions=>{builds=extensions.builds??[];orders=extensions.orders??[];refresh=0;});
 network.on('orders',m=>{orders=m.orders??[];refresh=0;});
 return {update(dt,time){
  mesh.material.opacity=.22+Math.sin(time*3)*.08;
  if((refresh-=dt)>0)return;refresh=.2;
  let n=0;
  for(const build of [...builds,...orders.map(o=>({builder:o.assignee,cells:o.cells}))]){
   color.setHex(build.builder?personaFor(build.builder)?.tint??0xffffff:0xffffff);
   for(const c of build.cells){
    if(n>=capacity||world.get(c.x,c.y,c.z)===c.id)continue;
    mesh.setMatrixAt(n,matrix.makeTranslation(c.x+.5,c.y+.5,c.z+.5));mesh.setColorAt(n,color);n++;
   }
  }
  mesh.count=n;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 }};
}
