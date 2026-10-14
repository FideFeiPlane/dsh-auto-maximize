import { test } from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../src/index.js');

/** A minimal Cordis-like ctx: records effects but never runs them. */
function mockCtx() {
  const log = [];
  const ctx = {
    effect: (fn, tag) => { ctx._effects.push({ fn, tag }); },
    logger: {
      info: (msg) => log.push(['info', msg]),
      warn: (msg) => log.push(['warn', msg]),
    },
    _effects: [],
  };
  return { ctx, log };
}

test('module exports the expected plugin id', () => {
  assert.equal(mod.name, 'auto-maximize');
  assert.equal(typeof mod.apply, 'function');
});

test('disabled config registers no effect and logs info', () => {
  const { ctx, log } = mockCtx();
  mod.apply(ctx, { enabled: false });
  assert.equal(ctx._effects.length, 0);
  assert.ok(log.some(([level, msg]) => level === 'info' && /disabled/.test(msg)));
});

test('default config registers exactly one effect', () => {
  const { ctx } = mockCtx();
  mod.apply(ctx, {});
  assert.equal(ctx._effects.length, 1);
  assert.equal(ctx._effects[0].tag, 'dsh-auto-maximize');
});
