import test from 'node:test';
import assert from 'node:assert/strict';
import { Access } from '../server/access.js';
import { grant, GRANT_MAX } from '../server/admin.js';
import { B } from '../src/blocks.js';
import { tempRoom, fakeSocket as socket } from './helpers.js';
import { GIVE_REACH } from '../src/simulation.js';
import { GIVE_REACH as BAG_REACH } from '../src/give-panel.js';
test('the Bag offers giving at the same reach the server allows', () => assert.equal(BAG_REACH, GIVE_REACH));
test('only listed admins conjure items, for themselves or anyone present, within bounds', t => {
  const room = tempRoom(t, { prefix: 'sky-admin-' }), a = socket(), b = socket();
  const admin = room.connect(a), friend = room.connect(b);
  const access = new Access(room, { requireInvite: true, admins: ` ${admin.id} ,` });
  const lines = []; room.chat = { add: (kind, name, text) => lines.push({ kind, text }) };
  assert.equal(access.isAdmin(admin.id), true); assert.equal(access.isAdmin(friend.id), false);
  assert.throws(() => grant(room, access, friend, { blockId: B.PLANKS, count: 5 }), /Only island admins/);
  const before = friend.inventory[B.PLANKS];
  grant(room, access, admin, { targetId: friend.id, blockId: B.PLANKS, count: GRANT_MAX });
  assert.equal(friend.inventory[B.PLANKS], before + GRANT_MAX, 'items come from nowhere');
  assert.match(lines.at(-1).text, /received 64 Planks from Player .{4} \(admin grant\)/);
  const mine = admin.inventory[B.STONE]; grant(room, access, admin, { blockId: B.STONE, count: 3 });
  assert.equal(admin.inventory[B.STONE], mine + 3, 'no target means yourself');
  for (const bad of [{ blockId: 0, count: 1 }, { blockId: 999, count: 1 }, { blockId: B.PLANKS, count: 0 }, { blockId: B.PLANKS, count: GRANT_MAX + 1 }, { blockId: B.PLANKS, count: 1.5 }, { targetId: 'nobody', blockId: B.PLANKS, count: 1 }])
    assert.throws(() => grant(room, access, admin, bad));
  access.markGuest(admin.id);
  assert.equal(access.isAdmin(admin.id), false, 'a guest is never an admin');
  assert.equal(new Access(tempRoom(t, { prefix: 'sky-admin-' }), { admins: '' }).admins.size, 0, 'nobody is an admin by default');
});

test('creative mode: only admins; any block breaks in 0.15 s and placing keeps the stack', async t => {
  const { setCreative } = await import('../server/admin.js');
  const room = tempRoom(t, { prefix: 'sky-admin-' }), a = socket(), b = socket();
  const admin = room.connect(a), friend = room.connect(b);
  const access = new Access(room, { admins: admin.id });
  assert.throws(() => setCreative(room, access, friend, true), /Only island admins/);
  assert.equal(setCreative(room, access, admin, true), true);
  const sim = room.simulation, p = admin.position, below = { x: Math.floor(p.x), y: Math.floor(p.y) - 1, z: Math.floor(p.z) };
  const id = room.world.get(below.x, below.y, below.z); assert.ok(id, 'standing on a block');
  sim.blockAccess = () => ({ ok: true }); sim.canEdit = () => true;
  sim.mine(admin, below, .1); assert.equal(room.world.get(below.x, below.y, below.z), id, 'not yet');
  sim.mine(admin, below, .1); assert.equal(room.world.get(below.x, below.y, below.z), 0, 'broken in 0.2 s');
  admin.inventory[B.PLANKS] = 1; admin.position = { x: below.x + .5, y: below.y + 3, z: below.z + .5 };
  assert.equal(sim.place(admin, below, B.PLANKS), true); assert.equal(admin.inventory[B.PLANKS], 1, 'the stack is kept');
  setCreative(room, access, admin, false); assert.equal(admin.creative, false);
});
