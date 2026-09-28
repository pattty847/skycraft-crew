// Amanatides–Woo voxel traversal. Works at boundaries, with negative and zero axes.
export function raycast(world, origin, direction, maxDistance=8) {
  const length=Math.hypot(direction.x,direction.y,direction.z);
  if(!length)return null;
  const d=[direction.x/length,direction.y/length,direction.z/length];
  const o=[origin.x,origin.y,origin.z], p=o.map(Math.floor), step=d.map(Math.sign);
  const delta=d.map(v=>v===0?Infinity:Math.abs(1/v));
  const next=d.map((v,i)=>v===0?Infinity:((v>0?p[i]+1:p[i])-o[i])/v);
  let distance=0,normal=[0,0,0];
  while(distance<=maxDistance) {
    const id=world.get(...p);
    if(id)return {pos:{x:p[0],y:p[1],z:p[2]},normal:{x:normal[0],y:normal[1],z:normal[2]},id,distance};
    const axis=next[0]<next[1]?(next[0]<next[2]?0:2):(next[1]<next[2]?1:2);
    distance=next[axis];p[axis]+=step[axis];next[axis]+=delta[axis];
    normal=[0,0,0];normal[axis]=-step[axis];
  }
  return null;
}
