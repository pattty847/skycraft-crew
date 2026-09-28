import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraRig } from '../src/camera.js';
import { World } from '../src/world.js';
import { Simulation } from '../src/simulation.js';
import { raycast } from '../src/raycast.js';

test('ground collision retracts the camera while overhead roof placement remains reachable', () => {
  const world = new World();
  for (let x=30; x<40; x++) for (let z=35; z<44; z++) {
    world.set(x,22,z,3);
    world.set(x,26,z,9);
  }
  const simulation = new Simulation(world), entity = simulation.spawn();
  entity.position = {x:34.5,y:23,z:39.5};
  const camera = new THREE.PerspectiveCamera(43,1,.08,300), rig = new CameraRig(camera,world);
  rig.overview = false;
  rig.orbit(0,-330);
  rig.update(entity,1/60);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  assert.ok(direction.y > .85, 'can aim steeply upward');
  assert.ok(camera.position.y > 23, 'camera stays above the ground');
  assert.ok(rig.actualDistance < 3, 'boom retracts instead of restricting pitch');
  const hit = raycast(world,camera.position,direction,8);
  assert.equal(hit.pos.y,26);
  assert.equal(hit.normal.y,-1);
  const pos = {x:hit.pos.x,y:hit.pos.y-1,z:hit.pos.z};
  assert.equal(simulation.place(entity,pos,9),true, 'can attach a block overhead');
});

test('reset recovers from extreme zoom and orbit', () => {
  const rig = new CameraRig(new THREE.PerspectiveCamera(),new World());
  rig.zoom(-10000);rig.orbit(500,10000);rig.reset();
  assert.equal(rig.distance,8);assert.equal(rig.pitch,.5);assert.equal(rig.yaw,.72);
});
