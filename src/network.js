import { MovementPrediction } from './prediction.js';
import { Entity } from './entity.js';
import { World, SIZE } from './world.js';
import { blockAccess } from './block-access.js';
async function decodeBlocks(base64,encoding){
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 if(encoding!=='deflate-raw')return bytes;
 return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}
// A pass link (#key=…) brings a player to this browser or Home Screen app; it wins over
// any stored pass and leaves the address bar at once. Storage can be blocked, so guard it.
function storedToken(){
 const key=new URLSearchParams(location.hash.slice(1)).get('key');
 if(key){history.replaceState(null,'',location.pathname+location.search);try{localStorage.setItem('sky:player-token',key);}catch{}return key;}
 try{return localStorage.getItem('sky:player-token');}catch{return null;}
}
export async function connectWorld() {
 const world=new World(0),entities=new Map();let entity,token=storedToken(),socket,sequence=0,ready=false,prediction;
 let receivedAt=performance.now();
 const pending=new Map(),once=[],frames=[];
 const network={world,entities,clock:()=>network.time+(network.connected?Math.min(.15,(performance.now()-receivedAt)/1000):0),chat:[],agents:{},time:0,phase:.24,notice:'',connected:false,canImport:false,onStatus:()=>{},onSnapshot:()=>{},blockAccess:e=>e,
  send(type,payload={}){if(socket?.readyState===1&&ready)socket.send(JSON.stringify({type,...payload}));},
  craftPlanks(){network.send('craft');},save(){network.send('save');},
  passLink:()=>`${location.origin}${location.pathname}${location.search}#key=${encodeURIComponent(token)}`};
 let lastError=0;const report=error=>{const now=Date.now();if(now-lastError<10000)return;lastError=now;network.send('client-error',{message:String(error?.message??error).slice(0,512),stack:String(error?.stack??'').slice(0,512)});};
 window.addEventListener('error',event=>report(event.error??event.message));window.addEventListener('unhandledrejection',event=>report(event.reason));
 network.blockAccess=(e,p)=>blockAccess(world,e,p);
 // Feature modules subscribe to their own message types instead of extending the chain below.
 // After every welcome, 'extensions' handlers receive the room's extension snapshots.
 const handlers=new Map();
 // A subscriber that arrives late still gets the most recent message of its type.
 const latest=new Map();
 network.on=(type,handler)=>{if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(handler);if(type==='extensions'&&network.extensions)handler(network.extensions);else if(latest.has(type))handler(latest.get(type));};
 const dispatch=m=>{if(m.type!=='extensions')latest.set(m.type,m);for(const handler of handlers.get(m.type)??[])handler(m.type==='extensions'?m.extensions:m);return handlers.has(m.type)||!BUILT_IN.includes(m.type);};
 // Message types handled by the chain below (welcome and state never reach dispatch).
 const BUILT_IN=['chat','capture','agent-status','notice'];
 const emit=a=>{if(!network.connected)return;if(['move','lookAt','breakBlock'].includes(a.type))pending.set(a.type,a);else if(once.length<8)once.push(a);};
 function decodeEntity(state,previous){if(!state.p)return state;const [x,y,z]=state.p,[vx,vy,vz]=state.v,[dx,dy,dz]=state.d;return {id:state.id,position:{x,y,z},velocity:{x:vx,y:vy,z:vz},direction:{x:dx,y:dy,z:dz},grounded:!!state.g,selected:state.s,inventory:state.i??previous?.inventory??[],breaking:state.b??null,speech:state.t??'',speechUntil:state.u??0,gesture:state.ge??null};}
 function applyEntities(list,ack=-1){const ids=new Set();for(const encoded of list){ids.add(encoded.id);let e=entities.get(encoded.id);const state=decodeEntity(encoded,e);if(!e){e=new Entity(state.id,state.position,emit);entities.set(state.id,e);}if(e===entity&&prediction)prediction.reconcile(state,ack);else Object.assign(e,state,{position:{...state.position},velocity:{...state.velocity},inventory:new Uint16Array(state.inventory)});}for(const id of entities.keys())if(!ids.has(id))entities.delete(id);}
 await new Promise((resolve,reject)=>{
  let first=true,fatal=false;
  const connect=()=>{
   socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/world`);
   const invite=new URLSearchParams(location.search).get('invite');
   socket.onopen=()=>socket.send(JSON.stringify({type:'join',token,invite,compress:typeof DecompressionStream==='function'}));
   // Messages are handled strictly in order; only a welcome needs to await decompression.
   let inbox=Promise.resolve();
   socket.onmessage=event=>{inbox=inbox.then(()=>receive(JSON.parse(event.data))).catch(error=>{console.error(error);fatal=true;network.onStatus('Could not read the shared world · reload');socket.close();if(first){first=false;reject(error);}});};
   const receive=async m=>{
    if(m.type!=='welcome'&&m.type!=='state'&&dispatch(m))return;
    if(m.type==='welcome'){
     if(m.size?.x!==SIZE.x||m.size?.y!==SIZE.y||m.size?.z!==SIZE.z)throw Error('This page is older than the server. Reload to update.');
     const blocks=await decodeBlocks(m.blocks,m.encoding);if(blocks.length!==world.blocks.length)throw Error('Snapshot has the wrong size');
     network.agentStatus=m.agentStatus;network.agents=m.agents??network.agents;network.modes=m.modes?.length?m.modes:network.modes;network.onModes?.(network.modes);network.extensions=m.extensions??{};dispatch({type:'extensions',extensions:network.extensions});network.chat=m.chat??network.chat;network.onChatHistory?.(network.chat);token=m.token;try{localStorage.setItem('sky:player-token',token);}catch{}world.seed=m.seed;world.blocks.set(blocks);world.markAllDirty();pending.clear();once.length=0;frames.length=0;sequence=0;prediction=null;
     applyEntities(m.entities);network.onChatStatus?.();entity=entities.get(m.you);network.entity=entity;prediction=new MovementPrediction(world,entity);entity.selected=m.entities.find(e=>e.id===m.you).s;ready=true;network.connected=true;network.onSnapshot();network.onStatus('Shared world · connected');if(first){first=false;resolve();}
    }else if(m.type==='state'){
     for(const [index,id] of m.changes){const p=world.position(index);network.onBlockChange?.(p,world.get(p.x,p.y,p.z),id);world.set(p.x,p.y,p.z,id);}applyEntities(m.entities,m.ack);
    }else if(m.type==='chat'){network.chat.push(m.entry);network.chat=network.chat.slice(-100);network.onChat?.(m.entry);return;}else if(m.type==='capture'){network.onCapture?.(m);return;}else if(m.type==='agent-status'){network.agents={...network.agents,[m.agent??'codex']:m};network.onAgentStatus?.(m);network.onChatStatus?.(m);return;}else if(m.type==='notice'){network.notice=m.text;return;}
    receivedAt=performance.now();network.time=m.time;network.phase=m.phase;network.revision=m.revision;network.canImport=m.canImport;
   };
   socket.onclose=event=>{ready=false;network.connected=false;pending.clear();once.length=0;frames.length=0;if(fatal)return;network.onStatus('Disconnected · edits paused');if(event.code===4001){network.notice='This player opened in another tab. Reload to reconnect.';return;}
    // Invite-only island and no valid invite: say so plainly and stop retrying.
    if(event.code===4003){fatal=true;const error=Object.assign(new Error(event.reason||'This island is invite-only. Ask a member for an invite link.'),{userFacing:true});if(first){first=false;reject(error);}else network.onStatus(error.message);return;}
    setTimeout(connect,1500);};
   socket.onerror=()=>{if(first)network.onStatus('Connecting to shared server…');};
  };connect();
 });
 network.tick=()=>{if(!ready)return;const frame={sequence:sequence++,actions:[...pending.values(),...once.splice(0)]};pending.clear();prediction.step(frame);frames.push(frame);if(frames.length>=3){network.send('input',{frames:frames.splice(0),selected:entity.selected});}};
 network.view=dt=>prediction?.view(dt)??entity;
 return network;
}
