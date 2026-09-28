import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { FakeElement, stubGlobals, memoryStorage } from './helpers.js';

// src/chat.js imports its stylesheet; Vite handles that, Node needs an empty module for it.
registerHooks({ load: (url, context, nextLoad) => url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : nextLoad(url, context) });
const { createChat } = await import('../src/chat.js');

// Just enough DOM for createChat: each selector finds one element, made on first use, and
// innerHTML is ignored. The chat log is a real child list, so folding can be read off it.
class El extends FakeElement {
  #found = new Map();
  constructor(tag = 'div') { super(undefined, tag); this.hidden = false; this.value = ''; }
  set innerHTML(_) {}
  querySelector(selector) { if (!this.#found.has(selector)) this.#found.set(selector, new El()); return this.#found.get(selector); }
  querySelectorAll(selector) {
    if (selector !== '[data-agent]') return [];
    return this.buttons ??= ['codex', 'claude'].map(agent => Object.assign(new El('button'), { dataset: { agent } }));
  }
  get options() { return this.children; }
}

function chat(t, { history = [], stored = {} } = {}) {
  const storage = memoryStorage(stored), app = new El(), body = new El('body');
  stubGlobals(t, {
    document: { createElement: tag => new El(tag), querySelector: () => app, body, pointerLockElement: null },
    localStorage: storage, addEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 1024, innerHeight: 768,
    Option: class { constructor(label, value, defaultSelected, selected) { Object.assign(this, { label, value, selected }); } },
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent = [], network = { chat: history, modes: [], agents: {}, entity: { id: 'me' }, connected: true, onStatus() {}, on() {}, send: (type, payload) => sent.push({ type, ...payload }) };
  const ui = createChat(network, new El('canvas'), () => {});
  const panel = app.children[0], log = panel.querySelector('.chat-log');
  const button = agent => panel.querySelectorAll('[data-agent]').find(b => b.dataset.agent === agent);
  return { ui, network, panel, log, storage, sent, button, unread: () => panel.querySelector('.chat-unread').textContent };
}
let id = 0;
const entry = (kind, text, name = 'World', more = {}) => ({ id: `e${++id}`, kind, name, text, ...more });
// Each log row as [kind of row, what it shows]; a folded activity row shows its latest step and count.
const rows = log => log.children.map(row => row.tagName === 'DETAILS'
  ? ['activity', row.querySelector('summary span').textContent, row.querySelector('summary em').textContent, row.querySelector('ol').children.map(li => li.textContent)]
  : [row.className.split(' ').slice(1).filter(c => !['fresh', 'fading'].includes(c)).join(' '), row.textContent || row.children.map(c => c.textContent).join(': ')]);

test('World receipts in a row fold into one activity line; queue notes fold too; a failure breaks the run as a warning', t => {
  const { network, log } = chat(t);
  network.onChat(entry('user', 'Claude, get wood', 'Player', { entityId: 'someone' }));
  network.onChat(entry('action', 'Confirmed: Walked to the grove'));
  network.onChat(entry('action', 'Chopped 2 wood'));
  network.onChat(entry('system', 'Claude will answer after this job.'));
  network.onChat(entry('system', 'Your queued message was replaced by the latest one.'));
  network.onChat(entry('system', 'I cannot find a safe walking route there.'));
  network.onChat(entry('action', 'Walked home'));
  network.onChat(entry('assistant', 'Here is your wood!', 'Claude'));
  network.onChat(entry('action', 'Gave 2 wood'));
  assert.deepEqual(rows(log), [
    ['user', 'Player: Claude, get wood'],
    ['activity', 'Your queued message was replaced by the latest one.', '4 steps', ['Walked to the grove', 'Chopped 2 wood', 'Claude will answer after this job.', 'Your queued message was replaced by the latest one.']],
    ['activity warn', 'I cannot find a safe walking route there.'],
    ['activity', 'Walked home', '', ['Walked home']],
    ['assistant agent-claude', 'Claude: Here is your wood!'],
    ['activity', 'Gave 2 wood', '', ['Gave 2 wood']],
  ]);
});

test('the log drops repeats and legacy intros, calls this browser You, and keeps 100 rows', t => {
  const { network, log } = chat(t), hello = entry('user', 'hello', 'Player', { entityId: 'me' });
  network.onChat(hello); network.onChat(hello);
  network.onChat(entry('system', 'Claude · can talk, mine, build; every action is checked by the server.'));
  assert.deepEqual(rows(log), [['user', 'You: hello']]);
  for (let i = 0; i < 105; i++) network.onChat(entry('user', `m${i}`, 'Player'));
  assert.equal(log.children.length, 100);
  assert.deepEqual(rows(log).at(-1), ['user', 'Player: m104']);
});

test('only live companion replies count as unread; history on (re)connect does not', t => {
  const { network, unread } = chat(t, { history: [entry('assistant', 'old reply', 'Codex')] });
  network.onChatHistory([entry('assistant', 'reconnect history', 'Claude')]);
  network.onChat(entry('user', 'hi', 'Player'));
  network.onChat(entry('action', 'Walked'));
  assert.equal(unread(), '');
  network.onChat(entry('assistant', 'live', 'Claude'));
  network.onChat(entry('assistant', 'again', 'Codex'));
  assert.equal(unread(), '(2)');
});

test('lit companions: the old single-agent key migrates, taps toggle, the last lit one stays lit', t => {
  const { panel, storage, button, sent, network } = chat(t, { stored: { 'sky:chat-agent': 'codex' } });
  assert.equal(panel.dataset.agent, 'codex', 'the pre-multi-select choice is kept');
  button('claude').onclick();
  assert.equal(panel.dataset.agent, 'both');
  assert.equal(storage.map.get('sky:chat-agents'), '["codex","claude"]');
  panel.querySelector('.chat-come').onclick();
  assert.deepEqual(sent.at(-1), { type: 'chat-send', text: 'Codex and Claude, come here.', mode: 'talk', agent: 'codex', agents: ['codex', 'claude'] });
  button('codex').onclick(); button('claude').onclick();
  assert.equal(storage.map.get('sky:chat-agents'), '["claude"]', 'the last lit companion cannot be switched off');
  assert.equal(button('claude').getAttribute('aria-checked'), 'true');
  network.connected = false; network.onChatStatus();
  assert.equal(panel.querySelector('input').placeholder, 'Reconnecting…');
});

test('closed, new lines show for 8–10 s and fade (longer lines stay longer); history never flashes', t => {
  const { network, log } = chat(t, { history: [entry('assistant', 'old reply', 'Codex')] });
  const fresh = () => log.children.filter(r => r.classList.contains('fresh')).map(r => r.textContent || r.children.map(c => c.textContent).join(': '));
  assert.deepEqual(fresh(), [], 'history is not news');
  network.onChat(entry('assistant', 'hi', 'Claude'));
  network.onChat(entry('assistant', 'x'.repeat(200), 'Codex'));
  assert.equal(fresh().length, 2);
  t.mock.timers.tick(8100);
  assert.deepEqual(fresh(), [`Codex: ${'x'.repeat(200)}`], 'a short line is gone after about 8 s, a long one stays');
  t.mock.timers.tick(2000);
  assert.deepEqual(fresh(), []);
  for (let i = 0; i < 9; i++) network.onChat(entry('user', `m${i}`, 'Player'));
  assert.equal(fresh().length, 6, 'at most six lines at once');
});

test('every model call shows as a line: live while thinking, then how long it took', t => {
  const { network, log } = chat(t);
  const lines = () => log.children.filter(r => r.classList.contains('thinking')).map(r => [r.classList.contains('done'), r.querySelector('span').textContent]);
  network.onChatStatus({ agent: 'claude', busy: true, thinking: true, why: 'reflect' });
  network.onChatStatus({ agent: 'claude', busy: true, thinking: true, why: 'reflect' });
  assert.deepEqual(lines(), [[false, 'Claude is reflecting…']], 'one line per call');
  network.onChatStatus({ agent: 'claude', busy: false, thinking: false });
  assert.match(lines()[0][1], /^Claude reflected · model call \d+\.\d s$/);
  // Older servers: the status text says "thinking"; the reply ends the call.
  network.onChatStatus({ agent: 'codex', busy: true, text: 'Codex is thinking…' });
  assert.deepEqual(lines().at(-1), [false, 'Codex is thinking…']);
  network.onChat(entry('assistant', 'Sure!', 'Codex'));
  assert.equal(lines().at(-1)[0], true);
});
