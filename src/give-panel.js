import { BLOCKS, BLOCK_COUNT } from './blocks.js';
import { PERSONAS } from './presence.js';
// The Bag's "Give" section: hand your own items to a companion standing close by
// (or call one over), and, for admins only, conjure items for anyone present. The
// server checks reach, counts and who is an admin; this page only asks.
// The server's reach for giving (src/simulation.js GIVE_REACH; tests/admin.test.js keeps them equal).
export const GIVE_REACH=3;
const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children.filter(c=>c!=null));return n;};
const name=id=>BLOCKS[id]?.name??`item ${id}`;
export function givePanel(network,ui){
 const entity=network.entity;let admin=false,lastKey='';
 const result=el('p',{className:'bag-give-result'});result.setAttribute('role','status');
 const item=el('select',{name:'item'}),count=el('input',{type:'number',min:1,max:64,value:16}),to=el('div',{className:'bag-give-to'});
 item.setAttribute('aria-label','Item to give');count.setAttribute('aria-label','How many to give');
 const give=el('div',{className:'bag-give-row'},el('label',{},'Item ',item),el('label',{},'How many ',count));
 const target=el('select',{name:'target'}),grantItem=el('select',{name:'grant-item'}),grantCount=el('input',{type:'number',min:1,max:64,value:64}),grantButton=el('button',{type:'button',className:'primary',textContent:'Grant'});
 for(let id=1;id<BLOCK_COUNT;id++)if(BLOCKS[id]&&BLOCKS[id].kind!=='air')grantItem.add(new Option(name(id),id));
 const grant=el('div',{className:'bag-grant',hidden:true},el('h3',{textContent:'Admin grant'}),el('p',{className:'muted',textContent:'Items from nowhere, for anyone on the island. Only admins see this.'}),
  el('div',{className:'bag-give-row'},el('label',{},'To ',target),el('label',{},'Item ',grantItem),el('label',{},'How many ',grantCount),grantButton));
 const section=el('section',{className:'bag-give'},el('h3',{textContent:'Give'}),give,to,grant,result);
 const distance=key=>{const c=network.entities.get(PERSONAS[key].id);if(!c)return Infinity;const p=entity.position,q=c.position;return Math.abs(p.y-q.y)>1.5?Math.max(GIVE_REACH+1,Math.hypot(p.x-q.x,p.z-q.z)):Math.hypot(p.x-q.x,p.z-q.z);};
 const fill=(select,options)=>{const was=select.value;select.replaceChildren(...options.map(([v,t])=>new Option(t,v)));if(options.some(([v])=>String(v)===was))select.value=was;};
 function render(){
  const carried=[];for(let id=1;id<BLOCK_COUNT;id++)if(entity.inventory[id])carried.push(id);
  const near=Object.keys(PERSONAS).map(k=>[k,Math.round(distance(k))]);
  const people=[...network.entities.values()].filter(e=>e!==entity&&!Object.values(PERSONAS).some(p=>p.id===e.id));
  const key=`${carried.map(id=>`${id}:${entity.inventory[id]}`).join(',')}|${entity.selected}|${near.map(n=>n.join(':')).join(',')}|${admin}|${people.map(e=>e.id).join(',')}`;
  if(key===lastKey)return;lastKey=key;
  fill(item,carried.map(id=>[id,`${name(id)} (${entity.inventory[id]})`]));if(carried.includes(entity.selected)&&!item.dataset.touched)item.value=entity.selected;
  give.hidden=!carried.length;
  to.replaceChildren(...(carried.length?near.map(([k,d])=>{
   const persona=PERSONAS[k];
   if(d<=GIVE_REACH){const b=el('button',{type:'button',className:`primary agent-${k}`,textContent:`Give to ${persona.name}`});b.onclick=()=>{
    const id=Number(item.value),n=Math.min(64,Math.max(1,Math.round(Number(count.value)||1)));
    if(entity.inventory[id]<n){result.textContent=`You have ${entity.inventory[id]} ${name(id)}.`;return;}
    entity.actions.give(persona.id,id,n);result.textContent='Handing it over…';};return b;}
   const call=el('button',{type:'button',textContent:`Call ${persona.name} over`,title:`${persona.name} is ${Number.isFinite(d)?`${d} blocks`:'far'} away; stand within ${GIVE_REACH} to give.`});
   call.onclick=()=>{if(!network.connected)return;network.send('chat-send',{text:`${persona.name}, come here.`,mode:'talk',agent:k,agents:[k]});result.textContent=`Asked ${persona.name} to come over.`;};
   return el('span',{className:'bag-give-far'},call,el('small',{textContent:Number.isFinite(d)?` ${d} blocks away`:' not here'}));
  }):[el('p',{className:'muted',textContent:'Carry something to give it to a companion.'})]));
  grant.hidden=!admin;
  if(admin)fill(target,[[entity.id,'You'],...Object.values(PERSONAS).filter(p=>network.entities.has(p.id)).map(p=>[p.id,p.name]),...people.map(e=>[e.id,`Player ${e.id.slice(0,4)}`])]);
 }
 item.onchange=()=>{item.dataset.touched='1';};
 grantButton.onclick=()=>{if(!network.connected)return;network.send('admin-grant',{targetId:target.value,blockId:Number(grantItem.value),count:Math.min(64,Math.max(1,Math.round(Number(grantCount.value)||1)))});result.textContent='Granting…';};
 network.on('transfer-result',m=>{result.textContent=m.ok?`Gave ${m.count} ${name(m.blockId)}.`:`Could not give that. Stand within ${GIVE_REACH} blocks and check both of you have room.`;ui.toast(result.textContent);lastKey='';});
 network.on('notice',m=>{if(/^Granted |admin/i.test(m.text))result.textContent=m.text;});
 network.on('access',m=>{admin=m.admin===true;lastKey='';});
 return {section,render,reset(){lastKey='';delete item.dataset.touched;result.textContent='';}};
}
