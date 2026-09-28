import { BLOCKS, BLOCK_COUNT } from './blocks.js';
import { TILE_COUNT } from './atlas.js';
import { RECIPE_LIST, canCraft, stationInReach } from './recipes.js';
import { givePanel } from './give-panel.js';
// "Bag": everything you carry, and every recipe grouped by where it can be made.
// Tapping an item puts it in the selected hotbar slot and holds it (that is how a
// pickaxe is equipped); if it already sits in another slot, the two swap. The page only asks;
// the server crafts through Simulation.craft and answers with a notice. Giving (and the
// admin grant) lives in give-panel.js.
const GROUPS=[{station:null,title:'By hand'},{station:'table',title:'At a crafting table',need:'Stand within 4 blocks of a crafting table.'},{station:'furnace',title:'At a furnace',need:'Stand within 4 blocks of a furnace.'}];
export function bagPanel({atlas,network,ui,hotbar}){
 const url=atlas.toDataURL(),entity=network.entity,world=network.world;
 const icon=id=>`<i class="bag-icon" style="background-image:url(${url});background-size:${TILE_COUNT*100}% 100%;background-position:${BLOCKS[id].texture/(TILE_COUNT-1)*100}% 0"></i>`;
 const name=id=>BLOCKS[id].name;
 const dialog=document.createElement('dialog');dialog.className='bag-dialog';dialog.setAttribute('aria-label','Bag and crafting');
 dialog.innerHTML=`<button class="close" aria-label="Close bag">×</button><h2>Bag</h2><p class="bag-holding" role="status"></p><div class="bag-layout"><section><h3>You carry</h3><ul class="bag-items" aria-label="Items you carry"></ul></section><section><h3>Craft</h3><div class="bag-recipes"></div><p class="bag-result" role="status"></p></section></div>`;
 document.body.append(dialog);
 const items=dialog.querySelector('.bag-items'),recipes=dialog.querySelector('.bag-recipes'),holding=dialog.querySelector('.bag-holding'),result=dialog.querySelector('.bag-result');
 dialog.querySelector('.close').onclick=()=>dialog.close();
 const giving=givePanel(network,ui);dialog.querySelector('.bag-layout section').append(giving.section);
 let last='';
 const render=()=>{
  // Redraw only when something a player can see has changed.
  const stations=GROUPS.map(g=>g.station&&stationInReach(world,entity,g.station));
  const key=`${entity.inventory.join(',')}|${entity.selected}|${hotbar.slots.join(',')}|${hotbar.index}|${stations.join(',')}`;if(key===last)return;last=key;
  const held=hotbar.slots[hotbar.index];
  holding.innerHTML=`Hotbar slot ${hotbar.index+1}: ${held&&entity.inventory[held]?`${icon(held)} <b>${name(held)}</b>`:'<b>empty hands</b>'} · tap an item to put it there`;
  const carried=[];for(let id=1;id<BLOCK_COUNT;id++)if(entity.inventory[id])carried.push(id);
  items.innerHTML=carried.length?carried.map(id=>`<li><button type="button" data-hold="${id}" class="${hotbar.slots.includes(id)?(hotbar.slots[hotbar.index]===id?'held':'on-bar'):''}" title="Put ${name(id)} in hotbar slot ${hotbar.index+1}" aria-pressed="${hotbar.slots[hotbar.index]===id}">${icon(id)}<span>${name(id)}</span><b>${entity.inventory[id]}</b></button></li>`).join(''):'<li class="muted">Nothing yet. Mine a block to start.</li>';
  recipes.innerHTML=GROUPS.map((g,i)=>{
   const list=RECIPE_LIST.filter(r=>r.station===g.station);if(!list.length)return '';
   const near=!g.station||stations[i];
   return `<div class="bag-group"><h4>${g.title}${g.station?`<small class="${near?'near':'far'}">${near?'nearby':'not nearby'}</small>`:''}</h4>${near||!g.need?'':`<p class="muted">${g.need}</p>`}<ul>${list.map(r=>{
    const check=canCraft(world,entity,r.key);
    return `<li class="${check.ok?'ready':''}"><span class="bag-out">${icon(r.output)}<b>${name(r.output)}</b>${r.count>1?` ×${r.count}`:''}</span><span class="bag-in">${r.inputs.map(([id,n])=>`<span class="${entity.inventory[id]>=n?'':'short'}">${icon(id)}${n} ${name(id)}</span>`).join('')}</span><button type="button" data-make="${r.key}" ${check.ok?'':`disabled title="${check.reason}"`}>Make</button></li>`;}).join('')}</ul></div>`;
  }).join('');
 };
 items.addEventListener('click',e=>{const b=e.target.closest('[data-hold]');if(b){hotbar.assign(hotbar.index,Number(b.dataset.hold));entity.selected=hotbar.held(entity.inventory);render();}});
 recipes.addEventListener('click',e=>{const b=e.target.closest('[data-make]');if(!b||b.disabled)return;network.send('craft-material',{recipe:b.dataset.make});result.textContent='Crafting…';});
 network.on('notice',m=>{if(dialog.open)result.textContent=m.text;});
 let timer=null;
 const open=()=>{if(dialog.open)return;last='';result.textContent='';giving.reset();render();giving.render();dialog.showModal();timer=setInterval(()=>{render();giving.render();},250);};
 dialog.addEventListener('close',()=>{clearInterval(timer);timer=null;});
 addEventListener('keydown',e=>{if(e.code==='KeyI'&&!e.repeat&&!e.target.closest('input,select,textarea')&&!document.querySelector('dialog[open]:not(.bag-dialog)')){e.preventDefault();dialog.open?dialog.close():open();}});
 return {open};
}
