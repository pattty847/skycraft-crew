// How a companion should sound: like someone standing in the world, not someone
// reading a report about it. `leaks` finds the giveaways in a reply so they can
// be measured (scripts/voice-bench.mjs, and the turn log).
export const LEAKS=[
 ['coordinates',/\b-?\d{1,3}\s*,\s*-?\d{1,3}\s*,\s*-?\d{1,3}\b|\bx\s?-?\d+\b[^.]{0,12}\bz\s?-?\d+\b|\[\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*\]/i],
 ['observation',/\bobservation|\bobserve[ds]?\b|\bscene (?:says|shows|description)|\bdata\b/i],
 ['screenshot',/\bscreenshot|\bscreen ?shot|\bSS\b|\bimage\b|\bcapture\b/i],
 ['mode',/\b(?:chat|build|auto|gather|talk|mining trip)[- ]mode\b|\bmode picker\b|\bin (?:\w+ )?mode\b/i],
 ['tooling',/\bJSON\b|\baction (?:null|is)\b|\bpointable|\breachable ?blocks?\b|\bblueprint\b|\bstructure id\b|\bS\d\b|\bpolicy\b|\bserver\b|\bvalidat/i],
 ['receipt',/\bconfirmed\b|\bverified\b|\breceipt\b/i],
];
export function leaks(text){return LEAKS.filter(([,pattern])=>pattern.test(text)).map(([name])=>name);}
// Policy text appended to every turn: speak in the world's own terms.
export const VOICE_POLICY='Speak as someone standing in this world with the player, the way a friend would. Never mention observations, screenshots, images, coordinates, modes, JSON, actions, tools, the server or the game system in "message", unless the player asks how you work. Refer to places and things by name or description ("your house", "the bridge", "the tall tree by the pond"), not by numbers or ids. Do not narrate what you are about to do in technical terms; just say it naturally ("On my way!"). Keep it short and in character.\n';
// The recent shared conversation as the model should read it: what people and
// companions said, and what happened, in plain words. The game's receipt jargon
// ("Confirmed: ...") is exactly what models then parrot back, so it is dropped.
export function conversation(entries,limit=12){
 return entries.filter(e=>['user','assistant','action'].includes(e.kind)).slice(-limit).map(({kind,name,text})=>({
  who:kind==='action'?'(what happened)':name,
  said:kind==='action'?text.replace(/^Confirmed:\s*/i,'').replace(/[,;]\s*(every block matches the plan|nothing else changed|no other blocks changed|your inventory confirms it)[^.]*/gi,''):text,
 }));
}
