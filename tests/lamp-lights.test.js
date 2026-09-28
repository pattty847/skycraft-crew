import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { B } from '../src/blocks.js';
import { createLampLights, nearestSources } from '../src/lamp-lights.js';

const pointLights = scene => scene.children.filter(o => o.isPointLight);

test('nearestSources keeps the closest few in order and skips dark or out-of-range ones', () => {
  const s = (x, extra = {}) => ({ x, y: 0, z: 0, intensity: 1, range: Infinity, ...extra });
  const sources = [s(9), s(2), s(7), s(1, { intensity: 0 }), s(4), s(40, { range: 32 }), s(3)];
  const out = new Array(3), distances = new Float64Array(3);
  assert.equal(nearestSources(sources, { x: 0, y: 0, z: 0 }, 3, out, distances), 3);
  assert.deepEqual(out.map(o => o.x), [2, 3, 4]);
  assert.equal(nearestSources([s(5)], { x: 0, y: 0, z: 0 }, 3, out, distances), 1);
});

test('the light pool never grows or shrinks, whatever the lamps and scenery lights do', () => {
  const world = new World(), scene = new THREE.Scene();
  const pool = createLampLights(scene, world, { size: 3 });
  const position = { x: 10, y: 10, z: 10 };
  assert.equal(pointLights(scene).length, 3);
  pool.update(position, 1);
  assert.ok(pool.lights.every(l => l.intensity === 0), 'no glowing blocks: every light is dark');
  for (let i = 0; i < 6; i++) world.set(10 + i * 2, 10, 12, i % 2 ? B.TORCH : B.LAMP);
  const glow = { x: 10, y: 11, z: 9, color: 0xffb37a, intensity: 2.4, distance: 5, decay: 1.6 };
  pool.update(position, 1, [glow]);
  assert.equal(pointLights(scene).length, 3, 'still three lights with seven sources');
  assert.ok(pool.lights.every(l => l.intensity > 0));
  assert.deepEqual(pool.lights[0].position.toArray(), [10, 11, 9], "Claude's glow is nearest, so it gets the first light");
  assert.deepEqual(pool.lights[1].position.toArray(), [10.5, 10.5, 12.5]);
  assert.equal(pool.lights[1].distance, 9); assert.equal(pool.lights[1].decay, 2);
  assert.equal(pool.lights[2].distance, 6, 'a torch is a small light');
  // Mining the lamps frees their lights instead of removing them.
  for (let i = 0; i < 6; i++) world.set(10 + i * 2, 10, 12, B.AIR);
  glow.intensity = 0;
  pool.update(position, 1, [glow]);
  assert.equal(pointLights(scene).length, 3);
  assert.ok(pool.lights.every(l => l.intensity === 0));
});

test('a full rescan finds every glowing block', () => {
  const world = new World(), scene = new THREE.Scene();
  world.set(1, 1, 1, B.LANTERN); world.set(100, 40, 100, B.LAMP);
  const pool = createLampLights(scene, world, { size: 2 });
  pool.refresh(true);
  pool.update({ x: 1, y: 1, z: 1 }, 0);
  assert.equal(pool.lights[0].distance, 12, 'the lantern is lit');
  assert.ok(Math.abs(pool.lights[0].intensity - .15 * 12 * 1.35) < 1e-9, 'lamps keep a daytime glow');
  assert.equal(pool.lights[1].intensity, 0, 'the far lamp is out of range');
});
