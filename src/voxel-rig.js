import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// A voxel character drawn as one skinned mesh per material. Every box hangs from a
// part (a Bone), so turning, scaling or moving a part moves its boxes exactly as a
// Group would, yet all boxes that share a material are a single draw call.
// Paint is {material, color?}; color becomes a vertex colour, for materials that
// use vertexColors (several colours then share one material and one draw).
const placed=new THREE.Matrix4(),turn=new THREE.Matrix4(),toRoot=new THREE.Matrix4(),color=new THREE.Color();
// Parts swing a little beyond the bind pose; pad the culling sphere by this much.
const SWING=.6;

export function createVoxelRig(root){
 const base=new THREE.Bone();root.add(base);
 const bones=[base],boxes=[];
 return {
  base,
  part(parent=base,x=0,y=0,z=0){const bone=new THREE.Bone();bone.position.set(x,y,z);parent.add(bone);bones.push(bone);return bone;},
  // A w×h×d box centred at (x,y,z) in the part's space; rz first turns it about the part's z axis.
  box(w,h,d,x,y,z,paint,part=base,{rz=0}={}){boxes.push({w,h,d,x,y,z,rz,paint,part});},
  build(){
   root.updateMatrixWorld(true);
   const skeleton=new THREE.Skeleton(bones),rootInverse=root.matrixWorld.clone().invert(),byMaterial=new Map(),meshes=[];
   for(const b of boxes){const list=byMaterial.get(b.paint.material);if(list)list.push(b);else byMaterial.set(b.paint.material,[b]);}
   for(const [material,list] of byMaterial){
    const parts=list.map(b=>{
     const g=new THREE.BoxGeometry(b.w,b.h,b.d);g.deleteAttribute('uv');
     placed.makeRotationZ(b.rz).multiply(turn.makeTranslation(b.x,b.y,b.z));
     g.applyMatrix4(toRoot.multiplyMatrices(rootInverse,b.part.matrixWorld).multiply(placed));
     const n=g.attributes.position.count,bone=bones.indexOf(b.part),colors=new Float32Array(n*3),index=new Uint16Array(n*4),weight=new Float32Array(n*4);
     color.setHex(b.paint.color??0xffffff);
     for(let i=0;i<n;i++){colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;index[i*4]=bone;weight[i*4]=1;}
     g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setAttribute('skinIndex',new THREE.BufferAttribute(index,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(weight,4));
     return g;
    });
    const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
    const mesh=new THREE.SkinnedMesh(geometry,material);root.add(mesh);mesh.bind(skeleton);
    geometry.computeBoundingSphere();mesh.boundingSphere=geometry.boundingSphere.clone();mesh.boundingSphere.radius+=SWING;
    meshes.push(mesh);
   }
   return {meshes,skeleton,dispose(){for(const m of meshes){root.remove(m);m.geometry.dispose();}skeleton.dispose();}};
  },
 };
}
