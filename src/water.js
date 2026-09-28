import * as THREE from 'three';
import { paintRow, noise2, hex, mix, makeRng } from './pixel-art.js';
// Origin Island's spring: a textured, gently flowing surface in the carved channel,
// a film over the lip, and a particle waterfall into the sky. Scenery, not blocks.
const CHANNEL = { x0: 31, x1: 44, z0: 28, z1: 31, surface: 22.8 };
const LIP = { x0: 44, x1: 45, y: 23.06 };
const FALL = { x: 45, y: 23, height: 58, count: 280 };

function waterTexture() {
  const canvas = paintRow(document.createElement('canvas'), 1, [({ fill, px, rng }) => {
    fill((x, y) => mix(hex('#3f94d2'), hex('#5ab2e8'), noise2(x * .25, y * .5, 9)));
    for (let n = 0; n < 5; n++) { const x0 = Math.floor(rng() * 12), y0 = Math.floor(rng() * 16); for (let x = x0; x < x0 + 4; x++) px(x, y0, hex('#a9dcf6')); }
  }]);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function surface(texture, w, d, x, y, z) {
  const map = texture.clone(); map.repeat.set(w, d); map.needsUpdate = true;
  // The tint deepens the blue under the scene's ACES tone mapping.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map, color: 0x9cc8ec, transparent: true, opacity: .82, depthWrite: false }));
  mesh.position.set(x, y, z); mesh.receiveShadow = true; mesh.renderOrder = 1;
  return mesh;
}

export function createWater(scene) {
  const group = new THREE.Group(), texture = waterTexture(), depth = CHANNEL.z1 - CHANNEL.z0, midZ = (CHANNEL.z0 + CHANNEL.z1) / 2;
  const river = surface(texture, CHANNEL.x1 - CHANNEL.x0, depth, (CHANNEL.x0 + CHANNEL.x1) / 2, CHANNEL.surface, midZ);
  const lip = surface(texture, LIP.x1 - LIP.x0, depth, (LIP.x0 + LIP.x1) / 2, LIP.y, midZ);
  group.add(river, lip);

  const rng = makeRng(5), dummy = new THREE.Object3D(), drops = [];
  const fall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: '#6db6e8', transparent: true, opacity: .85 }), FALL.count);
  fall.frustumCulled = false; group.add(fall);
  const reset = (d, initial) => {
    d.x = FALL.x + .05 + rng() * .4; d.z = CHANNEL.z0 + .1 + rng() * (depth - .2);
    d.y = initial ? FALL.y - rng() * FALL.height : FALL.y - .15;
    d.v = initial ? rng() * 12 : rng() * 1.5; d.s = .2 + rng() * .3;
  };
  for (let i = 0; i < FALL.count; i++) { const d = {}; reset(d, true); drops.push(d); }
  scene.add(group);

  return {
    group,
    update(dt, reducedMotion = false) {
      const m = reducedMotion ? .25 : 1, bottom = FALL.y - FALL.height;
      river.material.map.offset.x -= dt * .35 * m; lip.material.map.offset.x -= dt * .9 * m;
      for (let i = 0; i < FALL.count; i++) {
        const d = drops[i];
        d.v += dt * 14; d.y -= d.v * dt * m; d.x += dt * .7 * m;
        if (d.y < bottom) reset(d, false);
        const fade = THREE.MathUtils.clamp((d.y - bottom) / 18, 0, 1);
        dummy.position.set(d.x, d.y, d.z); dummy.scale.set(d.s * fade, d.s * fade * 1.8, d.s * fade); dummy.updateMatrix();
        fall.setMatrixAt(i, dummy.matrix);
      }
      fall.instanceMatrix.needsUpdate = true;
    },
  };
}
