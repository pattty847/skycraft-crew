import { B } from './blocks.js';
export const SIZE = { x: 128, y: 48, z: 128 };
// The v1 world (and every phone/device save) used this grid. It occupies the
// north-west corner of the current grid at the same coordinates.
export const LEGACY_SIZE = Object.freeze({ x: 64, y: 48, z: 64 });
export const CHUNK = 16;
export const ISLANDS = Object.freeze([
  { name: 'Origin Island', x: 30, z: 30, radius: 17 },
  { name: 'Clover Rise', x: 82, z: 32, radius: 15 },
  { name: 'Ironcrag', x: 86, z: 90, radius: 17 },
  { name: 'Sandbar', x: 32, z: 96, radius: 13 },
  { name: 'Lookout Rock', x: 110, z: 60, radius: 5 },
  { name: 'Crew Isle', x: 56, z: 96, radius: 10 },
  { name: 'the Sandbox', x: 21, z: 69, radius: 28 },
]);
// Named features of the generated world, for talking about places the way people
// do. A structure inside one of these boxes takes its name.
export const LANDMARKS = Object.freeze([
  { name: 'the plank bridge between Origin Island and Clover Rise', min: { x: 40, z: 35 }, max: { x: 72, z: 41 } },
  { name: 'the path from Sandbar to Crew Isle', min: { x: 39, z: 94 }, max: { x: 49, z: 98 } },
  { name: "Claude's nook", owner: 'claude-companion', min: { x: 82, z: 31 }, max: { x: 87, z: 36 } },
]);
export function islandAt(x, z) {
  let best = null, bestScore = Infinity;
  for (const island of ISLANDS) {
    const score = Math.hypot(x - island.x, z - island.z) / island.radius;
    if (score < 1 && score < bestScore) { best = island; bestScore = score; }
  }
  return best?.name ?? 'Open sky';
}
export class World {
  constructor(seed = 230925) {
    this.seed = seed;
    this.blocks = new Uint8Array(SIZE.x * SIZE.y * SIZE.z);
    this.dirty = new Set();
    this.revision = 0;
    // The latest edits, so long-running tasks can check whether a change touched them.
    this.edits = [];
  }
  inside(x, y, z) { return x >= 0 && x < SIZE.x && y >= 0 && y < SIZE.y && z >= 0 && z < SIZE.z; }
  index(x, y, z) { return x + SIZE.x * (z + SIZE.z * y); }
  position(index) { return { x: index % SIZE.x, z: Math.floor(index / SIZE.x) % SIZE.z, y: Math.floor(index / (SIZE.x * SIZE.z)) }; }
  get(x, y, z) { return this.inside(x, y, z) ? this.blocks[this.index(x, y, z)] : 0; }
  set(x, y, z, id) {
    if (!this.inside(x, y, z) || this.get(x, y, z) === id) return false;
    this.blocks[this.index(x, y, z)] = id;
    // Ambient occlusion reads diagonal neighbours, so an edge or corner edit can
    // change up to eight chunks.
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const p = [x + dx, y + dy, z + dz];
      if (this.inside(...p)) this.dirty.add(p.map(v => Math.floor(v / CHUNK)).join(','));
    }
    this.revision++;
    this.edits.push({ x, y, z, revision: this.revision });
    if (this.edits.length > 256) this.edits.splice(0, 128);
    return true;
  }
  // Returns null when the log no longer reaches back to that revision.
  editsSince(revision) {
    if (revision >= this.revision) return [];
    if (!this.edits.length || this.edits[0].revision > revision + 1) return null;
    return this.edits.filter(edit => edit.revision > revision);
  }
  top(x, z) { for (let y = SIZE.y - 1; y >= 0; y--) if (this.get(x, y, z)) return y; return -1; }
  markAllDirty() {
    for (let x = 0; x < SIZE.x / CHUNK; x++) for (let y = 0; y < SIZE.y / CHUNK; y++) for (let z = 0; z < SIZE.z / CHUNK; z++) this.dirty.add(`${x},${y},${z}`);
  }
}
export function hash(x, z, seed = 0) {
  let n = Math.imul(x + seed, 374761393) ^ Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function island(w, cx, cz, radius, height, depth, { surface = B.GRASS, under = B.DIRT, coal = .065, iron = .025 } = {}) {
  const seed = w.seed;
  for (let x = cx - radius - 2; x <= cx + radius + 2; x++) for (let z = cz - radius - 2; z <= cz + radius + 2; z++) {
    const r = Math.hypot(x - cx, (z - cz) * 1.08) / radius;
    const edge = 1 + Math.sin(x * 0.8 + z * 0.55) * 0.045;
    if (r > edge) continue;
    const top = height + Math.floor(Math.max(0, 1 - r) * 3 + Math.sin(x * .45) * .45 + Math.cos(z * .4) * .4);
    const bottom = height - 2 - Math.floor(Math.pow(Math.max(0, 1 - r), .62) * depth + hash(x, z, seed) * 2);
    for (let y = bottom; y <= top; y++) {
      const ore = hash(x + y * 73, z, seed);
      w.set(x,y,z, y === top ? surface : y >= top - 2 ? under : ore < iron ? B.IRON : ore < coal ? B.COAL : B.STONE);
    }
  }
}
export function growTree(w, x, y, z, h) {
  for (let i=0; i<h; i++) w.set(x,y+i,z,B.WOOD);
  for (let dx=-2; dx<=2; dx++) for (let dz=-2; dz<=2; dz++) for (let dy=-1; dy<=1; dy++) {
    if (Math.abs(dx)+Math.abs(dz)+Math.abs(dy) > 4) continue;
    if (!w.get(x+dx,y+h+dy,z+dz)) w.set(x+dx,y+h+dy,z+dz,B.LEAVES);
  }
  w.set(x,y+h+2,z,B.LEAVES);
}
export function treeSpaceClear(w,x,y,z,h){
  for(let i=0;i<h;i++)if(!w.inside(x,y+i,z)||w.get(x,y+i,z)!==B.AIR&&!(i===0&&w.get(x,y,z)===B.SAPLING))return false;
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=2;dy++){
    if(dy<2&&Math.abs(dx)+Math.abs(dz)+Math.abs(dy)>4)continue;
    if(dy===2&&(dx||dz))continue;
    const yy=y+h+dy;if(!w.inside(x+dx,yy,z+dz)||w.get(x+dx,yy,z+dz))return false;
  }
  return true;
}
function tree(w, x, z, h) {
  const y = w.top(x,z) + 1;
  growTree(w,x,y,z,h);
}
// Two-block gaps are a running jump; drops of one block keep the path walkable.
function steppingStones(w, stones) {
  for (const [x, y, z] of stones) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) {
    w.set(x + dx, y, z + dz, B.GRASS);
    w.set(x + dx, y - 1, z + dz, B.DIRT);
    if (hash(x + dx, z + dz, 77) < .5) w.set(x + dx, y - 2, z + dz, B.STONE);
  }
}
export function generateWorld(seed = 230925, { frontier = true } = {}) {
  const w = new World(seed);
  island(w, 30, 30, 14, 22, 17);
  island(w, 9, 22, 3, 25, 6);
  island(w, 49, 18, 4, 29, 8);
  island(w, 46, 46, 3, 19, 7);
  // A shallow sandy spring winds east to a waterfall. Water is scenery, not a block.
  for (let x = 31; x <= 43; x++) for (let z = 28; z <= 30; z++) {
    const top = w.top(x, z);
    for (let y = 22; y <= top; y++) w.set(x, y, z, 0);
    w.set(x, 21, z, B.SAND);
    if (w.top(x, z - 1) >= 22) w.set(x, 22, z - 1, B.SAND);
  }
  for (const [x,z,h] of [[23,26,5],[28,20,6],[20,33,4],[35,36,5],[49,18,3]]) tree(w, x, z, h);
  if (frontier) {generateFrontier(w);addCrewIsle(w);addSandbox(w);addForagePlants(w);}
  return w;
}
export function addForagePlants(w){
 let added=0;
 for(let x=0;x<SIZE.x;x++)for(let z=0;z<SIZE.z;z++){
  const y=w.top(x,z);
  if(y<0||w.get(x,y,z)!==B.GRASS||hash(x,z,600)>.12||w.get(x,y+1,z)||insideSandbox(x,z)&&sandboxCircle(x,z))continue;
  const roll=hash(x,z,601),id=roll<.2?B.RED_MUSHROOM:roll<.4?B.BROWN_MUSHROOM:roll<.7?B.YELLOW_FLOWER:B.WHITE_FLOWER;
  if(w.set(x,y+1,z,id))added++;
 }
 return added;
}
// Everything east and south of the original 64×64 corner. Kept separate so a
// v1 save can gain these islands without regenerating its edited terrain.
function generateFrontier(w) {
  // Clover Rise: a meadow reached over a plank bridge, and Claude's home.
  island(w, 82, 32, 12, 22, 14);
  for (const [x,z,h] of [[77,25,5],[88,27,6],[86,40,4],[74,36,5]]) tree(w, x, z, h);
  // Claude's nook: four posts, a plank floor and roof. A player-made-looking
  // structure the gather rules must leave alone.
  const nookY = w.top(84, 33) + 1;
  for (let x = 83; x <= 86; x++) for (let z = 32; z <= 35; z++) {
    w.set(x, nookY - 1, z, B.PLANKS);
    w.set(x, nookY + 3, z, B.PLANKS);
    for (let y = nookY; y < nookY + 3; y++) w.set(x, y, z, 0);
  }
  for (const [x,z] of [[83,32],[86,32],[83,35],[86,35]]) for (let y = nookY; y < nookY + 3; y++) w.set(x, y, z, B.WOOD);
  for (let x = 82; x <= 87; x++) for (let z = 31; z <= 36; z++) if (!w.get(x, nookY + 3, z) && (x === 82 || x === 87 || z === 31 || z === 36)) w.set(x, nookY + 3, z, B.PLANKS);
  // A three-wide plank bridge from Origin Island's east shore, with wood rail posts.
  const deck = 22;
  for (let x = 40; x <= 72; x++) for (let z = 37; z <= 39; z++) {
    if (w.get(x, deck, z) || w.get(x, deck + 1, z)) continue;
    w.set(x, deck, z, B.PLANKS);
  }
  for (let x = 44; x <= 70; x += 4) for (const z of [36, 40]) { w.set(x, deck, z, B.PLANKS); w.set(x, deck + 1, z, B.WOOD); }
  // Ironcrag: a stepped stone mound, rich in exposed ore.
  island(w, 86, 90, 14, 18, 16, { coal: .12, iron: .06 });
  for (let x = 72; x <= 100; x++) for (let z = 76; z <= 104; z++) {
    const d = Math.hypot(x - 86, (z - 90) * 1.08);
    const rise = Math.min(9, Math.floor(10 - d * .95 + hash(x, z, 91) * .9));
    if (rise <= 0) continue;
    const base = w.top(x, z);
    if (base < 10) continue;
    for (let y = base; y <= base + rise; y++) {
      const ore = hash(x + y * 31, z, 404);
      w.set(x, y, z, ore < .07 ? B.IRON : ore < .17 ? B.COAL : B.STONE);
    }
  }
  tree(w, 78, 99, 4);tree(w, 95, 82, 5);
  // Sandbar: a low beach with palms.
  island(w, 32, 96, 10, 17, 9, { surface: B.SAND, under: B.SAND });
  for (const [x,z,h] of [[27,92,5],[37,99,6],[30,101,4]]) tree(w, x, z, h);
  // Lookout Rock: high above everything; you have to build your way up.
  island(w, 110, 60, 3, 36, 5);
  tree(w, 110, 60, 3);
  // Stepping stones: Clover Rise down to Ironcrag, Origin Island down to Sandbar.
  steppingStones(w, [21,21,20,20,20,19,19,19].map((y, i) => [83 + (i >> 1), y, 46 + i * 4]));
  steppingStones(w, [21,21,20,20,19,19,19,18,18,18,17].map((y, i) => [31 + (i >> 2), y, 45 + i * 4]));
}
// Embed a v1 (64×48×64) block array into the current grid. Existing terrain and
// edits are preserved exactly; new frontier terrain only fills cells that the
// original generator left empty and that are still empty now.
export function expandLegacyBlocks(legacy, seed) {
  if (legacy.length !== LEGACY_SIZE.x * LEGACY_SIZE.y * LEGACY_SIZE.z) throw new Error('Legacy world has the wrong size');
  const next = generateWorld(seed), original = generateWorld(seed, { frontier: false });
  for (let y = 0; y < LEGACY_SIZE.y; y++) for (let z = 0; z < LEGACY_SIZE.z; z++) for (let x = 0; x < LEGACY_SIZE.x; x++) {
    const saved = legacy[x + LEGACY_SIZE.x * (z + LEGACY_SIZE.z * y)], i = next.index(x, y, z);
    const addition = original.blocks[i] === 0 && next.blocks[i] !== 0;
    next.blocks[i] = saved || (addition ? next.blocks[i] : 0);
  }
  next.revision = 0; next.edits = []; next.dirty.clear(); next.markAllDirty();
  return next;
}

