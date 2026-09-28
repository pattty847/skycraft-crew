import { FOV_RANGE, DEFAULT_FOV } from './camera.js';
// "View" in the top-right tools: third or first person and a field-of-view slider.
// A plain popover (not a modal dialog) so the world stays sharp while the slider moves.
// V switches views while playing. Settings are per device.
const KEY='sky:view';
export function viewControls(rig,ui){
 const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)??'{}');}catch{return {};}};
 const saved=load();
 for(const view of ['third','first'])if(Number.isFinite(saved.fov?.[view]))rig.setFov(view,saved.fov[view]);
 if(saved.firstPerson)rig.setFirstPerson(true);
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({firstPerson:rig.firstPerson,fov:rig.fov}));}catch{}};
 const button=document.createElement('button');button.type='button';button.className='view-button';button.textContent='View';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','view-panel');
 const tools=document.querySelector('[aria-label="World controls"]');tools.insertBefore(button,tools.querySelector('#help-button')??null);
 const panel=document.createElement('section');panel.id='view-panel';panel.className='view-panel';panel.hidden=true;panel.setAttribute('aria-label','View settings');
 panel.innerHTML=`<div class="view-modes" role="radiogroup" aria-label="Camera"><button type="button" role="radio" data-view="third">Third person</button><button type="button" role="radio" data-view="first">First person</button></div><label class="view-fov"><span>Field of view <output></output></span><input type="range" min="${FOV_RANGE.min}" max="${FOV_RANGE.max}" step="1"></label><div class="view-actions"><button type="button" data-default>Default</button><button type="button" data-reset>Reset camera</button></div><p class="view-hint">V switches views. Zoom all the way in for first person.</p>`;
 document.querySelector('#app').append(panel);
 const slider=panel.querySelector('input'),out=panel.querySelector('output'),modes=[...panel.querySelectorAll('[data-view]')];
 const view=()=>rig.firstPerson?'first':'third';
 const sync=()=>{for(const b of modes)b.setAttribute('aria-checked',String(b.dataset.view===view()));slider.value=rig.fov[view()];out.textContent=`${rig.fov[view()]}°`;};
 const setFirst=on=>{rig.setFirstPerson(on);save();sync();};
 const open=on=>{panel.hidden=!on;button.setAttribute('aria-expanded',String(on));if(on)sync();};
 button.onclick=()=>open(panel.hidden);
 for(const b of modes)b.onclick=()=>setFirst(b.dataset.view==='first');
 slider.oninput=()=>{rig.setFov(view(),Number(slider.value));out.textContent=`${rig.fov[view()]}°`;save();};
 panel.querySelector('[data-default]').onclick=()=>{rig.setFov(view(),DEFAULT_FOV[view()]);save();sync();};
 panel.querySelector('[data-reset]').onclick=()=>{rig.reset();ui.toast('Camera reset');};
 addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&e.target!==button)open(false);});
 addEventListener('keydown',e=>{
  if(e.target.closest?.('input,select,textarea,dialog'))return;
  if(e.code==='Escape'&&!panel.hidden)open(false);
  if(e.code==='KeyV'&&!e.repeat&&!rig.overview){setFirst(!rig.firstPerson);ui.toast(rig.firstPerson?'First person':'Third person');}
 });
 // Zooming can switch views too; keep the panel and the saved choice in step.
 let last=rig.firstPerson;
 return {tick(){if(rig.firstPerson!==last){last=rig.firstPerson;save();if(!panel.hidden)sync();}}};
}
