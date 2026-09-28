import * as THREE from 'three';
import { createNameplate } from './character.js';
import { createVoxelRig } from './voxel-rig.js';
import { shadowProxy, proxyGeometry } from './shadow-proxy.js';
// Claude: a small clay-coloured mochi sprite with a starburst sparkle floating
// above its head. Built from boxes like everything else here; all original.
const CLAY=0xe07b52,CLAY_DARK=0xb95a36,CREAM=0xfff6ea,INK=0x2b1d17,BLUSH=0xff9f8f,SPARK=0xffa061;
// Shared by every Claude. A little self-glow keeps the clay warm in shade and at night.
const CLAY_PAINT={material:new THREE.MeshLambertMaterial({color:CLAY,emissive:0x5a2210,emissiveIntensity:.55})};
const CLAY_DARK_PAINT={material:new THREE.MeshLambertMaterial({color:CLAY_DARK,emissive:0x3a1408,emissiveIntensity:.5})};
const faceMaterial=new THREE.MeshBasicMaterial({vertexColors:true});
const INK_PAINT={material:faceMaterial,color:INK},CREAM_PAINT={material:faceMaterial,color:CREAM};
const BLUSH_PAINT={material:new THREE.MeshBasicMaterial({color:BLUSH,transparent:true,opacity:.85})};
let shadowShape=null;
export function createClaude(scene,{label='Claude · AI',tint=CLAY}={}) {
 const root=new THREE.Group();scene.add(root);
 const nameplate=label?createNameplate(label,{y:1.78,accent:'#e08a5f'}):null;if(nameplate)root.add(nameplate);
 // The sparkle's glow changes with Claude's mood, so each Claude has its own.
 const glow=new THREE.MeshStandardMaterial({color:SPARK,emissive:0xff7a3d,emissiveIntensity:.8}),GLOW={material:glow};
 const rig=createVoxelRig(root),box=(w,h,d,x,y,z,paint,part,options)=>rig.box(w,h,d,x,y,z,paint,part,options);
 // Squash-and-stretch pivots at the feet.
 const body=rig.part(rig.base);
 // Three overlapping boxes read as a rounded voxel blob.
 box(.78,.66,.62,0,.5,0,CLAY_PAINT,body);box(.66,.8,.62,0,.52,0,CLAY_PAINT,body);box(.66,.66,.74,0,.5,0,CLAY_PAINT,body);
 box(.5,.12,.5,0,.94,0,CLAY_PAINT,body);
 const face=rig.part(body,0,.58,.375);
 const eyes=[];
 for(const side of [-1,1]){
  const eye=rig.part(face,side*.15,.03,0);box(.11,.19,.02,0,0,0,INK_PAINT,eye);eyes.push(eye);
  box(.045,.05,.01,side*.15+.025,.085,.012,CREAM_PAINT,face);
  box(.11,.05,.01,side*.26,-.1,0,BLUSH_PAINT,face);
 }
 // A tiny smile: three pixels in an arc.
 box(.05,.028,.01,-.045,-.1,0,INK_PAINT,face);box(.05,.028,.01,.045,-.1,0,INK_PAINT,face);box(.05,.028,.01,0,-.125,0,INK_PAINT,face);
 const arms=[];
 for(const side of [-1,1]){const arm=rig.part(body,side*.4,.55,0);box(.13,.24,.16,side*.03,-.1,0,CLAY_PAINT,arm);arms.push(arm);}
 const feet=[];
 for(const side of [-1,1]){const foot=rig.part(rig.base,side*.17,.05,.03);box(.2,.1,.24,0,0,0,CLAY_DARK_PAINT,foot);feet.push(foot);}
 // The sparkle: six rays around a bright centre, facing forward.
 const sparkle=rig.part(rig.base,0,1.28,0);
 for(let i=0;i<6;i++)box(.055,.2,.055,0,.12,0,GLOW,sparkle,{rz:i*Math.PI/3});
 box(.09,.09,.09,0,0,0,GLOW,sparkle);
 const built=rig.build();
 // The sun shadow comes from one box that squashes with the body.
 body.add(shadowProxy(shadowShape??=proxyGeometry([[.74,.8,.66,0,.5,0]])));
 // Claude's warm glow, lit through the shared light pool (lamp-lights.js).
 const light={x:0,y:0,z:0,color:0xffb37a,intensity:0,distance:5,decay:1.6};
 let lookTimer=0;
 // Two little z's that drift up and fade while Claude dozes.
 const zs=[0,1].map(i=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');g.font='bold 26px monospace';g.fillStyle='#fff3e6';g.textAlign='center';g.textBaseline='middle';g.fillText('z',16,17);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));s.visible=false;root.add(s);return s;});
 return {root,light,update(entity,time,{busy=false,speaking=false,night=0,clock=time,reducedMotion=false,sleeping=false}={}){
  root.position.set(entity.position.x,entity.position.y,entity.position.z);
  light.x=entity.position.x;light.y=entity.position.y+1.25;light.z=entity.position.z;
  root.rotation.y=Math.atan2(entity.direction.x,entity.direction.z);
  const speed=Math.hypot(entity.velocity.x,entity.velocity.z),moving=speed>.3,airborne=!entity.grounded;
  // Bouncy walk; soft breathing when still.
  const hop=moving?Math.abs(Math.sin(time*11)):0;
  const squash=airborne?1.08:moving?1+Math.sin(time*22)*.05:1+Math.sin(time*2.4)*.025;
  body.scale.set(1/Math.sqrt(squash),squash,1/Math.sqrt(squash));body.position.y=hop*.12;
  for(const [i,foot] of feet.entries())foot.position.z=.03+(moving?Math.sin(time*11+i*Math.PI)*.12:0);
  arms[0].rotation.z=moving?-.4-Math.sin(time*11)*.35:speaking?-.6-Math.abs(Math.sin(time*8))*.9:-.15+Math.sin(time*2.4)*.06;
  arms[1].rotation.z=moving?.4-Math.sin(time*11)*.35:.15-Math.sin(time*2.4)*.06;
  // Shared gestures (wave, nod, point) from the server's entity state.
  const g=entity.gesture;body.rotation.x=0;
  if(g&&clock<g.endsAt){
   const t=Math.max(0,clock-g.startedAt),blend=reducedMotion?1:Math.min(1,t/.18,(g.endsAt-g.startedAt-t)/.18);
   if(g.kind==='wave')arms[1].rotation.z=blend*(2.5+(reducedMotion?0:Math.sin(t*12)*.4));
   if(g.kind==='nod')body.rotation.x=blend*(reducedMotion?.18:Math.sin(t*9)*.22);
   if(g.kind==='point'){arms[1].rotation.z=blend*1.9;arms[1].rotation.x=-blend*.9;}
  }
  // Blink every few seconds.
  lookTimer=(time%4.3);const blink=sleeping?.12:lookTimer<.12?.15:1;for(const eye of eyes)eye.scale.y=blink;
  zs.forEach((z,i)=>{z.visible=sleeping&&!reducedMotion;if(!z.visible)return;const t=(time*.5+i*.5)%1;z.position.set(.25+t*.25,1.2+t*.7,.1);z.scale.setScalar(.18+t*.12);z.material.opacity=1-t;});
  sparkle.rotation.z=time*(busy?4:sleeping?.15:.7);sparkle.position.y=1.28+hop*.12+Math.sin(time*2.1)*.04;
  const pulse=busy?1+Math.sin(time*9)*.25:speaking?1.15:1;sparkle.scale.setScalar(pulse);
  glow.emissiveIntensity=busy?1.4:sleeping?.25:.8;light.intensity=sleeping?.4:night*2.4+(busy?1:0);if(sleeping)body.scale.y*=.97+Math.sin(time*1.2)*.02;
 },dispose(){
  scene.remove(root);built.dispose();glow.dispose();
  for(const s of nameplate?[nameplate,...zs]:zs){s.material.map.dispose();s.material.dispose();}
 }};
}
