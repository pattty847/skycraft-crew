import { claimControls } from './claim-controls.js';
import { describeEntity,presenceSummary } from './presence.js';
import { jobsPanel } from './jobs-panel.js';
import { stockpileControls } from './stockpile-controls.js';
import { invitePanel } from './invite-panel.js';
import { passPanel } from './pass-panel.js';
const OLD_KEY='codex-sky-block:world:1';
export function sharedControls(network,ui,{getTarget,scene}) {
 const button=document.createElement('button');button.textContent='World';button.className='world-button';document.querySelector('[aria-label="World controls"]').append(button);
 const dialog=document.createElement('dialog');dialog.className='shared-dialog';dialog.innerHTML='<h2>One island, together</h2><p>Blocks and inventories now save on the Mac. Your previous device save is kept separately.</p><p class="connection"></p><ul class="presence-list" aria-label="Characters in this world"></ul><p>Each connected browser has its own player. Two AI companions share the sky: <strong>Codex · AI</strong> and <strong>Claude · AI</strong>. Chat (T) talks to either.</p><button data-export>Download device backup</button> <button data-import>Bring device world here</button><p class="import-note">Import is available only before the shared island has any edits. Download your phone backup first.</p><hr><h3>AI companions</h3><p><strong>Codex</strong> sees a screenshot plus nearby block coordinates. <strong>Claude</strong> reads a text description of its surroundings. Every mission is bounded and verified by the server.</p><button data-stop>Stop both</button><p class="agent-status" data-status="codex"></p><p class="agent-status" data-status="claude"></p><button data-close>Close</button>';
 document.body.append(dialog);
 const feedback=document.createElement('p');feedback.className='world-feedback';feedback.setAttribute('role','status');dialog.querySelector('h2').after(feedback);
 network.on('notice',m=>{network.notice=m.text;feedback.textContent=m.text;});
 const closeTop=document.createElement('button');closeTop.className='close';closeTop.textContent='×';closeTop.setAttribute('aria-label','Close World');closeTop.onclick=()=>dialog.close();dialog.prepend(closeTop);
 claimControls(dialog,network,ui,getTarget,scene);stockpileControls(dialog,network,ui);jobsPanel(dialog,network);passPanel(dialog,network,ui);invitePanel(dialog,network,ui);
 const updatePresence=()=>{
  if(!dialog.open)return;
  dialog.querySelector('.connection').textContent=network.connected?`Connected · ${presenceSummary(network.entities.values())}`:'Reconnecting…';
  const rows=[];for(const e of network.entities.values()){
   const identity=describeEntity(e,network.entity.id),row=document.createElement('li'),name=document.createElement('strong'),detail=document.createElement('span');
   name.textContent=identity.name;detail.textContent=`${identity.role} · (${Math.round(e.position.x)}, ${Math.round(e.position.y)}, ${Math.round(e.position.z)})`;row.append(name,detail);rows.push(row);
  }
  dialog.querySelector('.presence-list').replaceChildren(...rows);
  dialog.querySelector('[data-import]').disabled=!network.canImport||!localStorage.getItem(OLD_KEY);
 };
 button.onclick=()=>{dialog.showModal();updatePresence();};setInterval(updatePresence,500);
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 const download=()=>{const raw=localStorage.getItem(OLD_KEY);if(!raw){ui.toast('No older save on this browser. Open this menu on your phone.');return false;}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.download='sky-block-device-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return true;};
 dialog.querySelector('[data-export]').onclick=download;
 dialog.querySelector('[data-import]').onclick=()=>{if(!network.canImport)return;const raw=localStorage.getItem(OLD_KEY);if(raw&&confirm('Use this device’s island as the shared world? The server will back up its current world first. Your device save remains untouched.')){download();network.send('import',{save:JSON.parse(raw)});dialog.close();}};
 dialog.querySelector('[data-stop]').onclick=()=>network.send('agent-stop');
 if(network.canImport&&localStorage.getItem(OLD_KEY))ui.toast('Your device save is safe. Open World to back it up and import your shelter before building.');
 const showStatus=m=>{const row=dialog.querySelector(`[data-status="${m.agent??'codex'}"]`);if(row)row.textContent=m.text.startsWith(m.name??'Codex')?m.text:`${m.name??'Codex'}: ${m.text}`;};
 for(const m of Object.values(network.agents??{}))showStatus(m);
 network.onAgentStatus=m=>{showStatus(m);const name=m.name??'Codex';ui.toast(m.text.startsWith(name)?m.text:`${name}: ${m.text}`);};
}
