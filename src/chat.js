import './chat.css';
import { PERSONAS } from './presence.js';
import { chatBox } from './chat-box.js';
// Older saves have a capabilities blurb posted before every request; it is no longer sent.
const LEGACY_INTRO=/^(Claude|Codex) · can talk\b/;
// Minecraft-style: closed, new lines show over the game for 8–10 s and fade; T opens the
// whole conversation, Enter sends and closes, Esc closes.
export const lineLife=text=>Math.min(10000,8000+String(text??'').length*20);
export function createChat(network,canvas,onFocus,{onReply=()=>{},onClose=()=>{}}={}) {
 const panel=document.createElement('section');panel.className='world-chat';panel.setAttribute('aria-label','Island chat');
 panel.innerHTML=`<header><button class="chat-toggle" aria-expanded="true" aria-controls="chat-body">Chat <kbd>T</kbd><span class="chat-unread"></span></button><span class="chat-grip" aria-hidden="true"></span></header><div id="chat-body"><div class="chat-agents" role="group" aria-label="Who hears you">${Object.values(PERSONAS).map(p=>`<button type="button" role="checkbox" data-agent="${p.key}" class="agent-${p.key}"><i></i><span><b>${p.name}</b><small></small></span></button>`).join('')}</div><div class="chat-log" role="log" aria-live="polite" aria-label="Shared conversation"></div><form><div class="chat-compose"><label class="sr-only" for="chat-message">Message</label><input id="chat-message" maxlength="1000" autocomplete="off"><button type="submit">Send</button></div><div class="chat-options"><button class="chat-come" type="button">Come here</button><button class="chat-follow" type="button">Follow me</button><button class="chat-stop" type="button" disabled>Stop</button><button class="chat-debug" type="button" aria-pressed="false" title="Show skill modes for testing">⚙</button><label class="chat-mode" hidden>Mode <select aria-label="Companion mode"></select></label></div><p class="chat-hint">Enter sends and closes · Esc closes · light a companion, or say a name, “both” or “anyone”</p></form></div><span class="chat-resize" aria-hidden="true"></span>`;
 document.querySelector('#app').append(panel);
 const log=panel.querySelector('.chat-log'),input=panel.querySelector('input'),form=panel.querySelector('form'),toggle=panel.querySelector('.chat-toggle'),send=panel.querySelector('[type=submit]'),stop=panel.querySelector('.chat-stop');
 const come=panel.querySelector('.chat-come'),follow=panel.querySelector('.chat-follow'),mode=panel.querySelector('select'),modeLabel=panel.querySelector('.chat-mode'),debug=panel.querySelector('.chat-debug'),agentButtons=[...panel.querySelectorAll('[data-agent]')];
 const box=chatBox(panel,panel.querySelector('header'),panel.querySelector('.chat-resize'));
 // The server lists the modes its skills provide; a new skill needs no change here.
 // Auto is the everyday mode; the rest stay behind the ⚙ toggle for testing skills.
 const fillModes=list=>{const options=list?.length?list:[{key:'talk',label:'Chat'}],current=options.some(m=>m.key===mode.value)?mode.value:options[0].key;mode.replaceChildren(...options.map(m=>new Option(m.label,m.key,m.key===current,m.key===current)));};
 fillModes(network.modes);network.onModes=fillModes;
 const everyday=()=>[...mode.options].find(o=>o.value==='auto')?.value??mode.options[0]?.value??'talk';
 let showModes=false;try{showModes=localStorage.getItem('sky:chat-modes')==='1';}catch{}
 const setModes=on=>{showModes=on;modeLabel.hidden=!on;debug.setAttribute('aria-pressed',String(on));if(!on)mode.value=everyday();try{localStorage.setItem('sky:chat-modes',on?'1':'0');}catch{}};
 debug.onclick=()=>setModes(!showModes);setModes(showModes);
 // Lit companions hear messages that do not name anyone; the server resolves names and "both".
 let unread=0,history=true,selected=['claude'];
 try{const saved=JSON.parse(localStorage.getItem('sky:chat-agents')??'null')??[localStorage.getItem('sky:chat-agent')];const valid=saved.filter(k=>PERSONAS[k]);if(valid.length)selected=valid;}catch{}
 const seen=new Set(),busy=key=>!!network.agents?.[key]?.busy,names=()=>selected.map(k=>PERSONAS[k].name).join(' & ');
 const collapsed=value=>{panel.classList.toggle('collapsed',value);document.body.classList.toggle('chat-open',!value);toggle.setAttribute('aria-expanded',String(!value));box.collapsed(value);if(!value){unread=0;panel.querySelector('.chat-unread').textContent='';log.scrollTop=log.scrollHeight;}};
 collapsed(true);
 toggle.onclick=()=>collapsed(!panel.classList.contains('collapsed'));
 // While closed, fresh lines show for a few seconds (longer ones stay longer), at most six.
 const FEED=6;
 const fresh=(row,text)=>{if(history||!row)return;clearTimeout(row._fade);clearTimeout(row._gone);row.classList.remove('fading');row.classList.add('fresh');
  const life=lineLife(text);row._fade=setTimeout(()=>row.classList.add('fading'),life-800);row._gone=setTimeout(()=>row.classList.remove('fresh','fading'),life);
  const all=[...log.children].filter(r=>r.classList.contains('fresh'));for(let i=0;i<all.length-FEED;i++)all[i].classList.remove('fresh','fading');};
 // Enter takes the mouse back into the game; Esc only closes (the browser also frees the mouse on Esc).
 const close=(back=false)=>{const was=!panel.classList.contains('collapsed');collapsed(true);input.blur();canvas.focus();if(was&&back)onClose();};
 const tone=entry=>Object.values(PERSONAS).find(p=>p.name===entry.name&&entry.kind==='assistant')?.key;
 // World receipts in a row fold into one activity line: the latest step, a count, and
 // the full list on click. Failures keep their own warning line.
 let activity=null;
 const activityLine=entry=>{
  // Queue notes are news, not failures.
  const ok=entry.kind==='action'||/ will answer after |queued message was/.test(entry.text),text=entry.text.replace(/^Confirmed: /,'');
  if(!ok){activity=null;const row=document.createElement('div');row.className='chat-row activity warn';row.textContent=text;return row;}
  if(activity&&log.lastElementChild===activity.row){activity.steps.push(text);}
  else{const row=document.createElement('details');row.className='chat-row activity';row.innerHTML='<summary><span></span><em></em></summary><ol></ol>';activity={row,steps:[text]};}
  const {row,steps}=activity;const who=/^(Claude|Codex)\b/.exec(steps[0])?.[1]?.toLowerCase();if(who)row.classList.add(`agent-${who}`);row.querySelector('summary span').textContent=steps.at(-1);row.querySelector('summary em').textContent=steps.length>1?`${steps.length} steps`:'';
  const item=document.createElement('li');item.textContent=text;row.querySelector('ol').append(item);return row;
 };
 function append(entry){if(seen.has(entry.id))return;seen.add(entry.id);
  if(entry.name==='World'&&LEGACY_INTRO.test(entry.text))return;
  const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<45;log.querySelector('.chat-empty')?.remove();
  let row;
  if(entry.name==='World'&&['action','system'].includes(entry.kind))row=activityLine(entry);
  else{activity=null;row=document.createElement('div');row.className=`chat-row ${['user','assistant'].includes(entry.kind)?entry.kind:'system'} ${tone(entry)?`agent-${tone(entry)}`:''}`;
   const name=document.createElement('strong');name.textContent=entry.entityId===network.entity.id?'You':entry.name;
   const text=document.createElement('span');text.textContent=entry.text;row.append(name,text);}
  if(row.parentNode!==log)log.append(row);fresh(row,entry.text);while(log.children.length>100)log.firstElementChild.remove();
  if(nearBottom)log.scrollTop=log.scrollHeight;if(!history&&panel.classList.contains('collapsed')&&entry.kind==='assistant')panel.querySelector('.chat-unread').textContent=`(${++unread})`;
  return row;
 }
 if(!network.chat.length)log.innerHTML='<p class="chat-empty">Say hello! Claude lives on Clover Rise across the east bridge; Codex fishes on Origin Island. Ask either to come here, follow you, gather wood, build something, wave, or point at a block.</p>';
 network.chat.forEach(append);history=false;
 network.onChat=entry=>{const key=tone(entry);if(key)thought(key);append(entry);if(entry.kind==='assistant')onReply(entry);};
 // History arriving with a (re)connect is not news; only live replies count as unread.
 network.onChatHistory=entries=>{history=true;for(const entry of entries)append(entry);history=false;};
 // Each companion button shows what that companion is doing right now.
 // Idle companions show their top goal (set in their reflection pass); busy ones show the work.
 let goals=network.extensions?.goals??{};
 const goalOf=key=>goals[PERSONAS[key].id]?.[0];
 const doing=key=>{const s=network.agents?.[key],idle=goalOf(key)?`goal: ${goalOf(key)}`:'here';if(!s)return idle;const text=String(s.text??'').replace(new RegExp(`^${PERSONAS[key].name}(:| ·| is)?\\s*`),'');return s.busy?text||'working…':idle;};
 const update=()=>{
  const name=names(),working=selected.some(busy);
  for(const b of agentButtons){const key=b.dataset.agent,on=selected.includes(key);b.setAttribute('aria-checked',String(on));b.classList.toggle('selected',on);b.classList.toggle('busy',busy(key));const small=b.querySelector('small'),text=doing(key);const all=goals[PERSONAS[key].id]??[];if(small.textContent!==text){small.textContent=text;b.title=`${PERSONAS[key].name}: ${text}${all.length>1?`\nGoals: ${all.join(' · ')}`:''}`;}}
  // A message to a busy companion is queued by the server and answered afterwards.
  send.disabled=!network.connected;come.disabled=follow.disabled=!network.connected;stop.disabled=!working;
  input.placeholder=network.connected?(working?`Message ${name} (answers after this)…`:`Message ${name}…`):'Reconnecting…';
  panel.dataset.agent=selected.length>1?'both':selected[0];
 };
 const store=()=>{try{localStorage.setItem('sky:chat-agents',JSON.stringify(selected));}catch{}update();};
 const choose=key=>{selected=[key];store();};
 // Tapping toggles a companion; the last lit one stays lit.
 for(const b of agentButtons)b.onclick=()=>{const key=b.dataset.agent;selected=selected.includes(key)?(selected.length>1?selected.filter(k=>k!==key):selected):[...selected,key];store();};
 // Every model call shows as a highlighted line: live while the model thinks, then how long it took.
 // Servers that predate the thinking field are read from the status text.
 const thinking=new Map(),WHY={reply:'is thinking…','follow-up':'is checking what happened…',reflect:'is reflecting…',dawn:'is waking up…',look:'is looking at something new…'},DONE={reply:'thought','follow-up':'checked','reflect':'reflected',dawn:'woke up',look:'looked'};
 const think=(key,why='reply')=>{if(!PERSONAS[key]||thinking.has(key))return;activity=null;log.querySelector('.chat-empty')?.remove();
  const row=document.createElement('div');row.className=`chat-row thinking agent-${key}`;row.innerHTML='<i></i><span></span>';row.querySelector('span').textContent=`${PERSONAS[key].name} ${WHY[why]??WHY.reply}`;
  const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<45;log.append(row);if(nearBottom)log.scrollTop=log.scrollHeight;fresh(row,'');thinking.set(key,{row,why,start:performance.now()});};
 const thought=key=>{const t=thinking.get(key);if(!t)return;thinking.delete(key);t.row.classList.add('done');t.row.querySelector('span').textContent=`${PERSONAS[key].name} ${DONE[t.why]??DONE.reply} · model call ${((performance.now()-t.start)/1000).toFixed(1)} s`;};
 network.onChatStatus=m=>{const key=m?.agent??'codex',on=typeof m?.thinking==='boolean'?m.thinking:!!m?.busy&&/\bthinking\b/i.test(m?.text??'');if(on)think(key,m.why);else thought(key);update();};
 const previous=network.onStatus;network.onStatus=text=>{previous(text);update();};
 input.addEventListener('focus',()=>{onFocus();if(document.pointerLockElement)document.exitPointerLock();});
 const say=(text,chosenMode=showModes?mode.value:everyday())=>{if(!network.connected)return;network.send('chat-send',{text,mode:chosenMode,agent:selected[0],agents:selected});};
 form.onsubmit=event=>{event.preventDefault();const text=input.value.trim();if(text&&network.connected){say(text);input.value='';}close(true);};
 come.onclick=()=>say(`${names().replace(' & ',' and ')}, come here.`,'talk');
 follow.onclick=()=>say(`${names().replace(' & ',' and ')}, follow me.`,'talk');
 stop.onclick=()=>{for(const key of selected)network.send('agent-stop',{agent:key});};
 panel.addEventListener('keydown',event=>{event.stopPropagation();if(event.code==='Escape'){event.preventDefault();close();}});
 addEventListener('keydown',event=>{if(event.code==='KeyT'&&!event.target.closest('input,select,textarea,dialog')){event.preventDefault();collapsed(false);input.focus();}});
 network.on('goals',m=>{goals=m.goals??{};update();});
 network.on('extensions',x=>{goals=x.goals??goals;update();});
 update();return {append,choose};
}
