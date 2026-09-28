import * as THREE from 'three';
import { paintRow } from './pixel-art.js';
import { BLOCKS } from './blocks.js';
// Five crack stages drawn over the block being mined, growing with progress.
// Reads the same entity.breaking state that drives the HUD progress bar.
const STAGES = 5;

function crackTiles() {
  return Array.from({ length: STAGES }, (_, stage) => ({ px, rng }) => {
    const strands = 3 + stage * 2, length = 3 + stage * 2;
    for (let n = 0; n < strands; n++) {
      let x = 8 + Math.floor((rng() - .5) * 6), y = 8 + Math.floor((rng() - .5) * 6);
      const dx = rng() < .5 ? 1 : -1, dy = rng() < .5 ? 1 : -1;
      for (let k = 0; k < length; k++) { px(x, y, [20, 16, 14], 190); if (rng() < .5) x += dx; else y += dy; }
    }
  });
}

export function crackStage(breaking) {
  if (!breaking) return -1;
  const hardness = BLOCKS[breaking.id]?.hardness;
  return hardness ? Math.min(STAGES - 1, Math.floor(breaking.elapsed / hardness * STAGES)) : -1;
}

export function createBlockCracks(scene) {
  const texture = new THREE.CanvasTexture(paintRow(document.createElement('canvas'), STAGES, crackTiles()));
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  const geometries = Array.from({ length: STAGES }, (_, stage) => {
    const geometry = new THREE.BoxGeometry(1.006, 1.006, 1.006), uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (stage + .02 + uv.getX(i) * .96) / STAGES);
    return geometry;
  });
  const mesh = new THREE.Mesh(geometries[0], new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  mesh.visible = false; scene.add(mesh);
  return {
    update(breaking) {
      const stage = crackStage(breaking);
      mesh.visible = stage >= 0;
      if (!mesh.visible) return;
      mesh.geometry = geometries[stage];
      mesh.position.set(breaking.pos.x + .5, breaking.pos.y + .5, breaking.pos.z + .5);
    },
  };
}
