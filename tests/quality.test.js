import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTier, detectQuality, shadowSchedule, TIERS, QUALITY_KEY } from '../src/quality.js';

test('touch-first, small or low-memory devices get the phone tier; desktops keep high', () => {
  assert.equal(chooseTier({ coarsePointer: false, screenWidth: 1512, screenHeight: 982, deviceMemory: 8 }), 'high');
  assert.equal(chooseTier({ coarsePointer: true, screenWidth: 1512, screenHeight: 982 }), 'phone');
  assert.equal(chooseTier({ screenWidth: 390, screenHeight: 844 }), 'phone');
  assert.equal(chooseTier({ screenWidth: 1920, screenHeight: 1080, deviceMemory: 2 }), 'phone');
  // Safari does not report deviceMemory; that alone never demotes a desktop.
  assert.equal(chooseTier({ screenWidth: 1920, screenHeight: 1080 }), 'high');
});

test('the sky:quality override wins, and anything else in it is ignored', () => {
  assert.equal(chooseTier({ override: 'high', coarsePointer: true, screenWidth: 390, screenHeight: 844 }), 'high');
  assert.equal(chooseTier({ override: 'phone', screenWidth: 1920, screenHeight: 1080 }), 'phone');
  assert.equal(chooseTier({ override: 'ultra', screenWidth: 1920, screenHeight: 1080 }), 'high');
});

test('detectQuality reads the browser and survives blocked storage', () => {
  const phone = {
    localStorage: { getItem() { throw new Error('blocked'); } },
    matchMedia: query => ({ matches: query === '(pointer: coarse)' }),
    screen: { width: 390, height: 844 }, navigator: {},
  };
  assert.equal(detectQuality(phone), TIERS.phone);
  const forced = { ...phone, localStorage: { getItem: key => key === QUALITY_KEY ? 'high' : null } };
  assert.equal(detectQuality(forced), TIERS.high);
  assert.equal(detectQuality({}), TIERS.high);
});

test('phones render lighter than desktops on every axis', () => {
  const { high, phone } = TIERS;
  assert.equal(high.antialias, true); assert.equal(phone.antialias, false);
  assert.ok(phone.pixelRatio >= 1.25 && phone.pixelRatio <= 1.5 && high.pixelRatio === 2);
  assert.ok(phone.shadowMapSize < high.shadowMapSize);
  assert.ok(phone.lights < high.lights);
  assert.equal(high.shadowInterval, 0, 'desktop shadows redraw every frame');
  assert.ok(phone.shadowInterval > 0);
});

test('a cached shadow map redraws on request, after the view moves 2 blocks, or at a low rate while someone moves', () => {
  const shadows = shadowSchedule({ interval: .1, step: 2 }), at = (x, y = 20, z = 30) => ({ x, y, z });
  assert.equal(shadows.tick(1 / 60, at(30)), true, 'the first frame draws the map');
  assert.equal(shadows.tick(1 / 60, at(30)), false, 'nothing changed');
  assert.equal(shadows.tick(1 / 60, at(31.5)), false, 'a small pan keeps the map');
  assert.equal(shadows.tick(1 / 60, at(32.5)), true, 'past 2 blocks it redraws');
  shadows.request();
  assert.equal(shadows.tick(1 / 60, at(32.5)), true, 'a terrain change redraws');
  let draws = 0;
  for (let i = 0; i < 60; i++) if (shadows.tick(1 / 60, at(32.5), true)) draws++;
  assert.ok(draws >= 9 && draws <= 10, `moving characters redraw about 10 times a second, not 60 (${draws})`);
  assert.equal(shadows.tick(1, at(32.5), false), false, 'still characters never redraw');
});