// Add only unoccupied cells. The same function builds fresh worlds and migrates
// saved ones; the terrain version ensures mined cells never return on restart.
export function addCrewIsle(w){
 const put=(x,y,z,id)=>{if(w.inside(x,y,z)&&!w.get(x,y,z))w.set(x,y,z,id);};
 const cx=56,cz=96,radius=10,seed=w.seed;
 for(let x=cx-radius-1;x<=cx+radius+1;x++)for(let z=cz-radius-1;z<=cz+radius+1;z++){
  const r=Math.hypot(x-cx,(z-cz)*1.08)/radius;
  if(r>1+Math.sin(x*.81+z*.52)*.035)continue;
  const top=18+Math.floor(Math.max(0,1-r)*2+Math.sin(x*.4)*.3),bottom=16-Math.floor(Math.pow(Math.max(0,1-r),.65)*9+hash(x,z,seed)*2);
  for(let y=bottom;y<=top;y++){
   const ore=hash(x+y*73,z,seed);
   put(x,y,z,y===top?B.GRASS:y>=top-2?B.DIRT:ore<.018?B.IRON:ore<.075?B.COAL:B.STONE);
  }
 }
 // A three-wide solid path joins Sandbar's east bank to Crew Isle's west bank.
 // An 18-high step at the far end is climbable by the existing one-block jump.
 for(let x=39;x<=49;x++)for(let z=95;z<=97;z++){
  put(x,17,z,B.PLANKS);put(x,16,z,B.STONE);
 }
}

