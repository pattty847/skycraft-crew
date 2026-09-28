import * as THREE from 'three';
import { animateGesture } from './gesture-pose.js';
import { createVoxelRig } from './voxel-rig.js';
import { shadowProxy, proxyGeometry } from './shadow-proxy.js';
export function createNameplate(label,{y=2.05,accent=null}={}){
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=56;
 const context=canvas.getContext('2d');context.fillStyle='#253239db';context.fillRect(0,0,320,56);
 if(accent){context.fillStyle=accent;context.fillRect(0,0,8,56);}
 context.font='600 28px monospace';context.textAlign='center';context.textBaseline='middle';context.fillStyle='#f2f6ed';context.fillText(label,160,29);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const nameplate=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false}));nameplate.position.y=y;nameplate.scale.set(1.65,.29,1);return nameplate;
}
// Shared by every robot: ivory and dark are vertex colours on one material, and
// each tint gets one glowing material (a skinned and a rigid copy, since three
// compiles those differently).
const shell=new THREE.MeshLambertMaterial({vertexColors:true});
const IVORY={material:shell,color:0xe8ebe0},DARK={material:shell,color:0x253f44};
const glows=new Map();
const glowFor=tint=>{let g=glows.get(tint);if(!g){const make=()=>new THREE.MeshStandardMaterial({color:tint,emissive:tint,emissiveIntensity:.7});g={skinned:make(),rigid:make()};glows.set(tint,g);}return g;};
const rodMaterial=new THREE.MeshLambertMaterial({color:0x796247}),lineMaterial=new THREE.LineBasicMaterial({color:0xf0f0ce,transparent:true,opacity:.75});
let shadowShape=null;
export function createCharacter(scene,{label='',tint=0x84f1cd}={}) {
 const root=new THREE.Group();scene.add(root);
 const nameplate=label?createNameplate(label):null;if(nameplate)root.add(nameplate);
 const rig=createVoxelRig(root),glow=glowFor(tint),MINT={material:glow.skinned};
 const box=(w,h,d,x,y,z,paint,part=rig.base)=>rig.box(w,h,d,x,y,z,paint,part);
 box(.57,.62,.36,0,.86,0,IVORY);box(.32,.26,.025,0,.88,.194,DARK);
 // A terminal prompt, rendered in voxels, is this robot's own little signature.
 box(.07,.035,.025,-.06,.92,.214,MINT);box(.04,.035,.025,-.025,.885,.214,MINT);box(.07,.025,.025,.08,.86,.214,MINT);
 const head=rig.part(rig.base,0,1.36,0);
 box(.65,.48,.49,0,0,0,IVORY,head);box(.53,.24,.035,0,0,.255,DARK,head);
 box(.065,.08,.02,-.13,.005,.28,MINT,head);box(.065,.08,.02,.13,.005,.28,MINT,head);
 box(.035,.16,.035,0,.3,0,DARK,head);box(.11,.09,.11,0,.41,0,MINT,head);
 // Codex carries a compact field pack and a mint terminal badge.
 if(label==='Codex · AI'){box(.42,.42,.16,0,.89,-.25,DARK);box(.28,.055,.035,0,.95,-.345,MINT);box(.12,.09,.04,-.17,1.04,.2,MINT);}
 const limbs=[];
 for(const side of [-1,1]) {
  const leg=rig.part(rig.base,side*.17,.56,0);box(.22,.45,.25,0,-.225,0,DARK,leg);box(.24,.12,.32,0,-.45,.03,IVORY,leg);limbs.push(leg);
 }
 for(const side of [-1,1]) {const arm=rig.part(rig.base,side*.4,1.1,0);box(.18,.5,.22,0,-.25,0,IVORY,arm);box(.19,.13,.23,0,-.51,0,DARK,arm);limbs.push(arm);}
 const body=rig.build();
 // The sun shadow comes from one torso-and-head box, not from every part.
 root.add(shadowProxy(shadowShape??=proxyGeometry([[.6,1.17,.36,0,.585,0],[.65,.48,.49,0,1.36,0]])));
 // The fishing rod shows only while fishing, so it keeps plain meshes.
 const rod=new THREE.Group();root.add(rod);
 const part=(geometry,material,x,y,z)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;rod.add(m);return m;};
 const stick=part(new THREE.BoxGeometry(.035,1.8,.035),rodMaterial,.48,1.15,.76);stick.rotation.x=.65;
 const lineGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.48,1.88,1.3),new THREE.Vector3(.48,-6,1.3)]);
 rod.add(new THREE.Line(lineGeo,lineMaterial));
 const bobber=part(new THREE.BoxGeometry(.13,.17,.13),glow.rigid,.48,-6,1.3);
 return {root,update(entity,time,fishing,clock=time,reducedMotion=false){
  if(entity.gesture)fishing=false;
  for(const limb of limbs)limb.rotation.set(0,0,0);head.rotation.set(0,0,0);
  root.position.set(entity.position.x,entity.position.y-(fishing?.25:0),entity.position.z);
  root.rotation.y=Math.atan2(entity.direction.x,entity.direction.z);
  const speed=Math.hypot(entity.velocity.x,entity.velocity.z),walk=Math.sin(time*10)*Math.min(speed/5,.7);
  limbs[0].rotation.x=fishing?-1.25:walk;limbs[1].rotation.x=fishing?-1.25:-walk;limbs[2].rotation.x=-walk*.7;limbs[3].rotation.x=fishing?-.65:walk*.7;
  head.rotation.z=speed<.1?Math.sin(time*1.3)*.035:0;
  animateGesture(entity,clock,reducedMotion,head,limbs[3],root.rotation.y);
  rod.visible=fishing&&speed<.1;bobber.position.y=-6+Math.sin(time*1.7)*.15;
 },dispose(){
  scene.remove(root);body.dispose();stick.geometry.dispose();bobber.geometry.dispose();lineGeo.dispose();
  if(nameplate){nameplate.material.map.dispose();nameplate.material.dispose();}
 }};
}
