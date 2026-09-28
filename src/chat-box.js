// Drag the chat by its header and resize it from the corner, on wide screens with a
// mouse or trackpad. The box is remembered per device and kept on screen; a double
// click on the header puts it back. Closed, the chat always sits in the stylesheet's
// corner (bottom left on wide screens). Phones keep the stylesheet layout.
const KEY='sky:chat-box',MIN={w:260,h:220},MARGIN=8;
export const clampBox=(b,view)=>{
 const w=Math.min(Math.max(b.w,MIN.w),view.w-MARGIN*2),h=Math.min(Math.max(b.h,MIN.h),view.h-MARGIN*2);
 return {x:Math.min(Math.max(b.x,MARGIN),view.w-w-MARGIN),y:Math.min(Math.max(b.y,MARGIN),view.h-h-MARGIN),w,h};
};
export function chatBox(panel,handle,corner){
 const wide=()=>matchMedia('(pointer:fine) and (min-width:701px) and (min-height:521px)').matches;
 let box=null,folded=true;try{const b=JSON.parse(localStorage.getItem(KEY));if(['x','y','w','h'].every(k=>Number.isFinite(b?.[k])))box=b;}catch{}
 const view=()=>({w:innerWidth,h:innerHeight});
 const apply=()=>{
  const on=!!box&&wide()&&!folded;panel.classList.toggle('placed',on);
  if(!on){panel.style.left=panel.style.top=panel.style.width=panel.style.height='';return;}
  box=clampBox(box,view());Object.assign(panel.style,{left:`${box.x}px`,top:`${box.y}px`,width:`${box.w}px`,height:`${box.h}px`});
 };
 const save=()=>{try{box?localStorage.setItem(KEY,JSON.stringify(box)):localStorage.removeItem(KEY);}catch{}};
 const measured=()=>{const r=panel.getBoundingClientRect();return {x:r.left,y:r.top,w:box?.w??r.width,h:box?.h??(folded?360:r.height)};};
 const drag=(el,move)=>el.addEventListener('pointerdown',e=>{
  if(!wide()||e.button!==0||(el===handle&&e.target.closest('button')))return;
  e.preventDefault();el.setPointerCapture(e.pointerId);// The box and the pointer are separate origins: move by how far the pointer travelled.
  const start=measured(),from={x:e.clientX,y:e.clientY};panel.classList.add('moving');
  const onMove=m=>{box=clampBox(move(start,m.clientX-from.x,m.clientY-from.y),view());apply();};
  const end=()=>{el.removeEventListener('pointermove',onMove);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',end);panel.classList.remove('moving');save();};
  el.addEventListener('pointermove',onMove);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
 });
 drag(handle,(s,dx,dy)=>({x:s.x+dx,y:s.y+dy,w:s.w,h:s.h}));
 drag(corner,(s,dx,dy)=>{if(folded)return {x:s.x,y:s.y,w:s.w,h:s.h};return {x:s.x,y:s.y,w:s.w+dx,h:s.h+dy};});
 handle.addEventListener('dblclick',e=>{if(e.target.closest('button'))return;box=null;save();apply();});
 addEventListener('resize',apply);
 return {collapsed(value){folded=value;apply();}};
}
