// Who a chat message is for. Deterministic and cheap: no model decides whether to answer.
// 1. A message that opens by addressing companions ("Claude, …", "@codex …",
//    "Claude and Codex, …") goes to them — unless it also speaks to the group.
// 2. Group words ("both", "you two", "guys", "everyone", "anyone", "y'all") go to everyone.
// 3. Otherwise any name in the message picks that companion.
// 4. Otherwise the companions selected in the chat panel hear it.
const GROUP=/\b(both|you two|you guys|guys|every(one|body)|any(one|body)|y'?all|all of you)\b/i;
const SEP=String.raw`\s*(?:,|:|!|\?|&|\band\b|$)`;
export function addressees(text,selected,names){
 const keys=Object.keys(names),name=k=>names[k].toLowerCase();
 // Up to two other names may come first ("claude and codex, …"); each is followed by a separator.
 const opening=k=>new RegExp(String.raw`^\s*(?:@?\w+${SEP}\s*){0,2}(?:@${name(k)}\b|${name(k)}${SEP})`,'i').test(text);
 const leading=keys.filter(opening);
 if(GROUP.test(text))return keys;
 if(leading.length)return leading;
 const named=keys.filter(k=>new RegExp(String.raw`(^|[^a-z])@?${name(k)}\b`,'i').test(text));
 if(named.length)return named;
 const chosen=keys.filter(k=>selected.includes(k));
 return chosen.length?chosen:[keys[0]];
}
