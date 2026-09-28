import { isSolid } from './blocks.js';
export const BODY={radius:.28,height:1.65};
export function overlapsBlock(position, block) {
  return position.x+BODY.radius>block.x && position.x-BODY.radius<block.x+1 && position.y+BODY.height>block.y && position.y<block.y+1 && position.z+BODY.radius>block.z && position.z-BODY.radius<block.z+1;
}
export function collides(world,p) {
  const epsilon=.00001;
  for(let x=Math.floor(p.x-BODY.radius+epsilon);x<=Math.floor(p.x+BODY.radius-epsilon);x++)
  for(let y=Math.floor(p.y+epsilon);y<=Math.floor(p.y+BODY.height-epsilon);y++)
  for(let z=Math.floor(p.z-BODY.radius+epsilon);z<=Math.floor(p.z+BODY.radius-epsilon);z++) if(isSolid(world.get(x,y,z)))return true;
  return false;
}
export function moveBody(world, entity, dir, jump, dt) {
  const length=Math.hypot(dir.x,dir.z), speed=4.8;
  entity.velocity.x=dir.x/Math.max(1,length)*speed;
  entity.velocity.z=dir.z/Math.max(1,length)*speed;
  if(jump&&entity.grounded)entity.velocity.y=8;
  entity.velocity.y=Math.max(-24,entity.velocity.y-22*dt);
  entity.grounded=false;
  // Small swept increments avoid tunneling, independent of render frame rate.
  for(const axis of ['x','z','y']) {
    const distance=entity.velocity[axis]*dt, steps=Math.max(1,Math.ceil(Math.abs(distance)/.15));
    for(let i=0;i<steps;i++) {
      const previous=entity.position[axis];entity.position[axis]+=distance/steps;
      if(collides(world,entity.position)) {
        // Binary refinement keeps feet flush with surfaces without visible jitter.
        let safe=previous,blocked=entity.position[axis];
        for(let j=0;j<12;j++){entity.position[axis]=(safe+blocked)/2;if(collides(world,entity.position))blocked=entity.position[axis];else safe=entity.position[axis];}
        entity.position[axis]=safe;
        if(axis==='y'&&distance<0)entity.grounded=true;
        entity.velocity[axis]=0;break;
      }
    }
  }
}
