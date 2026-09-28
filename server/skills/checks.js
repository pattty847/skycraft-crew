// Shared validation helpers for skills. Not a skill itself: no default export.
export function requireRequester(a,observation){
 if(typeof a.targetId!=='string'||a.targetId!==observation.requester?.id)throw Error('Walking must target the requesting player.');
 return a.targetId;
}
