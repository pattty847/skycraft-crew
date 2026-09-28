import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { FACINGS, previewCells, materials } from './blueprints.js';
import { planPath, PATH_MAX_CELLS } from './path-plan.js';
// "Build": pick a blueprint, place its ghost where you aim, and order it. The crew
// (Foreman + companions) builds it; the server checks the order and every block.
// Player-saved blueprints carry player-chosen names, so every label is set as text.
// A Walkway is marked with two clicks (start, then far end); the shared planner in
// path-plan.js draws the same route the server will check.
const ORDER_REACH=32,ORDER=['north','east','south','west'];
const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children);return n;};
export function createBuildPanel({scene,network,world,rig,getTarget,ui}){
 let catalog=network.extensions?.blueprints??[],orders=network.extensions?.orders??[],claims=network.extensions?.claims??[];
 // --- The catalog dialog.
 const dialog=el('dialog',{className:'build-dialog'});dialog.setAttribute('aria-label','Build');
 const list=el('ul',{className:'build-list'}),openOrders=el('ul',{className:'build-orders'}),saveForm=el('form',{className:'build-save'}),result=el('p',{className:'build-result'});result.setAttribute('role','status');
 const close=el('button',{className:'close',textContent:'×',type:'button'});close.setAttribute('aria-label','Close build');close.onclick=()=>dialog.close();
 dialog.append(close,el('h2',{textContent:'Build'}),el('p',{className:'muted',textContent:'Pick a plan, aim where it should go, and the crew builds it with materials from the stockpile and what they can gather.'}),list,el('h3',{textContent:'Open orders'}),openOrders,el('h3',{textContent:'Save your build as a blueprint'}),saveForm,result);
 document.body.append(dialog);
 const params={};let pathWidth=1;
 function walkwayRow(){
  const width=el('input',{type:'number',min:1,max:3,value:pathWidth});width.oninput=()=>{pathWidth=Math.min(3,Math.max(1,Math.round(Number(width.value)||1)));};
  const mark=el('button',{type:'button',className:'primary',textContent:'Mark ends'});mark.onclick=()=>startPath(pathWidth);
  return el('li',{className:'build-walkway'},el('div',{className:'build-name'},el('b',{textContent:'Walkway'}),el('small',{textContent:'two clicks'})),el('p',{textContent:`Click where it starts, then where it ends. The crew lays planks across gaps (up to ${PATH_MAX_CELLS} blocks long), stepping one block up or down at a time.`}),el('div',{className:'build-params'},el('label',{},'width ',width)),el('span',{className:'build-need',textContent:'Planks where there is no ground'}),mark);
 }
 function render(){
  if(!dialog.open)return;
  list.replaceChildren(walkwayRow(),...catalog.map(entry=>{
   const values=params[entry.key]??=Object.fromEntries(Object.entries(entry.params??{}).map(([k,r])=>[k,r.default]));
   const need=el('span',{className:'build-need'});
   const updateNeed=()=>{try{need.textContent=Object.entries(materials(previewCells(entry,{x:0,y:0,z:0},'north',values))).map(([id,n])=>`${n} ${BLOCKS[id]?.name??id}`).join(' · ');}catch{need.textContent='';}};
   const inputs=Object.entries(entry.params??{}).map(([k,r])=>{const input=el('input',{type:'number',min:r.min,max:r.max,value:values[k]});input.oninput=()=>{values[k]=Math.min(r.max,Math.max(r.min,Math.round(Number(input.value)||r.default)));updateNeed();};return el('label',{},`${k} `,input);});
   updateNeed();
   const place=el('button',{type:'button',className:'primary',textContent:'Place'});place.onclick=()=>startPlacing(entry,{...values});
   const row=el('li',{},el('div',{className:'build-name'},el('b',{textContent:entry.label}),entry.kind==='player'?el('small',{textContent:'saved'}):''),el('p',{textContent:entry.summary??''}),el('div',{className:'build-params'},...inputs),need,place);
   if(entry.kind==='player'&&entry.ownerId===network.entity.id){const del=el('button',{type:'button',textContent:'Delete'});del.onclick=()=>network.send('blueprint-delete',{key:entry.key});row.append(del);}
   return row;
  }));
  openOrders.replaceChildren(...(orders.length?orders.map(o=>{
   const who=o.assignee?`· ${o.assignee}`:'· waiting for a free companion';
   const row=el('li',{},el('b',{textContent:o.label}),el('span',{textContent:` ${o.placed}/${o.total} blocks ${who}`}));
   if(o.ownerId===network.entity.id){const cancel=el('button',{type:'button',textContent:'Cancel'});cancel.onclick=()=>network.send('build-order-cancel',{id:o.id});row.append(cancel);}
   return row;}):[el('li',{className:'muted',textContent:'No open orders.'})]));
  const mine=claims.filter(c=>c.ownerId===network.entity.id);
  saveForm.replaceChildren(...(mine.length?[el('select',{name:'claim'},...mine.map(c=>el('option',{value:c.id,textContent:c.name}))),el('input',{name:'name',maxLength:40,required:true,placeholder:'Blueprint name'}),el('button',{textContent:'Save blueprint'})]:[el('p',{className:'muted',textContent:'Protect a build first (World → Protect a build), up to 16×12×16 blocks.'})]));
 }
 saveForm.onsubmit=e=>{e.preventDefault();const f=new FormData(saveForm);network.send('blueprint-save',{claimId:f.get('claim'),name:String(f.get('name')??'').trim()});result.textContent='Saving…';};
 const open=()=>{if(placing)cancelPlacing();result.textContent='';dialog.showModal();render();};
 // --- Placement: a ghost at the aimed cell, facing where you look; R rotates.
 const ghost=new THREE.InstancedMesh(new THREE.BoxGeometry(1.001,1.001,1.001),new THREE.MeshBasicMaterial({transparent:true,opacity:.35,depthWrite:false}),600);
 ghost.frustumCulled=false;ghost.count=0;ghost.renderOrder=3;scene.add(ghost);
 const bar=el('div',{className:'build-bar',hidden:true});bar.setAttribute('role','status');
 const barText=el('span'),rotate=el('button',{type:'button',textContent:'Rotate (R)'}),confirm=el('button',{type:'button',className:'primary',textContent:'Order here'}),stop=el('button',{type:'button',textContent:'Cancel'});
 bar.append(barText,rotate,confirm,stop);document.querySelector('#app').append(bar);
 let placing=null,turn=0,cells=[],anchor=null,valid=false,route=null,aimKey='';
 const facing=()=>{const f={x:-Math.sin(rig.yaw),z:-Math.cos(rig.yaw)};const base=Math.abs(f.x)>Math.abs(f.z)?(f.x>0?1:3):(f.z>0?2:0);return ORDER[(base+turn)%4];};
 const label=()=>{rotate.hidden=!!placing?.path;confirm.textContent=placing?.path?(placing.from?'Order walkway':'Set start'):'Order here';};
 function startPlacing(entry,values){dialog.close();placing={entry,values};turn=0;bar.hidden=false;label();ui.toast(`Aim where the ${entry.label} should go`);}
 function startPath(width){dialog.close();placing={path:true,width,from:null,entry:{label:'Walkway'}};route=null;aimKey='';bar.hidden=false;label();ui.toast('Click where the walkway starts');}
 function cancelPlacing(){placing=null;route=null;ghost.count=0;bar.hidden=true;}
 function orderPath(){
  if(!anchor)return;
  if(!placing.from){if(!valid){ui.toast(barText.textContent);return;}placing.from={...anchor};aimKey='';label();ui.toast('Now click where it ends');return;}
  if(!valid){ui.toast(barText.textContent);return;}
  network.send('build-order',{blueprint:'path-to',from:placing.from,to:anchor,params:{width:placing.width}});ui.toast('Ordered: Walkway');cancelPlacing();
 }
 function order(){if(placing?.path){orderPath();return;}if(!placing||!anchor)return;if(!valid){ui.toast(barText.textContent);return;}network.send('build-order',{blueprint:placing.entry.key,params:placing.values,anchor,facing:facing()});ui.toast(`Ordered: ${placing.entry.label}`);cancelPlacing();}
 rotate.onclick=()=>{turn=(turn+1)%4;};confirm.onclick=order;stop.onclick=cancelPlacing;
 addEventListener('keydown',e=>{
  if(e.target.closest?.('input,select,textarea,dialog'))return;
  if(e.code==='KeyB'&&!e.repeat){e.preventDefault();dialog.open?dialog.close():open();return;}
  if(!placing)return;
  if(e.code==='KeyR'&&!e.repeat&&!placing.path){e.preventDefault();e.stopImmediatePropagation();turn=(turn+1)%4;}
  else if(e.code==='Enter'){e.preventDefault();order();}
  else if(e.code==='Escape')cancelPlacing();
 },true);
 // A left click orders while placing (mining is paused, see placing() below). The click
 // that takes the mouse back (after closing this dialog) only takes the mouse.
 addEventListener('mousedown',e=>{if(placing&&e.button===0&&e.target.tagName==='CANVAS'&&document.pointerLockElement===e.target)order();});
 const color=new THREE.Color(),matrix=new THREE.Matrix4();
 const draw=list=>{let n=0;for(const [c,hex] of list){if(n>=600)break;ghost.setMatrixAt(n,matrix.makeTranslation(c.x+.5,c.y+.5,c.z+.5));ghost.setColorAt(n,color.setHex(hex));n++;}ghost.count=n;ghost.instanceMatrix.needsUpdate=true;if(ghost.instanceColor)ghost.instanceColor.needsUpdate=true;};
 // Walkway marking: the aimed block is an end; the route is re-planned only when the aim moves.
 function updatePath(){
  const hit=getTarget();anchor=hit?{...hit.pos}:null;
  if(!anchor){ghost.count=0;barText.textContent=`Walkway · aim at the block where it ${placing.from?'ends':'starts'}`;return;}
  const p=network.entity.position,far=q=>Math.hypot(q.x+.5-p.x,q.y+.5-p.y,q.z+.5-p.z)>ORDER_REACH;
  const key=`${anchor.x},${anchor.y},${anchor.z}`;
  // A start is usable when a walkway of one cell could begin there.
  if(!placing.from){if(key!==aimKey){aimKey=key;route=planPath(world,anchor,anchor,{width:placing.width});}valid=route.ok&&!far(anchor);draw([[anchor,valid?0x7fe3ff:0xff6b6b]]);barText.textContent=!route.ok?`Walkway · ${route.reason}`:valid?'Walkway · click where it starts (Esc cancels)':'Walkway · too far away (stay within 32 blocks)';return;}
  if(key!==aimKey){aimKey=key;route=planPath(world,placing.from,anchor,{width:placing.width});}
  const planks=route.ok?route.cells.filter(c=>world.get(c.x,c.y,c.z)!==c.id).length:0,tooFar=far(placing.from)&&far(anchor);valid=route.ok&&!tooFar&&planks>0;
  barText.textContent=!route.ok?`Walkway · ${route.reason}`:tooFar?'Walkway · stand within 32 blocks of one end':!planks?'Walkway · already paved with planks; nothing to build':`Walkway · ${route.length} step${route.length===1?'':'s'}, ${planks} plank${planks===1?'':'s'} · click the far end to order`;
  const marks=[[placing.from,0xffd36b],[anchor,valid?0x7fe3ff:0xff6b6b]];
  if(route.ok){for(const s of route.route)marks.push([{x:s.x,y:s.y-1,z:s.z},0xbfefff]);for(const c of route.cells)marks.push([c,0x7fe3ff]);}
  draw(marks);
 }
 // Subscribe last: network.on replays the latest message at once, and everything above must exist.
 network.on('extensions',x=>{catalog=x.blueprints??catalog;orders=x.orders??orders;claims=x.claims??claims;render();});
 network.on('blueprints',m=>{catalog=m.blueprints;render();});
 network.on('orders',m=>{orders=m.orders;render();});
 network.on('order-progress',m=>{const order=orders.find(o=>o.id===m.id);if(order){order.placed=m.placed;render();}});
 network.on('claims',m=>{claims=m.claims;render();});
 network.on('notice',m=>{if(dialog.open)result.textContent=m.text;else if(placing&&/order|blueprint|build|block|reach|claim/i.test(m.text))ui.toast(m.text);});
 return {
  open,placing:()=>!!placing,
  update(){
   if(!placing)return;
   if(placing.path){updatePath();return;}
   const hit=getTarget();
   if(!hit){ghost.count=0;anchor=null;barText.textContent=`Placing ${placing.entry.label} · aim at a block`;return;}
   // Builds stand on the ground: from the cell beside the aimed face, drop to the first solid block below.
   anchor={x:hit.pos.x+hit.normal.x,y:hit.pos.y+hit.normal.y,z:hit.pos.z+hit.normal.z};
   let drop=0;while(drop<12&&anchor.y>0&&BLOCKS[world.get(anchor.x,anchor.y-1,anchor.z)]?.kind!=='solid'){anchor.y--;drop++;}
   const floating=drop>=12;
   try{cells=previewCells(placing.entry,anchor,facing(),placing.values);}catch{cells=[];}
   const p=network.entity.position,far=Math.hypot(anchor.x+.5-p.x,anchor.y+.5-p.y,anchor.z+.5-p.z)>ORDER_REACH;
   const blocked=cells.some(c=>{const id=world.get(c.x,c.y,c.z);return id&&id!==c.id&&BLOCKS[id]?.kind==='solid';});
   // A character (you, a friend, a companion) standing in a planned cell would stop the build.
   const occupied=cells.some(c=>c.id&&BLOCKS[c.id]?.kind==='solid'&&[...network.entities.values()].some(e=>Math.floor(e.position.x)===c.x&&Math.floor(e.position.z)===c.z&&c.y>=Math.floor(e.position.y)&&c.y<=Math.floor(e.position.y+1.7)));
   valid=!far&&!blocked&&!occupied&&!floating&&cells.length>0;
   barText.textContent=`${placing.entry.label} facing ${facing()} · ${far?'too far away (stay within 32 blocks)':blocked?'something is in the way':occupied?'someone is standing there':floating?'aim at the ground':'R rotate · click or Enter to order'}`;
   color.setHex(valid?0x7fe3ff:0xff6b6b);
   let n=0;for(const c of cells){if(n>=600)break;ghost.setMatrixAt(n,matrix.makeTranslation(c.x+.5,c.y+.5,c.z+.5));ghost.setColorAt(n,color);n++;}
   ghost.count=n;ghost.instanceMatrix.needsUpdate=true;if(ghost.instanceColor)ghost.instanceColor.needsUpdate=true;
  },
 };
}
