// Shared test setup. Not a test file: `npm test` runs tests/**/*.test.js only.
// Additions are welcome; a signature change needs a note in the lane file.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { Room } from '../server/room.js';
import { WorldChat } from '../server/chat.js';
import { Companion, PERSONAS } from '../server/companion.js';
import { standable } from '../server/navigation/pathfinder.js';
import { World } from '../src/world.js';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));

// --- Files and rooms -------------------------------------------------------

/** A directory under the OS temp dir, removed after the test. Never under data/. */
export function tempDir(t, prefix = 'sky-test-') {
  const dir = mkdtempSync(joinPath(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A Room in a temp directory. chat attaches a real WorldChat; quietSave makes save() a no-op. */
export function tempRoom(t, { prefix = 'sky-room-', chat = false, quietSave = false } = {}) {
  const room = new Room(tempDir(t, prefix));
  if (chat) room.chat = new WorldChat(room);
  if (quietSave) room.save = () => {};
  return room;
}

/** A server restart: a new Room over the same directory (save the old one first if needed). */
// Saves are coalesced (see Room.markDirty); flush before reopening the directory.
export const restart = room => { room.flushSave?.(); return new Room(room.directory); };

// --- Fake browser sockets ---------------------------------------------------

/** What Room needs of a browser socket. messages holds every sent message, parsed. */
export function fakeSocket() {
  return {
    readyState: 1, bufferedAmount: 0, messages: [], closed: null,
    send(raw) { this.messages.push(JSON.parse(raw)); },
    close(code, reason) { this.readyState = 3; this.closed = { code, reason }; },
    last(type) { return type ? this.messages.findLast(m => m.type === type) : this.messages.at(-1); },
  };
}

/** Connect a fake browser the way the join handshake does. */
export function join(room, { token, compress = false } = {}) {
  const socket = fakeSocket(), entity = room.connect(socket, token, { compress }), welcome = socket.messages[0];
  return { socket, entity, welcome, token: welcome.token };
}

/** One input frame with the given actions, then one room tick. */
export function input(room, socket, sequence, ...actions) {
  room.receive(socket, { type: 'input', frames: [{ sequence, actions }] });
  room.tick(1 / 60);
}

/** A player entity attached to a socket without a welcome (what companion runs need). */
export function attachPlayer(room, { id = 'player', position } = {}) {
  const player = room.simulation.spawn(id), socket = fakeSocket();
  if (position) player.position = { ...position };
  room.clients.set(socket, { entity: player });
  return { socket, player };
}

// --- Worlds and ticking -----------------------------------------------------

/** An empty World with a floor of `block` at height y over [x0,x1) × [z0,z1). */
export function flatWorld({ x = [0, 30], z = [0, 30], y = 0, block = 3 } = {}) {
  const world = new World();
  for (let i = x[0]; i < x[1]; i++) for (let k = z[0]; k < z[1]; k++) world.set(i, y, k, block);
  return world;
}

/** The highest standable cell at (x, z) that does not stand on wood or leaves. */
export function ground(world, x, z) {
  for (let y = 46; y > 0; y--) {
    const p = { x: x + .5, y, z: z + .5 };
    if (standable(world, p) && ![5, 6].includes(world.get(x, y - 1, z))) return p;
  }
}

/** Tick a task (and any `also` parts) with the simulation until it has a result or the limit. */
export function runTask(room, task, { limit = 60 * 120, also = [] } = {}) {
  for (let i = 0; i < limit && !task.result; i++) {
    task.tick(1 / 60);
    for (const part of also) part.tick(1 / 60);
    room.simulation.tick(1 / 60);
  }
  return task.result;
}

// --- Companions -------------------------------------------------------------

/** A Companion whose model call throws unless scripted, so a test can never spawn uv/CopeNet. */
export function companion(room, key = 'codex', overrides = {}) {
  const c = new Companion(room, ROOT, { ...PERSONAS[key], ...overrides });
  c.think = async () => { throw Error('no model calls in tests: script this companion with scriptModel'); };
  return c;
}

/**
 * Script a companion's model. replies: a string (every turn), an array (one per turn, the last
 * repeats) or (payload, turn) => string | Promise<string>. With `observation`, observe() returns it
 * instead of reading the room. Returns { payloads }: every payload the model would have seen.
 */
export function scriptModel(c, replies, { observation } = {}) {
  const payloads = [];
  const answer = typeof replies === 'function' ? replies
    : Array.isArray(replies) ? (_, i) => replies[Math.min(i, replies.length - 1)] : () => replies;
  c.think = async payload => { payloads.push(payload); return answer(payload, payloads.length - 1); };
  if (observation) c.observe = async () => ({ observation, image: null });
  return { payloads };
}

/** Tick parts and the simulation on a real 1 ms interval (Companion.runTask polls with timers). */
export function drive(t, room, ...parts) {
  const timer = setInterval(() => { for (const part of parts) part.tick(1 / 60); room.simulation.tick(1 / 60); }, 1);
  const stop = () => clearInterval(timer);
  t.after(stop);
  return stop;
}

/** Yield to the event loop until predicate() holds; throws after maxTurns setImmediate turns. */
export async function until(predicate, { maxTurns = 1000, label = 'condition' } = {}) {
  for (let i = 0; i < maxTurns; i++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  if (!predicate()) throw Error(`Timed out waiting for ${label}`);
}

// --- Real server process ----------------------------------------------------

// Shell settings that would change how a test server behaves.
const DROPPED_ENV = ['SKY_REQUIRE_INVITE', 'HOST', 'SKY_FOLLOW_UPS', 'COPENET_PATH', 'SKY_DATA_DIR', 'PORT'];

/**
 * Spawn `node server/index.js --sky-test` on a free port with a temp SKY_DATA_DIR and a clean env.
 * The --sky-test argument does nothing; it tells an orphaned test server apart from the live one in
 * `ps`. Fails fast if the server exits or does not print its port within `timeout` ms. After the
 * test: sockets are terminated, the child gets SIGTERM by PID and the directory is removed.
 */
export async function startServer(t, { env = {}, requireInvite = false, timeout = 10000 } = {}) {
  const dir = mkdtempSync(joinPath(tmpdir(), 'sky-server-')), clean = { ...process.env };
  for (const key of DROPPED_ENV) delete clean[key];
  const child = spawn(process.execPath, ['server/index.js', '--sky-test'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...clean, ...(requireInvite ? { SKY_REQUIRE_INVITE: '1' } : {}), ...env, PORT: '0', SKY_DATA_DIR: dir },
  });
  const sockets = [];
  let stderr = '';
  child.stderr.on('data', b => { stderr = (stderr + b).slice(-4000); });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    return exited;
  };
  t.after(async () => {
    for (const s of sockets) s.terminate();
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => fail(Error(`Test server did not start within ${timeout} ms\n${stderr}`)), timeout);
    const fail = error => { clearTimeout(timer); child.stdout.off('data', onData); reject(error); };
    const onData = b => {
      out += b;
      const line = out.split('\n').find(l => l.includes(' on {'));
      if (!line) return;
      clearTimeout(timer); child.stdout.off('data', onData);
      try { resolve(JSON.parse(line.slice(line.indexOf(' on {') + 4)).port); } catch (error) { reject(error); }
    };
    child.stdout.on('data', onData);
    child.once('error', fail);
    exited.then(({ code, signal }) => fail(Error(`Test server exited (${code ?? signal}) before listening\n${stderr}`)));
  });
  const url = `ws://127.0.0.1:${port}/world`;
  /** An open WebSocket with a same-origin Origin header unless `origin` is given. */
  const open = async ({ origin = `http://127.0.0.1:${port}`, ms = 5000 } = {}) => {
    const s = new WebSocket(url, { origin });
    sockets.push(s);
    s.on('error', () => {});
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('WebSocket did not open')), ms);
      s.once('open', () => { clearTimeout(timer); resolve(); });
      s.once('close', () => { clearTimeout(timer); reject(Error('WebSocket closed before opening')); });
    });
    return s;
  };
  return { port, dir, child, url, open, next, closed, stop, get stderr() { return stderr; } };
}

