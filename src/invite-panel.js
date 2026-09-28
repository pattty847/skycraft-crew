// "Invite a friend" in the World panel, for members only. The server makes a code
// that works for a few people for a few days; the link carries it. Below it, every
// guest's pass has an on/off switch: off disconnects them and keeps them out.
export function invitePanel(dialog,network,ui){
 const section=document.createElement('section');section.className='world-feature invite-feature';section.hidden=true;
 section.innerHTML='<h3>Invite a friend</h3><p>Make a link a friend can open to join this island as a guest. Guests can play and chat, can’t edit anyone’s protected areas, and get a few companion requests every ten minutes.</p><button type="button" data-invite>Make an invite link</button><div class="invite-result" hidden><input readonly aria-label="Invite link"><button type="button" data-copy>Copy</button><p class="invite-note"></p></div><h3>Guest passes</h3><ul class="guest-passes" aria-label="Guest passes"><li class="muted">No guests yet.</li></ul>';
 dialog.querySelector('.presence-list')?.after(section);
 const result=section.querySelector('.invite-result'),field=result.querySelector('input'),note=result.querySelector('.invite-note');
 section.querySelector('[data-invite]').onclick=()=>network.send('invite-create');
 result.querySelector('[data-copy]').onclick=async()=>{field.select();try{await navigator.clipboard.writeText(field.value);ui.toast('Invite link copied');}catch{ui.toast('Select the link and copy it');}};
 network.on('access',m=>{section.hidden=m.role!=='member';});
 const list=section.querySelector('.guest-passes'),when=t=>t?new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'earlier';
 network.on('guests',m=>{
  list.replaceChildren(...(m.guests.length?m.guests.map(g=>{
   const row=document.createElement('li'),label=document.createElement('span'),toggle=document.createElement('button');
   label.textContent=`Guest ${g.number} · joined ${when(g.joined)}${g.by===network.entity?.id?' · your invite':''} · ${g.on?g.online?'playing now':'away':'switched off'}`;
   toggle.type='button';toggle.textContent=g.on?'Switch off':'Switch on';toggle.setAttribute('aria-pressed',String(g.on));
   toggle.onclick=()=>network.send('guest-pass',{id:g.id,on:!g.on});row.append(label,' ',toggle);return row;
  }):[Object.assign(document.createElement('li'),{className:'muted',textContent:'No guests yet.'})]));
 });
 network.on('invite',m=>{
  field.value=`${location.origin}${location.pathname}?invite=${encodeURIComponent(m.code)}`;result.hidden=false;
  note.textContent=`Works for ${m.maxUses} people until ${new Date(m.expires).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'})}.`;
 });
}
