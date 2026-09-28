// "Keep playing elsewhere" in the World panel, for everyone. Each browser keeps its
// own secret pass; a pass link carries it to another browser or to the Home Screen
// (which keeps separate storage from Safari), so the same player comes back.
const standalone=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
export function passPanel(dialog,network,ui){
 const section=document.createElement('section');section.className='world-feature pass-feature';
 section.innerHTML=`<h3>Play on your Home Screen</h3><p>Your pass link brings this same player and inventory to your Home Screen or another browser. Anyone with it plays as you, so keep it to yourself.</p><button type="button" data-pass>Get my pass link</button><div class="invite-result" hidden><input readonly aria-label="Your pass link"><button type="button" data-copy>Copy</button><p class="invite-note">${standalone()?'You are already playing from your Home Screen.':'On iPhone: close this panel, tap Share, then “Add to Home Screen”. The icon opens as you.'}</p></div>`;
 dialog.querySelector('.presence-list')?.after(section);
 const result=section.querySelector('.invite-result'),field=result.querySelector('input');
 section.querySelector('[data-pass]').onclick=()=>{
  const link=network.passLink();field.value=link;result.hidden=false;
  // The address bar now holds the pass, so Add to Home Screen saves it; the next load removes it.
  history.replaceState(null,'',link);
 };
 result.querySelector('[data-copy]').onclick=async()=>{field.select();try{await navigator.clipboard.writeText(field.value);ui.toast('Pass link copied — keep it private');}catch{ui.toast('Select the link and copy it');}};
}
