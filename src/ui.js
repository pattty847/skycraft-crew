import { HOTBAR_SIZE } from './hotbar.js';
import { BLOCKS } from './blocks.js';
import { TILE_COUNT } from './atlas.js';
export function createUI(atlas,entity,hotbar) {
 document.querySelector('#app').innerHTML=`
 <header class="masthead"><a class="brand" href="./" aria-label="Codex Sky Block home"><span class="brand-icon">&gt;_</span><span>CODEX <strong>SKY BLOCK</strong></span></a><div class="edition">YOUR OWN LITTLE WORLD <span id="place">01 / ORIGIN ISLAND</span></div></header>
 <nav class="tools" aria-label="World controls"><button id="view" title="Switch between island overview and third person">Explore ↗</button><button id="day" title="Toggle day and night">☾ Night</button><button id="help-button" aria-label="Controls and help">?</button></nav>
 <section class="intro" id="intro"><div class="eyebrow"><span></span> SOMEWHERE ABOVE EVERYTHING</div><h1>A small island.<br>An open world.</h1><p>Make a home in the clouds.<br>One block at a time.</p><button class="primary" id="play">Step onto the island <span>↗</span></button><div class="intro-hint">Drag to orbit · Explore to start building</div></section>
 <div id="crosshair" aria-hidden="true"><i></i><i></i></div>
 <div class="target" id="target" aria-live="off"><span id="target-name"></span><div class="progress"><i id="progress"></i></div></div>
  <aside class="field-note" id="field-note"><span>MEET YOUR ISLANDER</span><strong>Codex, off the clock.</strong><p>Currently fishing for a good idea.</p></aside>
 <div class="bottom"><div class="inventory-head"><span id="selected-label">Planks</span><div><button id="craft" title="Your items and crafting (I)">Bag · Craft</button><button id="build" title="Order a build from the crew (B)">Build</button><button id="reset-camera" aria-label="Reset camera" title="Reset camera (R)">↺</button><button id="music" aria-label="Turn music on" aria-pressed="false" title="Music off">♪</button><button id="fish" aria-pressed="true" title="Toggle fishing pose (F)">Fishing</button></div></div><div class="hotbar" id="hotbar" role="toolbar" aria-label="Inventory hotbar"></div><div class="footer"><span id="control-hint">WASD move · Click to look · Left mine · Right place · Wheel picks</span><button id="save" title="Save world now">● <span id="save-state">Local world</span></button></div></div>
 <button id="hud-toggle" aria-label="Show all controls" aria-pressed="false">☰</button><div class="touch-controls"><div id="joystick" role="group" aria-label="Movement joystick"><span id="stick"></span></div><div class="touch-actions"><button id="touch-break">Mine</button><button id="touch-place">Place</button><button id="touch-jump" aria-label="Jump">↑</button></div></div>
 <div class="toast" id="toast" role="status"></div>
 <div class="click-to-play" id="click-to-play">Click to look around · Esc frees the mouse</div>
 <dialog id="help"><form method="dialog"><button class="close" aria-label="Close help">×</button></form><div class="eyebrow">FIELD GUIDE / 01</div><h2>Build your patch of sky.</h2><p>Six islands, two AI companions, one shared sky. Reshape any of it.</p><dl><dt>Walk</dt><dd>WASD or arrow keys / left joystick</dd><dt>Look</dt><dd>Click the world: the pointer hides and the mouse looks around. Escape frees it. Touch: swipe.</dd><dt>Jump</dt><dd>Space / ↑ button / tap the world</dd><dt>Mine</dt><dd>Aim the crosshair. Hold left click. Touch: hold a finger on the world or hold Mine, and drag while holding to sweep to the next block. Cracks show how close the block is to breaking.</dd><dt>Place</dt><dd>Right click (hold to keep placing), E, or Place. Uses the highlighted hotbar block.</dd><dt>Select</dt><dd>1–9, 0 for Clay, minus for Lamp / mouse wheel / tap or scroll the hotbar</dd><dt>Camera</dt><dd>Swipe up to aim overhead. ↺ or R resets the camera. V or View switches to first person; View also sets the field of view. Desktop: Ctrl+scroll or pinch to zoom.</dd><dt>Sound</dt><dd>♪ starts or mutes the soundtrack and sound effects.</dd><dt>Chat</dt><dd>T opens chat. Pick Codex or Claude, or start a message with @claude / @codex. Try “follow me” or Gather wood.</dd><dt>Map</dt><dd>M shows or hides the map. Stepping stones connect the islands; the bridge leads east to Clover Rise.</dd><dt>Fishing</dt><dd>F / Fishing button. A quiet idle pose.</dd></dl><p>Harder blocks take longer. Everything you mine goes into your inventory. Open Bag · Craft (I) to hold tools and make planks, sticks, tables, pickaxes, torches and more.</p><p>Claude lives in a little nook on Clover Rise and wanders nearby. Codex sees through a screenshot; Claude reads a text description of what is around it.</p><p class="muted">Falling brings you back with your items. Your shared world saves on the Mac automatically. Water is decorative; there is no fluid simulation or fishing loot.</p><button class="primary" id="help-done">Got it. Let's build.</button></dialog>`;
 const $=id=>document.getElementById(id), slots=[];
 const atlasURL=atlas.toDataURL();
 // Nine hotbar slots (keys 1–9); the Bag holds everything else (see src/hotbar.js).
 const icon=id=>id?`background-image:url(${atlasURL});background-size:${TILE_COUNT*100}% 100%;background-position:${BLOCKS[id].texture/(TILE_COUNT-1)*100}% 0`:'';
 for(let i=0;i<HOTBAR_SIZE;i++){
  const button=document.createElement('button');button.className='slot';button.innerHTML=`<small>${i+1}</small><i></i><span></span>`;
  button.addEventListener('click',()=>{hotbar.select(i);entity.selected=hotbar.held(entity.inventory);});$('hotbar').append(button);slots.push(button);
 }
 const shown=new Array(HOTBAR_SIZE).fill(-1);
 const ui={joystick:$('joystick'),stick:$('stick'),jump:$('touch-jump'),break:$('touch-break'),place:$('touch-place'),help:$('help'),fishing:true,
  toggleFishing(){ui.fishing=!ui.fishing;if(ui.fishing)entity.actions.say('No bites yet. The sky has excellent latency.');},
  showHelp(open){if(open&&!ui.help.open)ui.help.showModal();else if(!open&&ui.help.open)ui.help.close();},
  // Shown in play while the mouse is not captured.
  pointerHint(show){document.body.classList.toggle('mouse-free',show);},
  toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(ui.toastTimer);ui.toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3000);},
  musicStatus(enabled){$('music').setAttribute('aria-pressed',String(enabled));$('music').setAttribute('aria-label',enabled?'Mute music':'Turn music on');$('music').title=enabled?'Music on':'Music off';},
  saveStatus(message,failed=false){$('save-state').textContent=message;$('save').classList.toggle('failed',failed);},
  setPlace(name,index){const label=`${String(index+1).padStart(2,'0')} / ${name.toUpperCase()}`;if($('place').textContent!==label)$('place').textContent=label;},
  // Phones start with just the game (joystick, Place, hotbar, chat); ☰ shows everything else.
  bindHud(){
   const coarse=matchMedia('(pointer:coarse)').matches;let full=false;try{full=localStorage.getItem('sky:hud')==='full';}catch{}
   const set=on=>{full=on;document.body.classList.toggle('hud-min',coarse&&!on);$('hud-toggle').setAttribute('aria-pressed',String(on));$('hud-toggle').setAttribute('aria-label',on?'Hide extra controls':'Show all controls');try{localStorage.setItem('sky:hud',on?'full':'min');}catch{}};
   $('hud-toggle').onclick=()=>set(!full);set(full);
  },
  update({overview,hit,access,phase,progress}){
   document.body.classList.toggle('playing',!overview);
   $('view').textContent=overview?'Explore ↗':'Island view ↗';
   $('day').textContent=phase>.5?'☀ Day':'☾ Night';
   hotbar.sync(entity.inventory);entity.selected=hotbar.held(entity.inventory);
   const heldId=hotbar.slots[hotbar.index];
   $('selected-label').textContent=heldId?BLOCKS[heldId].name:'Empty hands';
   for(let i=0;i<slots.length;i++){const id=hotbar.slots[i],button=slots[i],on=i===hotbar.index;
    if(shown[i]!==id){shown[i]=id;button.querySelector('i').style.cssText=icon(id);button.title=id?`${i+1}: ${BLOCKS[id].name}`:`${i+1}: empty`;}
    button.classList.toggle('selected',on);button.classList.toggle('empty',!id||!entity.inventory[id]);button.classList.toggle('vacant',!id);button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',id?`Slot ${i+1}: ${BLOCKS[id].name}, ${entity.inventory[id]} available`:`Slot ${i+1}: empty`);button.querySelector('span').textContent=id?entity.inventory[id]:'';}

   $('fish').setAttribute('aria-pressed',String(ui.fishing));$('fish').textContent=ui.fishing?'Fishing':'Fish';
   const hint=access?.ok?'hold to mine':access?.reason==='protected'?'protected area':access?.reason==='distance'?`${access.distance.toFixed(1)} blocks away · move closer`:'path blocked · change angle';
   $('target-name').textContent=hit?`${BLOCKS[hit.id].name} · ${hint}`:'Aim at a nearby block';
   $('progress').style.transform=`scaleX(${progress})`;$('target').classList.toggle('mining',progress>0);
  },
  bind({play,toggleView,toggleDay,craft,save,resetCamera,toggleMusic}){
   $('reset-camera').onclick=resetCamera;$('music').onclick=toggleMusic;
   $('play').onclick=play;$('view').onclick=toggleView;$('day').onclick=toggleDay;$('craft').onclick=craft;$('save').onclick=save;
   $('fish').onclick=()=>ui.toggleFishing();$('help-button').onclick=()=>ui.showHelp(true);$('help-done').onclick=()=>ui.showHelp(false);
   ui.help.addEventListener('click',e=>{if(e.target===ui.help)ui.showHelp(false);});
  },
 };
 return ui;
}
