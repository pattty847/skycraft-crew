import { randomBytes } from 'node:crypto';
// Who may join, and what guests may do. Everyone already in the world is a member.
// With SKY_REQUIRE_INVITE=1 (set this before the server is reachable from the
// internet) a new browser needs a member's invite code and joins as a guest.
// Guests play normally, but their companion requests are rate limited, they
// cannot edit inside anyone else's protected area or take from the crew
// stockpile, and world-wide controls
// (day/night, save, import, protected areas) stay with members.
// A member can switch any guest's pass (their player token) off and back on.
export const GUEST_AI_LIMIT=Object.freeze({turns:6,windowMs:10*60*1000});
// Build orders spend crew materials from the stockpile, which guests may not take from;
// stopping a companion cancels members' jobs too.
export const MEMBERS_ONLY=Object.freeze(['admin-grant','creative','day','save','import','claim','invite-create','guest-pass','build-order','build-order-cancel','blueprint-save','blueprint-delete','agent-stop']);
export const PASS_OFF='Your pass to this island is switched off. Ask the member who invited you.';
const inside=(c,p)=>['x','y','z'].every(k=>p[k]>=c.min[k]&&p[k]<=c.max[k]);
export class Access {
 constructor(room,{requireInvite=process.env.SKY_REQUIRE_INVITE==='1',admins=process.env.SKY_ADMINS,now=()=>Date.now()}={}){
  // Admins (SKY_ADMINS: comma-separated player ids, set at server start) may grant items (server/admin.js).
  this.admins=new Set(String(admins??'').split(',').map(s=>s.trim()).filter(Boolean));
  this.room=room;this.requireInvite=requireInvite;this.now=now;this.invites=[];this.guests=new Set();this.guestInfo={};this.off=new Set();this.aiUse=new Map();
  room.extend('access',{
   save:()=>({invites:this.invites,guests:[...this.guests],guestInfo:this.guestInfo,off:[...this.off]}),
   load:data=>{if(Array.isArray(data?.invites))this.invites=data.invites.filter(i=>typeof i?.code==='string');if(Array.isArray(data?.guests))this.guests=new Set(data.guests.filter(id=>typeof id==='string'));if(data?.guestInfo&&typeof data.guestInfo==='object')this.guestInfo=data.guestInfo;if(Array.isArray(data?.off))this.off=new Set(data.off.filter(id=>typeof id==='string'));},
   snapshot:()=>({requireInvite:this.requireInvite}),
  });
  // Guests never edit inside a protected area that is not theirs.
  const previous=room.simulation.canEdit;
  room.simulation.canEdit=(entity,pos,kind)=>previous(entity,pos,kind)&&!(this.isGuest(entity.id)&&(room.claims?.items??[]).some(c=>c.ownerId!==entity.id&&inside(c,pos)));
  // Guests may add to the crew stockpile but not take from it.
  const transfer=room.simulation.stockpileTransfer;
  room.simulation.stockpileTransfer=(entity,type,id,count)=>{if(type==='withdraw'&&this.isGuest(entity.id)){room.trace?.('edit.refused',{level:'warn',who:entity.id,action:type,reason:'guest',msg:`${entity.id.slice(0,8)} withdraw refused: guest`});return false;}return transfer(entity,type,id,count);};
 }
 isGuest(id){return this.guests.has(id);}
 isAdmin(id){return this.admins.has(id)&&!this.isGuest(id);}
 // Decide a join before any entity exists. Known browsers always return.
 admit(token,code){
  const known=typeof token==='string'&&this.room.players.has(token);
  if(known){const id=this.room.players.get(token).id;return this.off.has(id)?{ok:false,reason:PASS_OFF}:{ok:true,guest:this.isGuest(id)};}
  // No invite needed when the island is open, or for the very first player (the owner).
  if(!this.requireInvite||this.room.players.size===0)return {ok:true,guest:false};
  const match=typeof code==='string'&&code?this.invites.find(i=>i.code===code):null;
  if(!match)return {ok:false,reason:'This island is invite-only. Ask a member for an invite link.'};
  if(match.uses>=match.maxUses||match.expires<=this.now())return {ok:false,reason:'This invite link has been used up or has expired. Ask for a new one.'};
  match.uses++;return {ok:true,guest:true,by:match.by,code:match.code};
 }
 markGuest(id,by,code){this.guests.add(id);this.guestInfo[id]??={by:by??null,joined:this.now(),code:code??null};this.room.markDirty?.();}
 // Members can switch a guest's pass off (and back on). An off pass cannot join;
 // the caller disconnects the guest if they are playing.
 setPass(memberId,guestId,on){
  if(this.isGuest(memberId))throw Error('Only island members can do that.');
  if(!this.isGuest(guestId))throw Error('Only guest passes can be switched off.');
  // Off also closes the invite that guest used, so a private window cannot rejoin with it.
  if(on)this.off.delete(guestId);else{this.off.add(guestId);const invite=this.invites.find(i=>i.code===this.guestInfo[guestId]?.code);if(invite)invite.uses=invite.maxUses;}
  this.room.markDirty?.();
 }
 // What members see in the invite panel: one row per guest.
 guestList(){
  const online=new Set([...this.room.clients.values()].map(c=>c.entity.id));
  return [...this.guests].map((id,i)=>({id,number:i+1,joined:this.guestInfo[id]?.joined??null,by:this.guestInfo[id]?.by??null,on:!this.off.has(id),online:online.has(id)}));
 }
 createInvite(memberId,{maxUses=5,hours=72}={}){
  if(this.isGuest(memberId))throw Error('Only island members can invite people.');
  const live=this.invites.filter(i=>i.expires>this.now()&&i.uses<i.maxUses);
  if(live.filter(i=>i.by===memberId).length>=10)throw Error('You already have 10 open invites.');
  const invite={code:randomBytes(9).toString('base64url'),by:memberId,uses:0,maxUses,expires:this.now()+hours*3600e3,created:this.now()};
  this.invites=[...live,invite];this.room.markDirty?.();return invite;
 }
 // Guests get a few companion requests per window; members are not limited here.
 allowAI(id){
  if(!this.isGuest(id))return true;
  const now=this.now(),recent=(this.aiUse.get(id)??[]).filter(t=>now-t<GUEST_AI_LIMIT.windowMs);
  if(recent.length>=GUEST_AI_LIMIT.turns){this.aiUse.set(id,recent);return false;}
  recent.push(now);this.aiUse.set(id,recent);return true;
 }
 check(id,type){if(this.isGuest(id)&&MEMBERS_ONLY.includes(type))throw Error('Only island members can do that.');}
}
