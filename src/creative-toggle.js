// Admins get a Creative button beside World: blocks break at once and placing keeps the
// stack. The server decides who is an admin and holds the mode (server/admin.js).
export function creativeToggle(network,ui){
 const button=document.createElement('button');button.type='button';button.className='world-button creative-button';button.textContent='Creative';button.hidden=true;button.setAttribute('aria-pressed','false');
 button.title='Admin creative mode: instant breaking, placing keeps your blocks';
 document.querySelector('[aria-label="World controls"]')?.prepend(button);
 let on=false;
 const show=value=>{on=value;button.setAttribute('aria-pressed',String(on));button.classList.toggle('on',on);document.body.classList.toggle('creative',on);};
 button.onclick=()=>{if(network.connected)network.send('creative',{on:!on});};
 network.on('creative',m=>{show(m.on===true);ui.toast(on?'Creative on: instant breaking, placing keeps your blocks.':'Creative off.');});
 // A new connection starts with creative off.
 network.on('access',m=>{button.hidden=m.admin!==true;show(false);});
}