export const SANDBOX=Object.freeze({minX:1,maxX:40,minZ:49,maxZ:88,y:27,centerX:21,centerZ:69,radius:20});
export const insideSandbox=(x,z)=>x>=SANDBOX.minX&&x<=SANDBOX.maxX&&z>=SANDBOX.minZ&&z<=SANDBOX.maxZ;
export const sandboxCircle=(x,z)=>Math.hypot(x+.5-SANDBOX.centerX,z+.5-SANDBOX.centerZ)<=SANDBOX.radius;
export const sandboxRing=(x,z)=>{const d=Math.hypot(x+.5-SANDBOX.centerX,z+.5-SANDBOX.centerZ);return d>=SANDBOX.radius-1&&d<=SANDBOX.radius;};
// Only add air cells, including on a saved world. The versioned migration prevents
// a mined Sandbox block from being restored on a later boot.
export function addSandbox(w){
 const put=(x,y,z,id)=>{if(w.inside(x,y,z)&&!w.get(x,y,z))w.set(x,y,z,id);};
 for(let x=SANDBOX.minX;x<=SANDBOX.maxX;x++)for(let z=SANDBOX.minZ;z<=SANDBOX.maxZ;z++){
  put(x,27,z,sandboxRing(x,z)?B.SAND:B.GRASS);put(x,26,z,B.DIRT);put(x,25,z,B.STONE);
 }
 // A three-wide plank approach climbs from the south edge of Origin Island.
 for(let z=43;z<=49;z++)for(let x=28;x<=30;x++){const y=Math.min(27,23+z-43);put(x,y,z,B.PLANKS);put(x,y-1,z,B.STONE);}
 for(const [x,z] of [[4,52],[37,52],[4,85],[37,85]]){
  for(let y=28;y<=32;y++)put(x,y,z,B.WOOD);
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=1;dy++){
   if(Math.abs(dx)+Math.abs(dz)+Math.abs(dy)>4||!insideSandbox(x+dx,z+dz)||sandboxCircle(x+dx,z+dz))continue;
   put(x+dx,33+dy,z+dz,B.LEAVES);
  }
  put(x,35,z,B.LEAVES);
 }
 for(let x=SANDBOX.minX;x<=SANDBOX.maxX;x++)for(let z=SANDBOX.minZ;z<=SANDBOX.maxZ;z++){
  if(sandboxCircle(x,z)||hash(x,z,901)>.09)continue;
  put(x,28,z,hash(x,z,902)<.5?B.YELLOW_FLOWER:B.WHITE_FLOWER);
 }
}
