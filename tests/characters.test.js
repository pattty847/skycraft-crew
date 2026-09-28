import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVoxelRig } from '../src/voxel-rig.js';
import { SHADOW_LAYER } from '../src/shadow-proxy.js';

// Nameplates and Claude's z's paint on a canvas; a stub canvas is enough here.
const context = new Proxy({}, { get: () => () => {}, set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
const { createCharacter } = await import('../src/character.js');
const { createClaude } = await import('../src/claude-character.js');

const drawn = root => { const meshes = []; root.traverse(o => { if (o.isMesh && o.layers.isEnabled(0)) meshes.push(o); }); return meshes; };
const casters = root => { const meshes = []; root.traverse(o => { if (o.isMesh && o.castShadow && o.visible) meshes.push(o); }); return meshes; };
// Where a skinned vertex ends up in world space, with the rig's current pose.
const vertexWorld = (mesh, i) => {
  mesh.parent.updateMatrixWorld(true); mesh.skeleton.update();
  const v = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
  return mesh.applyBoneTransform(i, v).applyMatrix4(mesh.matrixWorld);
};

test('a rig part moves its boxes exactly as a Group would', () => {
  const root = new THREE.Group(), rig = createVoxelRig(root), material = new THREE.MeshLambertMaterial();
  const arm = rig.part(rig.base, .4, 1.1, 0);
  rig.box(.2, .5, .2, 0, -.25, 0, { material }, arm);
  rig.box(.1, .1, .1, 0, 0, 0, { material });
  const { meshes } = rig.build();
  assert.equal(meshes.length, 1, 'one material, one mesh');
  root.position.set(10, 20, 30); root.rotation.y = .7; arm.rotation.x = -1.1;
  // The same box built the old way, from a Group.
  const group = new THREE.Group(); group.position.copy(root.position); group.rotation.copy(root.rotation);
  const armGroup = new THREE.Group(); armGroup.position.set(.4, 1.1, 0); armGroup.rotation.x = -1.1; group.add(armGroup);
  const box = new THREE.Mesh(new THREE.BoxGeometry(.2, .5, .2)); box.position.set(0, -.25, 0); armGroup.add(box);
  group.updateMatrixWorld(true);
  for (let i = 0; i < 24; i++) {
    const expected = new THREE.Vector3().fromBufferAttribute(box.geometry.attributes.position, i).applyMatrix4(box.matrixWorld);
    assert.ok(vertexWorld(meshes[0], i).distanceTo(expected) < 1e-6, `vertex ${i}`);
  }
});

test('a robot is a few draw calls, casts one proxy shadow, and still animates', () => {
  const scene = new THREE.Scene(), robot = createCharacter(scene, { label: 'Codex · AI', tint: 0x84f1cd });
  robot.update({ position: { x: 5, y: 20, z: 5 }, direction: { x: 0, z: 1 }, velocity: { x: 0, y: 0, z: 0 } }, 0, false);
  const meshes = drawn(robot.root).filter(m => m.visible && m.parent.visible);
  assert.equal(meshes.length, 2, 'shell and glow, down from about 25 boxes');
  assert.ok(meshes.every(m => m.isSkinnedMesh && !m.castShadow));
  const shadows = casters(robot.root).filter(m => m.parent.visible);
  assert.equal(shadows.length, 1);
  assert.ok(shadows[0].layers.isEnabled(SHADOW_LAYER) && !shadows[0].layers.isEnabled(0), 'the proxy is invisible to the main camera');
  // Walking swings the legs: a foot vertex moves between two poses.
  const shell = meshes.find(m => m.material.vertexColors), foot = shell.geometry.attributes.position.count - 1;
  const standing = vertexWorld(shell, foot);
  robot.update({ position: { x: 5, y: 20, z: 5 }, direction: { x: 0, z: 1 }, velocity: { x: 4, y: 0, z: 0 } }, .15, false);
  assert.ok(vertexWorld(shell, foot).distanceTo(standing) > .05, 'the limb moved');
  // A wave still raises the right arm through the shared gesture pose.
  robot.update({ position: { x: 5, y: 20, z: 5 }, direction: { x: 0, z: 1 }, velocity: { x: 0, y: 0, z: 0 }, gesture: { kind: 'wave', startedAt: 0, endsAt: 2 } }, 1, false, 1);
  const arm = robot.root.getObjectsByProperty('isBone', true).filter(b => b.position.y === 1.1 && b.position.x > 0)[0];
  assert.ok(arm.rotation.z > 2, 'the arm is up');
  robot.dispose();
  assert.equal(scene.children.length, 0);
});

test('Claude keeps its squash, blink and sparkle, lit through the shared pool', () => {
  const scene = new THREE.Scene(), claude = createClaude(scene);
  claude.update({ position: { x: 1, y: 2, z: 3 }, direction: { x: 0, z: 1 }, velocity: { x: 0, y: 0, z: 0 }, grounded: true }, 4.2, { night: 1 });
  assert.ok(drawn(claude.root).filter(m => m.visible).length <= 6, 'clay, feet, face, blush, sparkle');
  assert.ok(!scene.getObjectsByProperty('isPointLight', true).length, 'no light of its own');
  assert.deepEqual([claude.light.x, claude.light.y, claude.light.z], [1, 3.25, 3]);
  assert.ok(claude.light.intensity > 2);
  const eyes = claude.root.getObjectsByProperty('isBone', true).filter(b => Math.abs(b.position.x) === .15);
  assert.equal(eyes.length, 2);
  claude.update({ position: { x: 1, y: 2, z: 3 }, direction: { x: 0, z: 1 }, velocity: { x: 0, y: 0, z: 0 }, grounded: true }, 4.35, {});
  assert.ok(eyes.every(e => e.scale.y < .5), 'blinking closes the eyes');
  assert.equal(casters(claude.root).length, 1);
  claude.dispose();
  assert.equal(scene.children.length, 0);
});
