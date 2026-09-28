import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, CHUNK } from '../src/world.js';
import { B } from '../src/blocks.js';
import { ChunkRenderer } from '../src/chunks.js';

// A clock that advances a fixed step each time it is read.
const ticking = (step) => { let t = 0; return () => (t += step); };
const chunkMeshes = renderer => [...renderer.meshes.values()].flat();

test('joining meshes the world a budget at a time, nearest chunks first', () => {
  const world = new World(), scene = new THREE.Scene();
  world.set(5, 5, 5, B.STONE); world.set(100, 40, 100, B.STONE);
  const chunks = new ChunkRenderer(scene, world, null);
  const total = world.dirty.size;
  assert.ok(total >= 192, 'every chunk waits to be meshed');
  assert.equal(chunkMeshes(chunks).length, 0, 'nothing meshes in the constructor');
  // Each chunk "costs" 1 ms: a 4 ms budget builds a handful, never the whole world.
  const built = chunks.update({ budgetMs: 4, focus: { x: 100, y: 40, z: 100 }, now: ticking(1) });
  assert.ok(built >= 1 && built <= 5, `built ${built}`);
  assert.equal(world.dirty.size, total - built);
  assert.ok(chunks.meshes.has(`${Math.floor(100 / CHUNK)},${Math.floor(40 / CHUNK)},${Math.floor(100 / CHUNK)}`), 'the chunk at the focus comes first');
  assert.ok(!chunks.meshes.has('0,0,0'), 'far chunks wait');
  // An over-budget chunk still makes progress: at least one per frame.
  assert.equal(chunks.update({ budgetMs: 0, now: ticking(50) }), 1);
  let frames = 2;
  while (world.dirty.size) { chunks.update({ budgetMs: 4, now: ticking(1) }); frames++; }
  assert.ok(frames > 10, 'the work spreads over many frames');
  assert.ok(chunks.meshes.has('0,0,0'));
});

test('an unbudgeted update meshes everything at once (companion captures)', () => {
  const world = new World(), scene = new THREE.Scene();
  world.set(5, 5, 5, B.STONE);
  const chunks = new ChunkRenderer(scene, world, null);
  chunks.update();
  assert.equal(world.dirty.size, 0);
});

test('chunk meshes carry only non-empty material groups, solids and plants in separate layers', () => {
  const world = new World(), scene = new THREE.Scene();
  world.set(5, 5, 5, B.STONE); world.set(5, 6, 5, B.YELLOW_FLOWER); world.set(40, 5, 40, B.STONE);
  const chunks = new ChunkRenderer(scene, world, null);
  chunks.update();
  const [solid, plant] = chunks.meshes.get('0,0,0');
  assert.equal(solid.parent, chunks.solids); assert.equal(plant.parent, chunks.plants);
  assert.equal(solid.geometry, plant.geometry, 'one geometry, two layers');
  assert.deepEqual(solid.geometry.groups.map(g => g.materialIndex), [0, 2], 'no empty lamp group');
  assert.equal(solid.material[2].visible, false); assert.equal(plant.material[0].visible, false);
  const [stoneOnly, ...rest] = chunks.meshes.get('2,0,2');
  assert.equal(rest.length, 0, 'no plant mesh without plants');
  assert.deepEqual(stoneOnly.geometry.groups.map(g => g.materialIndex), [0]);
  // Remeshing replaces the meshes instead of stacking new ones.
  world.set(5, 6, 5, B.AIR); chunks.update();
  assert.equal(chunks.plants.children.length, 0);
  assert.equal(chunks.solids.children.length, 2);
});
