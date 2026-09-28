// Replicates builds in progress to every browser (as ghost blocks) through the
// room extension seam. Nothing here is durable: a build interrupted by a
// restart simply stops, and the blocks already placed stay in the world.
const boards=new WeakMap();
export function buildBoard(room){
 let board=boards.get(room);if(board)return board;
 const active=new Map();
 const view=()=>[...active.values()];
 board={
  start(id,builder,plan){active.set(id,{id,builder,label:plan.label,cells:plan.cells.map(({x,y,z,id})=>({x,y,z,id}))});room.sendAll?.({type:'builds',builds:view()});},
  end(id){if(active.delete(id))room.sendAll?.({type:'builds',builds:view()});},
  list:view,
 };
 room.extend?.('builds',{snapshot:view});
 boards.set(room,board);return board;
}
