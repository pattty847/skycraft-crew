import * as THREE from 'three';
import { paintRow, noise2, hex, mix, pick } from './pixel-art.js';
export const TILE_COUNT = 27;
// Original 16×16 pixel art, painted in code. Tile order matches BLOCKS[].texture/side/bottom:
// 0 grass top, 1 grass side, 2 dirt, 3 stone, 4 sand, 5 wood top, 6 wood side, 7 leaves,
// 8 coal ore, 9 iron ore, 10 planks, 11 clay, 12 lamp, 13–17 plants.
const DIRT = ['#6f4630', '#7d5036', '#8a5a3b', '#976644'].map(hex);
const GREEN = ['#4c8f38', '#57a041', '#63b04a', '#72bf55', '#86cc66'].map(hex);
const STONE = ['#62646c', '#6e7079', '#7a7c85', '#868891', '#93959d'].map(hex);
const SAND = ['#d7c186', '#dfca91', '#e6d49c', '#eddca9'].map(hex);
const BARK = ['#4f3521', '#5c3e27', '#6b4a2f', '#7a5638'].map(hex);
const LEAF = ['#2f6f2c', '#3a7f34', '#3f8f3a', '#4d9e44', '#5eb052'].map(hex);
const PLANK = ['#a8773f', '#b5844a', '#c09256', '#cb9f63'].map(hex);
const CLAY = ['#b8643f', '#c46f49', '#cc7a52', '#d6885f', '#e09a72'].map(hex);

const dirt = ({ fill, px, rng }, seed = 3) => {
  fill((x, y) => pick(DIRT, noise2(x * .45, y * .45, seed) * .7 + rng() * .3));
  for (let n = 0; n < 5; n++) { const x = Math.floor(rng() * 15), y = Math.floor(rng() * 15); px(x, y, hex('#a58c73')); px(x + 1, y, hex('#8f7760')); }
  for (let n = 0; n < 8; n++) px(Math.floor(rng() * 16), Math.floor(rng() * 16), hex('#5a3826'));
};
const stone = ({ fill, rng }) => fill((x, y) => pick(STONE, noise2(x * .3, y * .3, 21) * .75 + rng() * .25));
const ore = (dark, mid, glint) => p => {
  stone(p);
  for (const [sx, sy] of [[3, 3], [10, 4], [5, 10], [12, 11]]) {
    const x = sx + Math.floor(p.rng() * 2), y = sy + Math.floor(p.rng() * 2);
    p.px(x, y, mid); p.px(x + 1, y, dark); p.px(x, y + 1, dark); p.px(x + 1, y + 1, mid);
    if (p.rng() < .7) p.px(x + 2, y + 1, dark);
    if (p.rng() < .5) p.px(x - 1, y, dark);
    p.px(x, y, glint);
  }
};

