import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { tempRoom, join, input, companion, scriptModel, until, stubGlobals, memoryStorage, FakeElement, fire, flatWorld, ground, startServer } from './helpers.js';

test('an unscripted companion refuses to call the model; a scripted one records payloads', async t => {
  const room = tempRoom(t), c = companion(room);
  await assert.rejects(() => c.think({}), /no model calls in tests/);
  const { payloads } = scriptModel(c, ['first', 'second']);
  assert.equal(await c.think({ n: 1 }), 'first');
  assert.equal(await c.think({ n: 2 }), 'second');
  assert.equal(await c.think({ n: 3 }), 'second', 'the last reply repeats');
  assert.deepEqual(payloads.map(p => p.n), [1, 2, 3]);
});

test('join gives a welcomed fake browser whose input reaches the simulation', t => {
  const room = tempRoom(t), { socket, entity, welcome, token } = join(room);
  assert.equal(welcome.type, 'welcome');
  assert.equal(welcome.you, entity.id);
  assert.equal(typeof token, 'string');
  input(room, socket, 0, { type: 'jump' });
  assert.equal(join(room, { token }).entity.id, entity.id, 'the token returns the same player');
  assert.deepEqual(socket.closed, { code: 4001, reason: 'Opened in another tab' });
});

test('until waits for a condition and names it when it never holds', async () => {
  let ready = false;
  setImmediate(() => { ready = true; });
  await until(() => ready);
  await assert.rejects(() => until(() => false, { maxTurns: 3, label: 'nothing' }), /nothing/);
});

test('stubGlobals restores what it replaced', async t => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  await t.test('inner', t2 => {
    stubGlobals(t2, { localStorage: memoryStorage({ a: '1' }), skyTestOnly: 1 });
    assert.equal(localStorage.getItem('a'), '1');
    assert.equal(globalThis.skyTestOnly, 1);
  });
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), before);
  assert.equal('skyTestOnly' in globalThis, false);
  assert.throws(() => memoryStorage({}, { blocked: true }).getItem('a'), /insecure/);
});

test('FakeElement keeps classes and children; fire sets event fields', () => {
  const parent = new FakeElement(), child = new FakeElement();
  parent.append(child);
  assert.equal(parent.lastElementChild, child);
  child.className = 'row warn';
  assert.equal(child.classList.contains('warn'), true);
  child.classList.toggle('warn', false);
  assert.equal(child.className, 'row');
  child.remove();
  assert.equal(parent.children.length, 0);
  let seen;
  parent.addEventListener('pointerdown', e => { seen = [e.pointerId, e.target.closest()]; });
  fire(parent, 'pointerdown', { pointerId: 3, target: { closest: () => 'x' } });
  assert.deepEqual(seen, [3, 'x']);
});

test('flatWorld and ground find the standing cell above the floor', () => {
  const world = flatWorld({ x: [0, 4], z: [0, 4], y: 2 });
  assert.deepEqual(ground(world, 1, 1), { x: 1.5, y: 3, z: 1.5 });
});

test('startServer serves on a free port and cleans up its process and directory', async t => {
  let server;
  await t.test('run', async t2 => {
    server = await startServer(t2);
    assert.notEqual(server.port, 5173);
    assert.ok(server.child.spawnargs.includes('--sky-test'));
    await server.open();
  });
  assert.notEqual(server.child.exitCode ?? server.child.signalCode, null, 'the child exited');
  assert.equal(existsSync(server.dir), false, 'the data directory is gone');
});
