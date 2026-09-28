import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { SIZE } from '../src/world.js';
import { connectWorld } from '../src/network.js';
import { stubGlobals, memoryStorage, until } from './helpers.js';

// An empty world, as the server sends it to a browser that can decompress.
const BLOCKS = deflateRawSync(new Uint8Array(SIZE.x * SIZE.y * SIZE.z)).toString('base64');
const welcome = ({ you = 'me', token = 'tok-1' } = {}) => ({
  type: 'welcome', token, you, size: SIZE, seed: 1, encoding: 'deflate-raw', blocks: BLOCKS, revision: 0, phase: .24, time: 0,
  // The compact wire shape the server sends (see docs/PERFORMANCE-PROTOCOL.md); only your own entity carries `i`.
  entities: [{ id: you, p: [5.5, 20, 5.5], v: [0, 0, 0], d: [0, 0, 1], g: 1, s: 9, i: new Array(40).fill(0) }],
  chat: [], agents: {}, modes: [], extensions: {},
});

// A browser WebSocket driven from the test: open(), receive(message) and drop(code, reason) act as the server.
function socketClass() {
  return class FakeWebSocket {
    static sockets = [];
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWebSocket.sockets.push(this); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    drop(code, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }); }
  };
}

function browser(t, { hash = '', search = '', storage = memoryStorage() } = {}) {
  const WebSocket = socketClass(), replaced = [];
  stubGlobals(t, {
    WebSocket, localStorage: storage, window: { addEventListener() {} },
    location: { hash, search, pathname: '/', protocol: 'http:', host: '127.0.0.1:5199', origin: 'http://127.0.0.1:5199' },
    history: { replaceState: (...args) => replaced.push(args) },
  });
  const ready = connectWorld();
  WebSocket.sockets[0].open();
  return { sockets: WebSocket.sockets, storage, replaced, ready };
}
const inputs = socket => socket.sent.filter(m => m.type === 'input');

test('a pass link wins over the stored pass, is stored, and leaves the address bar', async t => {
  const { sockets, storage, replaced, ready } = browser(t, { hash: '#key=from-link', search: '?invite=abc', storage: memoryStorage({ 'sky:player-token': 'old' }) });
  assert.deepEqual(sockets[0].sent[0], { type: 'join', token: 'from-link', invite: 'abc', compress: true });
  assert.equal(sockets[0].url, 'ws://127.0.0.1:5199/world');
  assert.deepEqual(replaced, [[null, '', '/?invite=abc']], 'the #key fragment is removed at once');
  assert.equal(storage.map.get('sky:player-token'), 'from-link');
  sockets[0].receive(welcome({ token: 'from-server' }));
  const network = await ready;
  assert.equal(storage.map.get('sky:player-token'), 'from-server', 'the welcome token is the one kept');
  assert.equal(network.passLink(), 'http://127.0.0.1:5199/?invite=abc#key=from-server');
});

test('without a link the stored pass is used; blocked storage still joins', async t => {
  await t.test('stored', t2 => {
    const { sockets, replaced } = browser(t2, { storage: memoryStorage({ 'sky:player-token': 'kept' }) });
    assert.equal(sockets[0].sent[0].token, 'kept');
    assert.deepEqual(replaced, []);
  });
  await t.test('blocked, with a link', async t2 => {
    const { sockets, ready } = browser(t2, { hash: '#key=k', storage: memoryStorage({}, { blocked: true }) });
    assert.equal(sockets[0].sent[0].token, 'k');
    sockets[0].receive(welcome());
    assert.equal((await ready).connected, true);
  });
  await t.test('blocked, no link', t2 => {
    const { sockets } = browser(t2, { storage: memoryStorage({}, { blocked: true }) });
    assert.equal(sockets[0].sent[0].token, null);
  });
});