const TILES = [
  // 0 grass top
  ({ fill, px, rng }) => {
    fill((x, y) => pick(GREEN, noise2(x * .35, y * .35, 5) * .6 + rng() * .4));
    for (let n = 0; n < 10; n++) { const x = Math.floor(rng() * 16), y = Math.floor(rng() * 15); px(x, y, GREEN[4]); px(x, y + 1, GREEN[3]); }
  },
  // 1 grass side: dirt with a ragged green fringe
  p => {
    dirt(p, 9);
    for (let x = 0; x < 16; x++) {
      const d = 3 + Math.floor(noise2(x * .6, 1, 8) * 3) + (p.rng() < .2 ? 1 : 0);
      for (let y = 0; y < d; y++) p.px(x, y, pick(GREEN, .3 + p.rng() * .5 - y * .06));
      p.px(x, d, hex('#4a6a2c'));
    }
  },
  // 2 dirt
  p => dirt(p),
  // 3 stone, with hairline cracks
  p => {
    stone(p);
    for (let n = 0; n < 3; n++) {
      let x = Math.floor(p.rng() * 16), y = Math.floor(p.rng() * 16);
      for (let s = 0; s < 4; s++) { p.px(x, y, hex('#555760')); x += p.rng() < .5 ? 1 : 0; y++; }
    }
  },
  // 4 sand, with wind ripples
  ({ fill, px, rng }) => {
    fill(() => pick(SAND, .2 + rng() * .8));
    for (let r = 0; r < 3; r++) { const y0 = 3 + r * 5, x0 = Math.floor(rng() * 6); for (let x = x0; x < x0 + 7; x++) px(x, y0 + (x % 4 === 0 ? 1 : 0), hex('#f3e4b6')); }
    for (let n = 0; n < 6; n++) px(Math.floor(rng() * 16), Math.floor(rng() * 16), hex('#c9ae70'));
  },
  // 5 wood top: growth rings inside bark
  ({ fill, px }) => {
    fill((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d > 7 ? BARK[1] : Math.floor(d * .9) % 2 ? hex('#b48a55') : hex('#c89c63'); });
    px(7, 7, hex('#8a6438')); px(8, 8, hex('#8a6438'));
  },
  // 6 wood side: bark stripes and a knot
  ({ fill, px, rng }) => {
    const col = Array.from({ length: 16 }, () => rng());
    fill((x, y) => pick(BARK, col[x] * .8 + noise2(x, y * .25, 4) * .2));
    for (let x = 0; x < 16; x += 4) for (let y = 0; y < 16; y++) if (rng() < .55) px(x + (y % 5 === 0 ? 1 : 0), y, hex('#3f2918'));
    px(9, 6, hex('#3f2918')); px(10, 6, hex('#3f2918')); px(9, 7, hex('#2f1f12')); px(10, 7, hex('#3f2918'));
  },
  // 7 leaves: round clumps with the odd blossom
  ({ fill, px, rng }) => {
    fill(() => LEAF[0].map(c => c * .8));
    for (let n = 0; n < 16; n++) {
      const cx = rng() * 16, cy = rng() * 16, r = 1.6 + rng() * 1.8, shade = 1 + Math.floor(rng() * 3);
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
        if (Math.hypot(x, y) > r) continue;
        px((Math.floor(cx) + x + 16) % 16, (Math.floor(cy) + y + 16) % 16, LEAF[Math.min(4, shade + (x + y < -1 ? 1 : 0))]);
      }
    }
    for (let n = 0; n < 2; n++) px(Math.floor(rng() * 16), Math.floor(rng() * 16), hex('#f2b8c6'));
  },
  // 8 coal ore, 9 iron ore
  ore(hex('#1f1c1c'), hex('#2f2b2a'), hex('#6a6461')),
  ore(hex('#a86b4a'), hex('#cf9670'), hex('#f1c9a8')),
  // 10 planks: four boards, staggered joints, nails
  ({ fill, px }) => {
    const tone = [.3, .7, .45, .85];
    fill((x, y) => pick(PLANK, tone[y >> 2] * .7 + noise2(x * .2, y * 1.3, 6) * .3));
    for (let b = 0; b < 4; b++) {
      for (let x = 0; x < 16; x++) px(x, b * 4, hex('#7a5328'));
      const j = [5, 12, 2, 9][b];
      for (let y = b * 4 + 1; y < b * 4 + 4; y++) px(j, y, hex('#8a6030'));
      px((j + 3) % 16, b * 4 + 2, hex('#6b4722'));
    }
  },
  // 11 clay: smooth warm strata with pale grit
  ({ fill, px, rng }) => {
    fill((x, y) => pick(CLAY, noise2(x * .12, y * .55, 14) * .75 + rng() * .25));
    for (let y = 3; y < 16; y += 5) for (let x = 0; x < 16; x++) if (noise2(x * .5, y, 15) > .35) px(x, y + (x % 7 === 0 ? 1 : 0), hex('#a9573a'));
    for (let n = 0; n < 7; n++) px(Math.floor(rng() * 16), Math.floor(rng() * 16), hex('#f0b894'));
  },
  // 12 lamp: iron frame, cross mullions, warm glass brightest at the centre
  ({ fill, px }) => {
    fill((x, y) => mix(hex('#fff4c6'), hex('#f5b54a'), Math.min(1, Math.hypot(x - 7.5, y - 7.5) / 7.5)));
    for (let i = 0; i < 16; i++) for (const e of [0, 1, 14, 15]) { px(i, e, hex('#3b2a22')); px(e, i, hex('#3b2a22')); }
    for (let i = 2; i < 14; i++) { px(7, i, hex('#5a4030')); px(i, 7, hex('#5a4030')); }
    for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) px(x, y, hex('#8a6a4a'));
    px(4, 4, hex('#ffffff')); px(5, 4, hex('#fffbe6')); px(4, 5, hex('#fffbe6'));
  },
  // 13 sapling: small branching shoot and three tiers of leaves.
  ({px})=>{for(let y=7;y<16;y++)px(7,y,hex('#6d4c30'));for(const [x,y] of [[7,4],[6,5],[8,5],[5,6],[9,6],[6,7],[8,7],[4,8],[10,8],[6,9],[8,9]]){px(x,y,hex('#3b8e43'));px(x+1,y,hex('#6ebc59'));}},
  // 14–15 mushrooms: pale stalk, colored cap, shadowed rim.
  ...['#bb554b','#8d6249'].map(cap=>({px})=>{for(let y=9;y<15;y++)for(let x=7;x<=8;x++)px(x,y,hex('#dbc9a5'));for(let y=6;y<=9;y++)for(let x=4+(y===6?2:0);x<=11-(y===6?2:0);x++)px(x,y,hex(y===9?'#594035':cap));for(const x of [6,9])px(x,7,hex('#f4dfbd'));}),
  // 16–17 flowers: fine stems and original warm meadow blooms.
  ...['#ffd17b','#f9ebbb'].map(bloom=>({px})=>{for(let y=8;y<16;y++)px(7,y,hex('#518465'));for(const [x,y] of [[5,10],[6,11],[9,12]])px(x,y,hex('#65a36c'));for(const [x,y] of [[7,4],[5,6],[9,6],[7,8],[6,5],[8,5],[6,7],[8,7]])px(x,y,hex(bloom));px(7,6,hex('#b8724f'));}),
  // 18 stick; 19–21 pickaxes; 22 ingot. Item tiles have clear silhouettes.
  ({px})=>{for(let y=2;y<15;y++){px(7,y,hex('#744823'));px(8,y,hex('#bd8c50'));}px(6,4,hex('#d7a263'));},
  ...['#af7844','#90929b','#ccd0d6'].map(head=>({px})=>{for(let y=5;y<15;y++){px(8,y,hex('#744823'));px(9,y,hex('#b48248'));}for(let x=3;x<13;x++){px(x,3,hex(head));px(x,4,hex(head));}px(3,5,hex(head));px(12,5,hex(head));}),
  ({px})=>{for(let y=5;y<12;y++)for(let x=3;x<13;x++)px(x,y,hex(y<7?'#eef0ef':y<10?'#c5c9cc':'#888e96'));for(let x=5;x<11;x++)px(x,4,hex('#f8f8ed'));},
  // 23 crafting table: wood border and four inset worktop panels.
  ({fill,px})=>{fill(()=>hex('#754723'));for(let y=2;y<14;y++)for(let x=2;x<14;x++)px(x,y,hex((x===7||y===7)?'#704320':'#b78950'));for(const [x,y] of [[4,4],[10,4],[4,10],[10,10]])px(x,y,hex('#dcbb7b'));},
  // 24 furnace: gray stone shell and warm open firebox.
  ({fill,px})=>{fill((x,y)=>pick(STONE,noise2(x*.35,y*.35,18)));for(let y=5;y<14;y++)for(let x=3;x<13;x++)px(x,y,hex(y>10?'#3a3030':'#33343a'));for(let y=8;y<13;y++)for(let x=5;x<11;x++)px(x,y,hex(y<10?'#f8b84e':'#d75b2e'));},
  // 25 torch: slim wooden shaft with an amber flame.
  ({px})=>{for(let y=7;y<16;y++){px(7,y,hex('#744823'));px(8,y,hex('#b48248'));}for(const [x,y] of [[7,2],[6,3],[7,3],[8,3],[6,4],[7,4],[8,4],[7,5],[8,5],[7,6]])px(x,y,hex(y<4?'#fff4a7':y<6?'#ffb344':'#e27425'));},
  // 26 lantern: iron cage enclosing bright glass.
  ({fill,px})=>{fill((x,y)=>mix(hex('#fff5bf'),hex('#e7a33f'),Math.min(1,Math.hypot(x-7.5,y-8)/8)));for(let i=2;i<14;i++)for(const edge of [2,13]){px(edge,i,hex('#45484e'));px(i,edge,hex('#45484e'));}for(let y=3;y<13;y++)px(7,y,hex('#787a7d'));for(let x=5;x<11;x++)px(x,1,hex('#5d6269'));},
];

export function createAtlas() {
  const canvas = paintRow(document.createElement('canvas'), TILE_COUNT, TILES);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, canvas };
}
