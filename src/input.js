import { bindDesktopInput } from './desktop-input.js';
import { TouchLook } from './touch-look.js';

// Input owns no world reference. All character intents flow through Entity.actions.
// Camera distance change per pixel of pinch (spreading two fingers by ~200px zooms about 6 blocks).
export const PINCH_ZOOM=2.5;
export function bindInput({canvas,entity,rig,getTarget,ui,onPlay,hotbar,quiet=()=>false}) {
 const desktop=bindDesktopInput(canvas,rig,message=>ui.toast(message),show=>ui.pointerHint?.(show));ui.pointerHint?.(true);
 const keys=new Set(),look=new TouchLook();let joystick={x:0,z:0},jump=false,place=false,joyPointer=null,minePointer=null;
 const stop=()=>{desktop.stop();keys.clear();joystick={x:0,z:0};look.clear();jump=false;place=false;joyPointer=null;minePointer=null;ui.stick.style.transform='';};
 const isControl=t=>t.closest('dialog,input,select,textarea,.world-chat');
 addEventListener('keydown',e=>{
  if(isControl(e.target))return;
  if(['Space','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.code==='Space'&&!e.repeat)jump=true;
  // 1–9 pick a hotbar slot (the Bag holds everything else).
  if(/^Digit[1-9]$/.test(e.code)){hotbar.select(Number(e.code.slice(-1))-1);entity.selected=hotbar.held(entity.inventory);}
  if(e.code==='KeyE'&&!e.repeat)place=true;
  if(e.code==='KeyR'&&!e.repeat)rig.reset();
  if(e.code==='KeyF'&&!e.repeat)ui.toggleFishing();
  if(e.code==='Escape')ui.showHelp(false);
 });
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',stop);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 for(const event of ['gesturestart','gesturechange'])document.addEventListener(event,e=>{if(!e.target.closest('dialog'))e.preventDefault();},{passive:false});
 document.addEventListener('contextmenu',e=>{if(!e.target.closest('dialog'))e.preventDefault();});
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 // Touch on the world (see touch-look.js): tap jumps, drag looks, hold mines at the
 // crosshair, hold and drag keeps mining while looking, two fingers pinch to zoom.
 // (The page itself never zooms; see gesturestart above and the viewport tag.)
 canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse')return;
  e.preventDefault(); // Suppress touch-generated compatibility mouse events.
  canvas.focus();canvas.setPointerCapture(e.pointerId);
  look.down(e.pointerId,e.clientX,e.clientY,performance.now());
 });
 canvas.addEventListener('pointermove',e=>{
  if(e.pointerType==='mouse')return;
  const r=look.move(e.pointerId,e.clientX,e.clientY);
  if(r?.zoom!==undefined)rig.zoom(r.zoom*PINCH_ZOOM);else if(r?.orbit)rig.orbit(...r.orbit);
 });
 const release=e=>{if(e.pointerType!=='mouse'&&look.up(e.pointerId,performance.now())&&e.type==='pointerup'){jump=true;onPlay();}};
 canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
 // Wheel picks the hotbar slot; Ctrl+wheel (a trackpad pinch) zooms.
 canvas.addEventListener('wheel',e=>{
  e.preventDefault();if(matchMedia('(pointer:coarse)').matches||!e.deltaY)return;
  if(e.ctrlKey||e.metaKey){rig.zoom(e.deltaY*(e.ctrlKey?4:1));return;}
  hotbar.select(hotbar.index+Math.sign(e.deltaY));entity.selected=hotbar.held(entity.inventory);
 },{passive:false});
 const updateJoy=e=>{const rect=ui.joystick.getBoundingClientRect();let x=(e.clientX-rect.left-rect.width/2)/38,z=(e.clientY-rect.top-rect.height/2)/38;const l=Math.max(1,Math.hypot(x,z));x/=l;z/=l;joystick={x,z};ui.stick.style.transform=`translate(${x*30}px,${z*30}px)`;};
 ui.joystick.addEventListener('pointerdown',e=>{if(joyPointer!==null)return;joyPointer=e.pointerId;ui.joystick.setPointerCapture(e.pointerId);updateJoy(e);onPlay();});
 ui.joystick.addEventListener('pointermove',e=>{if(joyPointer===e.pointerId)updateJoy(e);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])ui.joystick.addEventListener(event,e=>{if(e.pointerId===joyPointer){joyPointer=null;joystick={x:0,z:0};ui.stick.style.transform='';}});
 ui.jump.addEventListener('pointerdown',()=>{jump=true;onPlay();});
 ui.place.addEventListener('pointerdown',()=>place=true);
 // Holding Mine mines at the crosshair; sliding that finger turns the camera while it mines.
 ui.break.addEventListener('pointerdown',e=>{if(minePointer)return;ui.break.setPointerCapture(e.pointerId);minePointer={id:e.pointerId,x:e.clientX,y:e.clientY};onPlay();});
 ui.break.addEventListener('pointermove',e=>{if(minePointer?.id!==e.pointerId)return;rig.orbit(e.clientX-minePointer.x,e.clientY-minePointer.y);minePointer.x=e.clientX;minePointer.y=e.clientY;});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])ui.break.addEventListener(event,e=>{if(minePointer?.id===e.pointerId)minePointer=null;});
 return {stop,recapture:()=>desktop.recapture(),tick(){
  if(rig.overview&&desktop.locked())desktop.stop(); // Island view hands the mouse back.
  if(document.querySelector('dialog[open]')||document.activeElement?.closest('input,select,textarea,.world-chat')){stop();entity.actions.move({x:0,y:0,z:0});return;}
  const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+joystick.x;
  const z=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'))+joystick.z;
  if(x||z||jump){onPlay();ui.fishing=false;}
  const dir=rig.movement(x,z);entity.actions.move(dir);
  if(x||z)entity.actions.lookAt({x:entity.position.x+dir.x,y:entity.position.y,z:entity.position.z+dir.z});
  if(jump){entity.actions.jump();jump=false;}
  const hit=getTarget(),held=look.mining(performance.now());
  if(held.started){onPlay();navigator.vibrate?.(8);}
  // While a build is being placed, clicks and holds order it instead of editing blocks.
  const hush=quiet();
  if(!hush&&(desktop.isMining()||held.active||minePointer)&&hit&&!rig.overview){entity.actions.breakBlock(hit.pos);ui.fishing=false;}
  if(desktop.takePlace())place=true;
  if(place&&hit&&!rig.overview&&!hush){entity.actions.placeBlock({x:hit.pos.x+hit.normal.x,y:hit.pos.y+hit.normal.y,z:hit.pos.z+hit.normal.z},entity.selected);ui.fishing=false;}
  place=false;
 }};
}
