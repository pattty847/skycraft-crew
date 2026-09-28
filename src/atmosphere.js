import * as THREE from 'three';
import { hash, SIZE } from './world.js';
import { createWater } from './water.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const DUSK=new THREE.Color('#f3a66b'),DUSK_SUN=new THREE.Color('#ff9a52'),DAY_SKY=new THREE.Color('#b7dce4'),NIGHT_SKY=new THREE.Color('#111d3b');
const CLOUD_COUNT=30,cloudMatrix=new THREE.Matrix4();
export class Atmosphere {
 constructor(scene,world,{shadowMapSize=2048}={}) {
  this.scene=scene;this.phase=.24;this.paused=false;
  this.ambient=new THREE.HemisphereLight(0xe1fff0,0x5b6483,2);scene.add(this.ambient);
  this.sun=new THREE.DirectionalLight(0xffedcb,2.8);this.sun.position.set(5,65,45);this.sun.castShadow=true;
  this.sun.shadow.mapSize.set(shadowMapSize,shadowMapSize);Object.assign(this.sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:.5,far:140});
  this.sun.shadow.bias=-.0005;this.sun.shadow.normalBias=.04;this.sun.target.position.set(30,18,30);scene.add(this.sun,this.sun.target);this.shadowSpan=35;
  scene.fog=new THREE.Fog(0xb9dce3,110,245);
  const cloudMaterial=new THREE.MeshLambertMaterial({color:0xf2f3e8});
  // Every cloud is the same four boxes, so all of them are one instanced draw.
  const puffs=[0,1,2,3].map(j=>new THREE.BoxGeometry(3+j%2*2,1+(j%3)*.6,2.7).translate(j*2.5,(j%2)*.45,(j%3)*1.1));
  this.cloudMesh=new THREE.InstancedMesh(mergeGeometries(puffs),cloudMaterial,CLOUD_COUNT);puffs.forEach(g=>g.dispose());
  this.cloudMesh.frustumCulled=false;scene.add(this.cloudMesh);
  this.clouds=Array.from({length:CLOUD_COUNT},(_,i)=>({x:-65+hash(i,1)*260,y:i<7? 6+hash(i,3)*6 : 43+hash(i,2)*25,z:-65+hash(i,4)*260}));
  this.placeClouds();
  this.water=createWater(scene);
  const starsGeometry=new THREE.BufferGeometry(),stars=[];
  for(let i=0;i<500;i++)stars.push(-110+hash(i,20)*360,60+hash(i,21)*110,-110+hash(i,22)*360);
  starsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));
  this.stars=new THREE.Points(starsGeometry,new THREE.PointsMaterial({color:0xfff2d0,size:.35,transparent:true}));scene.add(this.stars);
  // Firefly anchors use the old meadow distribution; forage plants are voxel blocks.
  this.flowerSpots=[];
  for(let x=0;x<SIZE.x;x++)for(let z=0;z<SIZE.z;z++){
   const top=world.top(x,z),y=world.get(x,top,z)>=12?top-1:top;if(y<0||world.get(x,y,z)!==1||hash(x,z,600)>.12)continue;
   this.flowerSpots.push({x,y,z,color:[0xffd17b,0xf2a291,0xf9ebbb][(x+z)%3]});
  }
  // Fireflies drift over the grass at night.
  this.fireflies=this.flowerSpots.filter((_,i)=>i%3===0).slice(0,120).map((f,i)=>({x:f.x+hash(i,31),y:f.y+2.2+hash(i,32)*3,z:f.z+hash(i,33),p:hash(i,34)*10}));
  const fireflyGeometry=new THREE.BufferGeometry();fireflyGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(this.fireflies.length*3),3));
  this.fireflyPoints=new THREE.Points(fireflyGeometry,new THREE.PointsMaterial({color:0xffe070,size:.25,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
  this.fireflyPoints.frustumCulled=false;scene.add(this.fireflyPoints);this.fireflyTime=0;
  const frame=new THREE.MeshLambertMaterial({color:0x345259}),glowMaterial=new THREE.MeshBasicMaterial({color:0xffe4a1});
  // Lanterns stand on the block below them; mining that block hides the lantern and its light.
  this.lanterns=[{x:33.2,z:42.3,color:0xffd08a},{x:84.5,z:37.5,color:0xffb37a}].map(spot=>{
   const lantern=new THREE.Group(),support={x:Math.floor(spot.x),z:Math.floor(spot.z)};support.y=world.top(support.x,support.z);
   lantern.position.set(spot.x,support.y+1,spot.z);scene.add(lantern);
   for(const y of [.05,.48]){const m=new THREE.Mesh(new THREE.BoxGeometry(.4,.09,.4),frame);m.position.y=y;lantern.add(m);}
   const glow=new THREE.Mesh(new THREE.BoxGeometry(.27,.34,.27),glowMaterial);glow.position.y=.26;lantern.add(glow);
   // Lit through the shared light pool (lamp-lights.js), like placed lamps.
   const light={x:spot.x,y:support.y+1.5,z:spot.z,color:spot.color,intensity:8,distance:9,decay:1.5};
   return {lantern,light,support};
  });
  this.lights=this.lanterns.map(l=>l.light);
 }
 // Keep the sun's shadow box around whatever the camera is looking at.
 follow(target,overview){
  const span=overview?80:35;
  if(span!==this.shadowSpan){this.shadowSpan=span;Object.assign(this.sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,far:span*2+70});this.sun.shadow.camera.updateProjectionMatrix();}
  this.sun.target.position.set(target.x,target.y-4,target.z);this.sun.position.set(target.x-25,target.y+47,target.z+15);
 }
 placeClouds(){
  this.clouds.forEach((c,i)=>this.cloudMesh.setMatrixAt(i,cloudMatrix.makeTranslation(c.x,c.y,c.z)));
  this.cloudMesh.instanceMatrix.needsUpdate=true;
 }
 refresh(world){
  for(const l of this.lanterns)l.lantern.visible=world.get(l.support.x,l.support.y,l.support.z)!==0;
 }
 updateFireflies(dt){
  const night=1-this.daylight;this.fireflyPoints.material.opacity=night*.95;
  if(night<.01)return;
  const t=this.fireflyTime+=dt,p=this.fireflyPoints.geometry.attributes.position;
  this.fireflies.forEach((f,i)=>p.setXYZ(i,f.x+Math.sin(t*.7+f.p)*.6,f.y+Math.sin(t*1.1+f.p*2)*.4,f.z+Math.cos(t*.6+f.p)*.6));
  p.needsUpdate=true;
 }
 toggle(){this.phase=this.daylight>.4?.76:.24;}
 update(dt,reducedMotion=false){
  this.phase=(this.phase+dt/600)%1;
  this.daylight=THREE.MathUtils.smoothstep(Math.sin(this.phase*Math.PI*2),-.25,.45);
  // A warm cast while the sun is near the horizon: a hint in the sky, most of it in the light.
  const dusk=Math.max(0,1-Math.abs(Math.sin(this.phase*Math.PI*2))/.3);
  if(!this.scene.background?.isColor)this.scene.background=new THREE.Color();
  this.scene.background.copy(NIGHT_SKY).lerp(DAY_SKY,this.daylight).lerp(DUSK,dusk*.16);this.scene.fog.color.copy(this.scene.background);
  this.ambient.intensity=.38+this.daylight*1.5;this.sun.intensity=.16+this.daylight*2.5;
  if(this.daylight>.5)this.sun.color.set(0xffedcb).lerp(DUSK_SUN,dusk*.8);else this.sun.color.set(0x8cafff);this.stars.material.opacity=1-this.daylight;
  for(const l of this.lanterns)l.light.intensity=l.lantern.visible?3+(1-this.daylight)*9:0;
  this.water.update(dt,reducedMotion);
  this.updateFireflies(dt*(reducedMotion?.25:1));
  if(reducedMotion)return;
  for(const c of this.clouds){c.x+=dt*.32;if(c.x>200)c.x=-70;}
  this.placeClouds();
 }
}
