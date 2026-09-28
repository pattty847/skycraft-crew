import test from 'node:test';
import assert from 'node:assert/strict';
import { B } from '../src/blocks.js';
import { tempRoom, join } from './helpers.js';

test('Room.receive allows 100 messages per broadcast window, refuses the 101st, and resets on broadcast', t => {
  const room = tempRoom(t), { socket } = join(room);
  for (let i = 0; i < 100; i++) room.receive(socket, { type: 'day' });
  assert.throws(() => room.receive(socket, { type: 'day' }), /Too many messages/);
  const phase = room.phase;
  assert.throws(() => room.receive(socket, { type: 'day' }), /Too many messages/);
  assert.equal(room.phase, phase, 'a refused message has no effect');
  room.broadcast();
  assert.doesNotThrow(() => room.receive(socket, { type: 'day' }), 'the next window starts fresh');
  assert.notEqual(room.phase, phase);
  const other = join(room);
  assert.doesNotThrow(() => room.receive(other.socket, { type: 'day' }), 'the budget is per socket');
});

test('craft-material takes the recipe key the Bag sends, before blockId, and refuses unknown keys', t => {
  const room = tempRoom(t), { socket, entity } = join(room), inv = entity.inventory;
  inv.fill(0); inv[B.WOOD] = 1;
  room.receive(socket, { type: 'craft-material', recipe: 'planks' });
  assert.equal(inv[B.PLANKS], 4); assert.equal(inv[B.WOOD], 0);
  assert.match(socket.last('notice').text, /Crafted 4 planks/);
  room.receive(socket, { type: 'craft-material', recipe: 'sticks', blockId: B.CLAY });
  assert.equal(inv[B.STICK], 4, 'recipe wins over blockId'); assert.equal(inv[B.PLANKS], 2); assert.equal(inv[B.CLAY], 0);
  inv[B.DIRT] = 2; inv[B.SAND] = 1;
  room.receive(socket, { type: 'craft-material', recipe: String(B.CLAY) });
  assert.equal(inv[B.CLAY], 4, 'block-keyed recipes work as strings, as the Bag sends them');
  const before = inv.slice();
  for (const recipe of ['__proto__', 'constructor', 'toString', 'diamonds']) {
    room.receive(socket, { type: 'craft-material', recipe });
    assert.equal(socket.last('notice').text, 'Unknown recipe.', recipe);
  }
  room.receive(socket, { type: 'craft-material', recipe: 'table' });
  assert.match(socket.last('notice').text, /Need 2 planks/, 'a short recipe says what is missing');
  assert.deepEqual(inv, before, 'refusals change nothing');
});

test('a second tab with the same pass closes the first (4001) and keeps one entity', t => {
  const room = tempRoom(t), first = join(room), second = join(room, { token: first.token });
  assert.deepEqual(first.socket.closed, { code: 4001, reason: 'Opened in another tab' });
  assert.equal(second.entity.id, first.entity.id);
  assert.equal(room.clients.size, 1);
  assert.equal([...room.simulation.entities.keys()].filter(id => id === first.entity.id).length, 1);
});

// Room.connect reads the saved player before it displaces the open tab, so the new tab gets the
// last save (up to 5 s old), not the live entity. A fast reconnect that beats the old socket's
// close hits the same path.
test('a second tab keeps the live inventory of the tab it replaces', t => {
  const room = tempRoom(t), first = join(room);
  first.entity.inventory[B.PLANKS] = 28;
  const second = join(room, { token: first.token });
  assert.equal(second.entity.inventory[B.PLANKS], 28);
});
