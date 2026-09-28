import { BLOCKS, BLOCK_COUNT } from './blocks.js';

export function stockpileControls(dialog,network,ui){
 const section=document.createElement('section');section.className='world-feature';
 section.innerHTML='<h3>Crew stockpile</h3><p>Stand near the centre of Crew Isle (56, 96) to share materials with companions.</p><form><label>Block<select name="block" aria-label="Stockpile block"></select></label><label>Count<input name="count" type="number" min="1" max="64" value="1" required></label><button name="deposit" type="button">Deposit</button> <button name="withdraw" type="button">Withdraw</button></form><p data-stored></p><p role="status" data-result></p>';
 dialog.querySelector('.presence-list').after(section);
 const form=section.querySelector('form'),block=form.elements.block,stored=section.querySelector('[data-stored]'),result=section.querySelector('[data-result]');
 for(let id=1;id<BLOCK_COUNT;id++)block.add(new Option(BLOCKS[id].name,id));
 let items=[];
 const render=()=>{const id=Number(block.value);stored.textContent=`Stored: ${items[id]??0} ${BLOCKS[id].name}`;};
 block.onchange=render;
 for(const type of ['deposit','withdraw'])form.elements[type].onclick=()=>{
  if(!network.connected){result.textContent='Reconnect before transferring items.';return;}
  network.entity.actions[type](Number(block.value),Number(form.elements.count.value));result.textContent='Waiting for the server…';
 };
 network.on('extensions',data=>{items=data.stockpile?.items??[];render();});
 network.on('stockpile',m=>{items=m.stockpile.items;render();});
 network.on('stockpile-result',m=>{result.textContent=m.ok?`${m.action==='deposit'?'Deposited':'Withdrew'} ${m.count} ${BLOCKS[m.blockId].name}.`:'Transfer refused. Stand within 3 blocks of the stockpile and check both stacks.';ui.toast(result.textContent);});
}