/**
 * The next message of `type` on a ws WebSocket (that also satisfies `where`, if given); the
 * listener is removed on timeout too. Use `where` for state broadcasts: one already in flight
 * when the test acts can arrive before the one that shows the effect.
 */
export function next(socket, type, { ms = 5000, where = () => true } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', listener); reject(Error(`Missing ${type}`)); }, ms);
    function listener(raw) {
      const m = JSON.parse(raw);
      if (m.type !== type || !where(m)) return;
      clearTimeout(timer); socket.off('message', listener); resolve(m);
    }
    socket.on('message', listener);
  });
}

/** The close code and reason of a ws WebSocket. */
export function closed(socket, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('WebSocket did not close')), ms);
    socket.once('close', (code, reason) => { clearTimeout(timer); resolve({ code, reason: String(reason) }); });
  });
}

// --- DOM-like globals -------------------------------------------------------

/** Set globalThis keys for this test; the originals (or their absence) come back after it. */
export function stubGlobals(t, values) {
  const saved = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true, enumerable: true });
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}

/** An in-memory localStorage; `map` is the backing store. blocked makes every call throw. */
export function memoryStorage(entries = {}, { blocked = false } = {}) {
  const map = new Map(Object.entries(entries));
  const guard = () => { if (blocked) throw new DOMException('The operation is insecure.', 'SecurityError'); };
  return {
    map,
    getItem: key => { guard(); return map.has(key) ? map.get(key) : null; },
    setItem: (key, value) => { guard(); map.set(key, String(value)); },
    removeItem: key => { guard(); map.delete(key); },
    clear: () => { guard(); map.clear(); },
  };
}

/** A small element: events, style, classes, attributes and a child list. Queries find nothing. */
export class FakeElement extends EventTarget {
  #classes = new Set();
  constructor(rect = { left: 0, top: 0, width: 0, height: 0 }, tagName = 'DIV') {
    super();
    this.rect = rect; this.tagName = tagName.toUpperCase();
    this.style = {}; this.dataset = {}; this.attributes = new Map();
    this.children = []; this.parentNode = null; this.textContent = '';
    const classes = this.#classes;
    this.classList = {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      contains: name => classes.has(name),
      toggle: (name, force = !classes.has(name)) => { if (force) classes.add(name); else classes.delete(name); return force; },
    };
  }
  get className() { return [...this.#classes].join(' '); }
  set className(value) { this.#classes.clear(); this.classList.add(...String(value).split(/\s+/).filter(Boolean)); }
  focus() {} blur() {} setPointerCapture() {} releasePointerCapture() {}
  getBoundingClientRect() { return this.rect; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...nodes) { for (const node of nodes) { node.parentNode?.children.splice(node.parentNode.children.indexOf(node), 1); node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  get firstElementChild() { return this.children[0] ?? null; }
  get lastElementChild() { return this.children.at(-1) ?? null; }
}

/** Dispatch an event with fields set on it (pointerId, clientX, button, target…); returns it. */
export function fire(target, type, fields = {}) {
  const event = new Event(type, { cancelable: true, bubbles: true });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value, configurable: true });
  target.dispatchEvent(event);
  return event;
}
