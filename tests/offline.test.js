import test from 'node:test';
import assert from 'node:assert/strict';
import { Companion, PERSONAS, OFFLINE } from '../server/companion.js';
import { tempRoom } from './helpers.js';
test('without a model bridge the companion says it is offline instead of a raw spawn error', async t => {
  const room = tempRoom(t), before = process.env.COPENET_PATH;
  process.env.COPENET_PATH = '/nonexistent/model-bridge'; t.after(() => { if (before === undefined) delete process.env.COPENET_PATH; else process.env.COPENET_PATH = before; });
  const agent = new Companion(room, new URL('../', import.meta.url).pathname, { ...PERSONAS.claude, resident: false });
  await assert.rejects(agent.think({ why: 'reply' }), { message: OFFLINE });
  assert.equal(agent.thinking, false, 'the thinking line still closes');
});
