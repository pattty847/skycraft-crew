import { B, isPlant, isSolid } from './blocks.js';

export const PATH_MAX_CELLS=64;
export const PATH_MAX_EXPANDED=4096;
const key=p=>`${p.x},${p.y},${p.z}`;
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const removable=id=>(isPlant(id)&&id!==B.TORCH)||id===B.LEAVES;
export const NATURAL_PATH_FLOOR=new Set([B.GRASS,B.DIRT,B.SAND,B.CLAY,B.STONE]);
const valid=p=>p&&['x','y','z'].every(k=>Number.isInteger(p[k]));
class MinHeap {
 constructor(){this.items=[];}
 get length(){return this.items.length;}
 push(value){const a=this.items;let i=a.length;a.push(value);while(i>0){const parent=(i-1)>>1;if(a[parent].score<=value.score)break;a[i]=a[parent];i=parent;}a[i]=value;}
 pop(){const a=this.items,top=a[0],tail=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].score<a[child].score)child++;if(a[child].score>=tail.score)break;a[i]=a[child];i=child;}a[i]=tail;}return top;}
}

// Endpoints are marked block cells: a solid mark means its top; an air mark
// means the standing cell itself. Cells include existing planks and floors to pave.
export function planPath(world,from,to,{width=1,maxCells=PATH_MAX_CELLS,maxExpanded=PATH_MAX_EXPANDED,canEdit=()=>true}={}){
 const fail=reason=>({ok:false,reason});
 if(!valid(from)||!valid(to))return fail('Mark two whole-block points.');
 if(!Number.isInteger(width)||width<1||width>3)return fail('Path width must be 1–3 blocks.');
 if(!Number.isInteger(maxCells)||maxCells<2||maxCells>PATH_MAX_CELLS)return fail(`Path limit must be 2–${PATH_MAX_CELLS} cells.`);
 if(!Number.isInteger(maxExpanded)||maxExpanded<1||maxExpanded>PATH_MAX_EXPANDED)return fail('Invalid path search budget.');
 const stand=p=>({...p,y:p.y+(isSolid(world.get(p.x,p.y,p.z))?1:0)});
 const start=stand(from),goal=stand(to);
 if(!world.inside(start.x,start.y,start.z)||!world.inside(goal.x,goal.y,goal.z))return fail('A path endpoint is outside the world.');
 if(Math.abs(start.x-goal.x)+Math.abs(start.z-goal.z)+1>maxCells)return fail(`The endpoints exceed ${maxCells} path cells.`);
 const lane=(p,dx,dz)=>{
  const offsets=width===1?[0]:width===2?[0,1]:[-1,0,1];
  return offsets.map(n=>({x:p.x+n*dz,y:p.y,z:p.z-n*dx}));
 };
 const inspect=(p,dx,dz)=>{
  const cells=[],clear=[],replace=[];
  for(const s of lane(p,dx,dz)){
   const floor={...s,y:s.y-1},under=world.get(floor.x,floor.y,floor.z);
   if(!world.inside(floor.x,floor.y,floor.z)||!world.inside(s.x,s.y+1,s.z))return null;
   if(isSolid(under)){
    if(under===B.PLANKS)cells.push({...floor,id:B.PLANKS});
    else if(NATURAL_PATH_FLOOR.has(under)){
     if(!canEdit(floor,'break')||!canEdit(floor,'place'))return null;
     cells.push({...floor,id:B.PLANKS});replace.push(floor);
    }
   }else{
    if(under&&!removable(under))return null;
    if(!canEdit(floor,under?'break':'place'))return null;
    if(under)clear.push(floor);
    cells.push({...floor,id:B.PLANKS});
   }
   for(const h of [0,1]){
    const c={...s,y:s.y+h},id=world.get(c.x,c.y,c.z);
    if(id){if(!removable(id)||!canEdit(c,'break'))return null;clear.push(c);}
   }
  }
  return {cells,clear,replace};
 };
 const first=inspect(start,1,0);if(!first)return fail('The starting point is blocked or protected.');
 const queue=new MinHeap(),firstNode={p:start,g:0,score:Math.abs(start.x-goal.x)+Math.abs(start.z-goal.z),length:1,dx:1,dz:0};queue.push(firstNode);const best=new Map([[key(start),0]]),parents=new Map(),nodes=new Map([[key(start),firstNode]]);
 let expanded=0,found=null;
 while(queue.length&&expanded<maxExpanded){
  const at=queue.pop();if(at.g!==best.get(key(at.p)))continue;expanded++;
  if(at.p.x===goal.x&&at.p.z===goal.z&&at.p.y===goal.y){found=at;break;}
  if(at.length>=maxCells)continue;
  for(const [dx,dz] of dirs)for(const dy of [0,1,-1]){
   const p={x:at.p.x+dx,y:at.p.y+dy,z:at.p.z+dz};
   if(at.length+Math.abs(p.x-goal.x)+Math.abs(p.z-goal.z)>maxCells||Math.abs(p.y-goal.y)>maxCells-at.length)continue;
   if(!inspect(p,dx,dz))continue;
   // Avoid a one-block climb straight into a wall at the old standing cell.
   if(dy>0&&world.get(at.p.x,at.p.y+1,at.p.z)&&!removable(world.get(at.p.x,at.p.y+1,at.p.z)))continue;
   const g=at.g+1+Math.abs(dy)*.3+(isSolid(world.get(p.x,p.y-1,p.z))?0:.2);
   if(g>= (best.get(key(p))??Infinity))continue;
   best.set(key(p),g);parents.set(key(p),key(at.p));
   const next={p,g,score:g+Math.abs(p.x-goal.x)+Math.abs(p.z-goal.z)+Math.abs(p.y-goal.y),length:at.length+1,dx,dz};nodes.set(key(p),next);queue.push(next);
  }
 }
 if(!found)return fail(expanded>=maxExpanded?'The path search reached its budget.':`No walkable path within ${maxCells} cells; the route may be blocked or need a higher step.`);
 const route=[];for(let id=key(found.p);id;id=parents.get(id))route.push(nodes.get(id));route.reverse();
 const cells=new Map(),clear=new Map(),replace=new Map();
 for(const node of route){const part=inspect(node.p,node.dx,node.dz);for(const c of part.cells)cells.set(key(c),c);for(const c of part.clear)clear.set(key(c),c);for(const c of part.replace)replace.set(key(c),c);}
 const pending=new Map(cells),placed=new Set(),neighbors=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
 while(pending.size){
  const ready=[...pending].filter(([,c])=>neighbors.some(([dx,dy,dz])=>{
   const p={x:c.x+dx,y:c.y+dy,z:c.z+dz};return placed.has(key(p))||isSolid(world.get(p.x,p.y,p.z));
  }));
  if(!ready.length)return fail('A walkway segment would float without solid support.');
  for(const [id] of ready){pending.delete(id);placed.add(id);}
 }
 return {ok:true,cells:[...cells.values()],clear:[...clear.values()],replace:[...replace.values()],length:route.length,route:route.map(n=>n.p),width,expanded};
}
