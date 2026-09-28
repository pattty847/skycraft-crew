import test from 'node:test';
import assert from 'node:assert/strict';
import { AWAY_AFTER } from '../server/room.js';
import { Companion, PERSONAS } from '../server/companion.js';
import { tempRoom, fakeSocket } from './helpers.js';
test('a player is here while playing; island view, a hidden tab or five idle minutes is away', t => {
  const room = tempRoom(t), s = fakeSocket(); room.connect(s);
  assert.equal(room.present().length, 1, 'joining counts as here');
  room.receive(s, { type: 'presence', away: true }); assert.equal(room.present().length, 0, 'island view or a hidden tab');
  room.receive(s, { type: 'presence', away: false }); assert.equal(room.present().length, 1);
  const c = room.clients.get(s); c.active = Date.now() - AWAY_AFTER - 1;
  assert.equal(room.present().length, 0, 'five minutes without playing');
  room.receive(s, { type: 'input', frames: [{ sequence: 1, actions: [{ type: 'move', dir: { x: 0, y: 0, z: 0 } }] }] });
  assert.equal(room.present().length, 0, 'standing still is not playing');
  room.receive(s, { type: 'input', frames: [{ sequence: 2, actions: [{ type: 'move', dir: { x: 1, y: 0, z: 0 } }] }] });
  assert.equal(room.present().length, 1, 'walking is');
});
test('companions do not reflect, greet or look while everyone is away', t => {
  const room = tempRoom(t), s = fakeSocket(); room.connect(s);
  const agent = new Companion(room, new URL('../', import.meta.url).pathname, { ...PERSONAS.claude, resident: false });
  agent.reflect = async reason => { agent.seen = reason; };
  agent.lastReflect = 0; agent.hadHumans = true; agent.wasNight = false; room.phase = .24;
  room.receive(s, { type: 'presence', away: true });
  agent.considerReflecting(); assert.equal(agent.seen, undefined, 'nobody is really here');
  room.receive(s, { type: 'presence', away: false });
  agent.considerReflecting(); assert.equal(agent.seen, 'a quiet moment');
});
