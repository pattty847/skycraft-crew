import * as THREE from 'three';
const down=new THREE.Vector3(0,-1,0),direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
export function animateGesture(entity,time,reducedMotion,head,arm,yaw){
 const g=entity.gesture;if(!g||time>=g.endsAt)return;
 const elapsed=Math.max(0,time-g.startedAt),duration=g.endsAt-g.startedAt;
 const blend=reducedMotion?1:Math.min(1,elapsed/.18,(duration-elapsed)/.18);
 if(g.kind==='wave'){arm.rotation.x=0;arm.rotation.z=blend*(2.4+(reducedMotion?0:Math.sin(elapsed*10)*.35));}
 if(g.kind==='nod'){head.rotation.z=0;head.rotation.x=blend*(reducedMotion?.24:Math.sin(elapsed*9)*.3);}
 if(g.kind==='point'){
  direction.set(g.pos.x+.5-entity.position.x,g.pos.y+.5-entity.position.y-1.1,g.pos.z+.5-entity.position.z).applyAxisAngle(up,-yaw);
  direction.x-=.4;direction.normalize();
  arm.quaternion.setFromUnitVectors(down,direction);
  head.rotation.z=0;head.rotation.x=-Math.atan2(g.pos.y+.5-entity.position.y-1.36,Math.hypot(g.pos.x+.5-entity.position.x,g.pos.z+.5-entity.position.z))*.6;
 }
}
