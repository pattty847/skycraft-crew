import { raycast } from './raycast.js';

export const BLOCK_REACH = 6;
const FACES = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const same = (a,b) => a.x===b.x && a.y===b.y && a.z===b.z;

export function blockAccess(world, entity, pos, placing = false, reach = BLOCK_REACH) {
  if (!world.inside(pos.x,pos.y,pos.z)) return {ok:false,reason:'outside',distance:Infinity};
  const eye = {x:entity.position.x,y:entity.position.y+1.4,z:entity.position.z};
  const distance = Math.hypot(...['x','y','z'].map(axis =>
    eye[axis] - Math.max(pos[axis],Math.min(pos[axis]+1,eye[axis]))));
  if (distance > reach) return {ok:false,reason:'distance',distance};
  const castTo = target => {
    const dir = {x:target.x-eye.x,y:target.y-eye.y,z:target.z-eye.z};
    return raycast(world,eye,dir,Math.hypot(dir.x,dir.y,dir.z)+.0001);
  };
  if (placing) {
    const hit = castTo({x:pos.x+.5,y:pos.y+.5,z:pos.z+.5});
    return {ok:!hit,reason:hit?'blocked':'clear',distance};
  }
  if (!world.get(pos.x,pos.y,pos.z)) return {ok:false,reason:'empty',distance};
  // A visible face is enough. A center-only ray incorrectly hits adjacent terrain
  // on its way into the interior of otherwise visible surface blocks.
  for (const [x,y,z] of FACES) {
    if (world.get(pos.x+x,pos.y+y,pos.z+z)) continue;
    const target = {x:pos.x+.5+x*.499,y:pos.y+.5+y*.499,z:pos.z+.5+z*.499};
    if (Math.hypot(target.x-eye.x,target.y-eye.y,target.z-eye.z)>reach) continue;
    const hit = castTo(target);
    if (hit && same(hit.pos,pos)) return {ok:true,reason:'clear',distance};
  }
  return {ok:false,reason:'blocked',distance};
}
