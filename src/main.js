import { createLampLights } from './lamp-lights.js';
import { createGestureEffects } from './gesture-effects.js';
import * as THREE from 'three';
import { connectWorld } from './network.js';
import { inAppGate } from './in-app-browser.js';
import { describeEntity, personaFor } from './presence.js';
import { createChat } from './chat.js';
import { creativeToggle } from './creative-toggle.js';
import { sharedControls } from './shared-controls.js';
import { BLOCKS } from './blocks.js';
import { ISLANDS, islandAt } from './world.js';
import { createAtlas } from './atlas.js';
import { ChunkRenderer } from './chunks.js';
import { createCharacter } from './character.js';
import { createClaude } from './claude-character.js';
import { Atmosphere } from './atmosphere.js';
import { CameraRig } from './camera.js';
import { raycast } from './raycast.js';
import { createUI } from './ui.js';
import { bindInput } from './input.js';
import { IslandMusic } from './music.js';
import { Sfx } from './sfx.js';
import { Particles } from './particles.js';
import { createBubbles } from './bubbles.js';
import { createMinimap } from './minimap.js';
import { createBuildPreview } from './build-preview.js';
import { createBlockCracks } from './block-cracks.js';
import { viewControls } from './view-controls.js';
import { bagPanel } from './bag-panel.js';
import { createBuildPanel } from './build-panel.js';
import { Hotbar } from './hotbar.js';
import { detectQuality, shadowSchedule } from './quality.js';
import { drawShadowProxies } from './shadow-proxy.js';
import './style.css';
const axes=['x','y','z'];
async function start() {
 // One quality tier for the session: phones get a lighter renderer (src/quality.js).
 const quality=detectQuality();
 const renderer=new THREE.WebGLRenderer({antialias:quality.antialias,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,quality.pixelRatio));renderer.setSize(innerWidth,innerHeight);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=quality.softShadows?THREE.PCFSoftShadowMap:THREE.PCFShadowMap;
 renderer.shadowMap.autoUpdate=!quality.shadowInterval;drawShadowProxies(renderer);
 const shadows=shadowSchedule({interval:quality.shadowInterval});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Codex Sky Block 3D world. Use WASD to walk; click to capture the mouse and look around.');
 document.body.prepend(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.08,520);
 const gestureEffects=createGestureEffects(scene);
 await inAppGate(document.querySelector('#app'));
 document.querySelector('#app').innerHTML='<section class="fatal"><h1>Connecting to your island…</h1><p>The shared server needs to be running on the Mac.</p></section>';
 const simulation=await connectWorld(),world=simulation.world,entity=simulation.entity;
 const atlas=createAtlas(),chunks=new ChunkRenderer(scene,world,atlas.texture),atmosphere=new Atmosphere(scene,world,{shadowMapSize:quality.shadowMapSize});
 const lampLights=createLampLights(scene,world,{size:quality.lights}),lightSources=[];
 simulation.onSnapshot=()=>lampLights.refresh(true);
 atmosphere.phase=simulation.phase;
 const ownIdentity=describeEntity(entity,entity.id);
 const character=createCharacter(scene,{label:'',tint:ownIdentity.tint}),rig=new CameraRig(camera,world),hotbar=new Hotbar((()=>{try{return localStorage;}catch{return null;}})(),`sky:hotbar:${entity.id}`),ui=createUI(atlas.canvas,entity,hotbar);
 const music=new IslandMusic(),sfx=new Sfx(),particles=new Particles(scene),bubbles=createBubbles(document.querySelector('#app')),minimap=createMinimap(document.querySelector('#app'),world);
 const buildPreview=createBuildPreview(scene,simulation,world),cracks=createBlockCracks(scene);
 atmosphere.refresh(world);
 let wasFishing=false,target=null,elapsed=0,last=performance.now(),accumulator=0,uiTimer=0,lastPlace=null;
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const save=()=>simulation.save();
 simulation.onStatus=text=>ui.saveStatus(text);
 sharedControls(simulation,ui,{getTarget:()=>target,scene});creativeToggle(simulation,ui);
 // Other characters render from a smoothed copy of their 20 Hz server state.
 const others=new Map(),shown=new Map();
 const smooth=(e,dt)=>{
  let s=shown.get(e.id);if(!s){s={position:{...e.position},yaw:Math.atan2(e.direction.x,e.direction.z)};shown.set(e.id,s);}
  const k=1-Math.exp(-dt*14),far=Math.hypot(...axes.map(a=>e.position[a]-s.position[a]))>4;
  for(const a of axes)s.position[a]=far?e.position[a]:s.position[a]+(e.position[a]-s.position[a])*k;
  const yaw=Math.atan2(e.direction.x,e.direction.z);let turn=yaw-s.yaw;turn=Math.atan2(Math.sin(turn),Math.cos(turn));s.yaw+=turn*Math.min(1,k*1.4);
  return {...e,position:s.position,direction:{x:Math.sin(s.yaw),y:0,z:Math.cos(s.yaw)}};
 };
 simulation.onBlockChange=(p,before,after)=>{
  minimap.changed(p.x,p.z);
  const d=Math.hypot(p.x+.5-entity.position.x,p.y+.5-entity.position.y,p.z+.5-entity.position.z);
  if(before&&!after){particles.broke(p,before);sfx.broke(before,d);}else if(after){particles.placed(p,after);sfx.placed(d);}
 };
 simulation.onCapture=m=>{
  if(document.hidden)return;
  if(world.dirty.size){chunks.update();atmosphere.refresh(world);renderer.shadowMap.needsUpdate=true;}
  // Look where the companion is facing, slightly downward, from its eyes.
  const captureCamera=new THREE.PerspectiveCamera(65,4/3,.1,150),d=m.direction??{x:0,z:1};
  captureCamera.position.set(m.position.x,m.position.y+1.5,m.position.z);
  captureCamera.lookAt(m.position.x+d.x*4,m.position.y+.4,m.position.z+d.z*4);
  const subject=others.get(m.entityId??'codex-companion');if(subject)subject.root.visible=false;
  const size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();
  renderer.setPixelRatio(1);renderer.setSize(640,480,false);renderer.render(scene,captureCamera);
  const image=renderer.domElement.toDataURL('image/jpeg',.8);
  renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);if(subject)subject.root.visible=true;
  renderer.render(scene,camera);simulation.send('capture',{request:m.request,revision:simulation.revision,image});
 };
 const play=()=>{rig.overview=false;ui.fishing=false;};
 // Tell the server when nobody is really playing here (island view, a hidden tab, the title
 // screen), so companions do not think on their own for an empty room. Resent now and then
 // so a reconnect picks it up.
 let awaySent=null,awayAt=0;setInterval(()=>{if(!simulation.connected)return;const away=document.hidden||rig.overview||!document.body.classList.contains('playing'),now=Date.now();if(away!==awaySent||now-awayAt>15000){simulation.send('presence',{away});awaySent=away;awayAt=now;}},1000);
 const bag=bagPanel({atlas:atlas.canvas,network:simulation,ui,hotbar});
 ui.bindHud();
 ui.bind({resetCamera:()=>{rig.reset();ui.toast('Camera reset');},toggleMusic:async()=>{try{const on=await music.toggle();sfx.setEnabled(on);ui.musicStatus(on);}catch(error){ui.toast('Music could not start. Tap ♪ to try again.');}},play:()=>{play();renderer.domElement.focus();},toggleView:()=>{rig.overview=!rig.overview;},toggleDay:()=>simulation.send('day'),craft:()=>bag.open(),save});
 const input=bindInput({canvas:renderer.domElement,entity,rig,getTarget:()=>target,ui,onPlay:play,hotbar,quiet:()=>buildPanel?.placing()}),viewSettings=viewControls(rig,ui);
 const buildPanel=createBuildPanel({scene,network:simulation,world,rig,getTarget:()=>target,ui});document.querySelector('#build')?.addEventListener('click',()=>buildPanel.open());
 createChat(simulation,renderer.domElement,()=>input.stop(),{onClose:()=>{if(document.body.classList.contains('playing'))input.recapture();},onReply:entry=>{if(entry.name==='Claude')sfx.chirp();else sfx.blip();}});
 addEventListener('keydown',event=>{if(event.code==='KeyM'&&!event.repeat&&!event.target.closest('input,select,textarea,dialog'))ui.toast(minimap.toggle()?'Map hidden · M to show':'Map shown');});
 const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012,1.012,1.012)),new THREE.LineBasicMaterial({color:0xfff7bf}));scene.add(outline);
 const caster=new THREE.Raycaster(),screenCenter=new THREE.Vector2(0,0);
 ui.saveStatus('Shared world · connected');
 const draw=now=>{
  const dt=Math.min((now-last)/1000,.1);last=now;elapsed+=dt;accumulator+=dt;
  const view=simulation.view(dt);rig.update(view,dt);viewSettings.tick();
  caster.setFromCamera(screenCenter,camera);target=raycast(world,caster.ray.origin,caster.ray.direction,90);
  while(accumulator>=1/60){input.tick();simulation.tick();accumulator-=1/60;}
  if(world.dirty.size&&chunks.update({budgetMs:quality.meshBudgetMs,focus:rig.target})){atmosphere.refresh(world);shadows.request();}
  atmosphere.update(dt,reducedMotion);atmosphere.phase=simulation.phase;atmosphere.follow(rig.target,rig.overview);
  scene.fog.near=rig.overview?170:110;scene.fog.far=rig.overview?420:260;
  const clock=simulation.clock();gestureEffects.update(simulation.entities,clock,world);
  character.update(view,elapsed,ui.fishing,clock,reducedMotion);particles.update(dt);buildPreview.update(dt,elapsed);buildPanel.update();
  // Phone tier: shadows redraw at a low rate while anyone moves (see shadowSchedule).
  let moving=Math.hypot(view.velocity.x,view.velocity.y,view.velocity.z)>.05;
  if(ui.fishing!==wasFishing){wasFishing=ui.fishing;shadows.request();}
  const night=1-atmosphere.daylight,speakers=[{id:entity.id,position:view.position,text:simulation.time<entity.speechUntil?entity.speech:''}];
  for(const [id,e] of simulation.entities){
   if(id===entity.id)continue;
   const identity=describeEntity(e,entity.id),persona=personaFor(id);
   if(!others.has(id)){shadows.request();others.set(id,persona?.key==='claude'?createClaude(scene,{label:identity.name}):createCharacter(scene,{label:identity.name,tint:identity.tint}));}
   if(Math.hypot(e.velocity.x,e.velocity.y,e.velocity.z)>.05)moving=true;
   const shownState=smooth(e,dt),speaking=simulation.time<e.speechUntil;
   others.get(id).update(shownState,elapsed,persona?.key==='claude'?{busy:!!simulation.agents?.claude?.busy,speaking,night,clock,reducedMotion,sleeping:night>.6&&!simulation.agents?.claude?.busy&&Math.hypot(e.velocity.x,e.velocity.z)<.1&&Math.hypot(e.position.x-persona.home.x,e.position.z-persona.home.z)<2}:false,clock,reducedMotion);
   speakers.push({id,position:shownState.position,text:speaking?e.speech:'',tone:persona?.key,height:persona?.key==='claude'?1.95:2.25});
  }
  for(const [id,c] of others)if(!simulation.entities.has(id)){c.dispose();others.delete(id);shown.delete(id);shadows.request();}
  // Lanterns and Claude's glow share the fixed light pool with placed lamps.
  lightSources.length=0;lightSources.push(...atmosphere.lights);for(const c of others.values())if(c.light)lightSources.push(c.light);
  lampLights.update(view.position,night,lightSources);
  if(!renderer.shadowMap.autoUpdate&&shadows.tick(dt,rig.target,moving))renderer.shadowMap.needsUpdate=true;
  character.root.visible=rig.overview||rig.actualDistance>=3;
  const access=target?simulation.blockAccess(entity,target.pos):null;
  const reachable=access?.ok;
  outline.visible=!!target&&!rig.overview&&!!reachable;
  if(outline.visible)outline.position.set(target.pos.x+.5,target.pos.y+.5,target.pos.z+.5);
  cracks.update(entity.breaking);
  if(simulation.notice){ui.toast(simulation.notice);simulation.notice='';}
  uiTimer+=dt;
  if(uiTimer>.1){
   uiTimer=0;document.body.classList.toggle('night',atmosphere.daylight<.4);
   ui.update({overview:rig.overview,hit:target,access,phase:atmosphere.phase,progress:entity.breaking?entity.breaking.elapsed/BLOCKS[entity.breaking.id].hardness:0});
   const place=islandAt(view.position.x,view.position.z);ui.setPlace(place,Math.max(0,ISLANDS.findIndex(i=>i.name===place)));
   if(place!==lastPlace&&place!=='Open sky'){if(lastPlace&&!rig.overview)ui.toast(`Welcome to ${place}`);lastPlace=place;}
   minimap.update(simulation.entities.values(),entity.id,view);
  }
  bubbles.update(camera,rig.overview?[]:speakers);
  renderer.render(scene,camera);
 };
 renderer.setAnimationLoop(draw);
 // ?perf exposes the renderer for draw-call and frame-time checks (renderer.info.render.calls).
 if(new URLSearchParams(location.search).has('perf'))window.skyPerf={renderer,scene,camera,rig,quality,step:()=>draw(performance.now())};
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){music.pause();sfx.setEnabled(false);input.stop();renderer.setAnimationLoop(null);}else{music.resume().then(()=>sfx.setEnabled(music.enabled)).catch(()=>{ui.musicStatus(false);ui.toast('Tap ♪ to resume music.');});last=performance.now();accumulator=0;renderer.setAnimationLoop(draw);}});
 // No save on hide or close: the server saves every 5 s and when a player leaves.
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer.setAnimationLoop(null);ui.toast('Graphics paused. Reload to restore your saved island.');});
}
start().catch(error=> {
 console.error(error);
 const message=error?.userFacing||/older than the server|wrong size/.test(error?.message)?error.message:'This world needs a browser with WebGL enabled. Try a current browser with hardware acceleration, then reload.';
 document.querySelector('#app').innerHTML=`<section class="fatal"><h1>${error?.userFacing?'Can’t join yet':'The island could not start.'}</h1><p></p></section>`;document.querySelector('.fatal p').textContent=message;
});
