import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer, next } from './helpers.js';

// A raw GET: fetch() and URL normalise dot segments, and these tests need the path exactly as sent.
const get = (port, path) => new Promise((resolve, reject) => {
  request({ host: '127.0.0.1', port, path }, res => {
    let body = '';
    res.on('data', b => { body += b; });
    res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
  }).on('error', reject).end();
});

test('static files never leave dist/: encoded traversal is 403, the rest is 404', async t => {
  const { port } = await startServer(t);
  for (const path of ['/..%2fpackage.json', '/%2e%2e%2fpackage.json', '/..%2f..%2f..%2fetc%2fpasswd', '/assets/..%2f..%2fserver%2findex.js']) {
    const res = await get(port, path);
    assert.equal(res.status, 403, path);
    assert.equal(res.body, '', path);
  }
  // Plain and %2e dot segments are resolved by the URL parser before the file lookup.
  for (const path of ['/../package.json', '/%2e%2e/package.json', '/no-such-file.js', '/%E0%A4%A']) {
    const res = await get(port, path);
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(res.body, /"name"|import /, `${path} serves nothing from outside dist/`);
  }
});

test('/health reports ok, the player count and the world revision', async t => {
  const { port, open } = await startServer(t);
  const health = async () => { const res = await get(port, '/health'); assert.equal(res.status, 200); assert.equal(res.type, 'application/json'); return JSON.parse(res.body); };
  const empty = await health();
  assert.equal(empty.ok, true); assert.equal(empty.players, 0); assert.ok(Number.isInteger(empty.revision));
  const player = await open(), welcome = next(player, 'welcome');
  player.send(JSON.stringify({ type: 'join' }));
  await welcome;
  assert.equal((await health()).players, 1);
});
