import * as THREE from 'three';
import { personaFor } from './presence.js';
export function createGestureEffects(scene){
 const markers=new Map();
 return {update(entities,time,world){
  const active=new Set();
  for(const e of entities.values()){
   const g=e.gesture;
   if(g?.kind!=='point'||time>=g.endsAt||world.get(g.pos.x,g.pos.y,g.pos.z)!==g.blockId)continue;
   active.add(e.id);let marker=markers.get(e.id);
   if(!marker){
    const cube=new THREE.BoxGeometry(1.04,1.04,1.04),edges=new THREE.EdgesGeometry(cube);cube.dispose();
    const material=new THREE.LineBasicMaterial({color:personaFor(e.id)?.tint??0x84f1cd,transparent:true,opacity:.9});
    const outline=new THREE.LineSegments(edges,material),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),material);
    scene.add(outline,line);marker={outline,line,material};markers.set(e.id,marker);
   }
   const {pos}=g;marker.outline.position.set(pos.x+.5,pos.y+.5,pos.z+.5);
   const yaw=Math.atan2(e.direction.x,e.direction.z),points=marker.line.geometry.attributes.position;
   points.setXYZ(0,e.position.x+.4*Math.cos(yaw),e.position.y+1.1,e.position.z-.4*Math.sin(yaw));points.setXYZ(1,pos.x+.5,pos.y+.5,pos.z+.5);
   points.needsUpdate=true;marker.line.geometry.computeBoundingSphere();
  }
  for(const [id,m] of markers)if(!active.has(id)){scene.remove(m.outline,m.line);m.outline.geometry.dispose();m.line.geometry.dispose();m.material.dispose();markers.delete(id);}
 }};
}