test('input is batched three frames at a time; moves are last-wins and one-shot actions are capped', async t => {
  const { sockets, ready } = browser(t);
  sockets[0].receive(welcome());
  const network = await ready, actions = network.entity.actions;
  actions.move({ x: 1, y: 0, z: 0 }); actions.move({ x: 0, y: 0, z: 1 });
  for (let i = 0; i < 10; i++) actions.jump();
  network.tick(); network.tick();
  assert.deepEqual(inputs(sockets[0]), [], 'nothing is sent before the third frame');
  network.tick();
  const [sent] = inputs(sockets[0]);
  assert.deepEqual(sent.frames.map(f => f.sequence), [0, 1, 2]);
  assert.equal(sent.selected, 9);
  const first = sent.frames[0].actions;
  assert.deepEqual(first.filter(a => a.type === 'move').map(a => a.dir), [{ x: 0, y: 0, z: 1 }]);
  assert.equal(first.filter(a => a.type === 'jump').length, 8);
  assert.deepEqual(sent.frames[1].actions, [], 'actions are sent once');
});

test('after a drop the client retries in 1.5 s with its pass and never replays old frames', async t => {
  const { sockets, ready } = browser(t), statuses = [];
  sockets[0].receive(welcome({ token: 'tok-1' }));
  const network = await ready;
  network.onStatus = text => statuses.push(text);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  network.entity.actions.jump(); network.tick(); network.tick();
  sockets[0].drop(1006);
  assert.equal(network.connected, false);
  assert.deepEqual(statuses, ['Disconnected · edits paused']);
  network.entity.actions.jump();
  assert.equal(network.tick(), undefined);
  t.mock.timers.tick(1499);
  assert.equal(sockets.length, 1);
  t.mock.timers.tick(1);
  assert.equal(sockets.length, 2, 'a new socket after 1.5 s');
  sockets[1].open();
  assert.deepEqual(sockets[1].sent[0], { type: 'join', token: 'tok-1', invite: null, compress: true });
  sockets[1].receive(welcome({ token: 'tok-1' }));
  await until(() => network.connected, { label: 'the second welcome' });
  network.tick(); network.tick(); network.tick();
  const [sent] = inputs(sockets[1]);
  assert.deepEqual(sent.frames.map(f => f.sequence), [0, 1, 2], 'the sequence restarts and the two unsent frames are gone');
  assert.ok(sent.frames.every(f => f.actions.length === 0), 'no action from before the reconnect is replayed');
  assert.deepEqual(inputs(sockets[0]), []);
});

test('close 4001 (opened in another tab) stops retrying and says why', async t => {
  const { sockets, ready } = browser(t);
  sockets[0].receive(welcome());
  const network = await ready;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  sockets[0].drop(4001, 'Opened in another tab');
  t.mock.timers.tick(10000);
  assert.equal(sockets.length, 1);
  assert.match(network.notice, /opened in another tab/);
});

test('close 4003 is final: before the welcome it rejects for the player, after it the status says why', async t => {
  await t.test('before the welcome', async t2 => {
    const { sockets, ready } = browser(t2);
    t2.mock.timers.enable({ apis: ['setTimeout'] });
    sockets[0].drop(4003, 'This island is invite-only.');
    await assert.rejects(ready, error => error.userFacing === true && error.message === 'This island is invite-only.');
    t2.mock.timers.tick(10000);
    assert.equal(sockets.length, 1);
  });
  await t.test('after the welcome', async t2 => {
    const { sockets, ready } = browser(t2);
    sockets[0].receive(welcome());
    const network = await ready, statuses = [];
    network.onStatus = text => statuses.push(text);
    t2.mock.timers.enable({ apis: ['setTimeout'] });
    sockets[0].drop(4003, 'Your guest pass was switched off.');
    t2.mock.timers.tick(10000);
    assert.equal(sockets.length, 1);
    assert.equal(statuses.at(-1), 'Your guest pass was switched off.');
  });
});

test('a subscriber that arrives late still gets the latest message of its type', async t => {
  const { sockets, ready } = browser(t);
  sockets[0].receive(welcome());
  const network = await ready;
  sockets[0].receive({ type: 'guests', guests: [1] });
  sockets[0].receive({ type: 'guests', guests: [1, 2] });
  sockets[0].receive({ type: 'notice', text: 'marker' });
  await until(() => network.notice === 'marker', { label: 'the inbox to drain' });
  const seen = [];
  network.on('guests', m => seen.push(m.guests));
  assert.deepEqual(seen, [[1, 2]], 'called at once with the latest only');
});
