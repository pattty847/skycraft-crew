import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Characters cast their sun shadow from one plain box instead of from every part.
// A proxy lives on its own layer: the main camera never sees that layer, and
// drawShadowProxies() lets the shadow pass see it (three's shadow pass tests
// objects against the main camera's layers).
export const SHADOW_LAYER=1;
const material=new THREE.MeshBasicMaterial();

export function shadowProxy(geometry){
 const mesh=new THREE.Mesh(geometry,material);
 mesh.castShadow=true;mesh.layers.set(SHADOW_LAYER);
 return mesh;
}

// Merged boxes [w,h,d,x,y,z] as one proxy geometry (positions only).
export function proxyGeometry(boxes){
 const parts=boxes.map(([w,h,d,x,y,z])=>{const g=new THREE.BoxGeometry(w,h,d).translate(x,y,z);g.deleteAttribute('normal');g.deleteAttribute('uv');return g;});
 const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());geometry.computeBoundingSphere();
 return geometry;
}

export function drawShadowProxies(renderer){
 const shadowMap=renderer.shadowMap,render=shadowMap.render;
 shadowMap.render=function(lights,scene,camera){
  const had=camera.layers.isEnabled(SHADOW_LAYER);camera.layers.enable(SHADOW_LAYER);
  try{return render.call(this,lights,scene,camera);}finally{if(!had)camera.layers.disable(SHADOW_LAYER);}
 };
}
