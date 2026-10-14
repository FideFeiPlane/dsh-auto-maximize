import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression tests for the macOS osascript template. These pin the shape of the
// script that was wrong in the field (the frame was read with "item 4 of
// fullFrame", which can never work because an NSRect bridges to AppleScript as
// a two-level list {{x, y}, {w, h}}).
const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const match = src.match(/const DARWIN_SCRIPT = `([\s\S]*?)`;/);
assert.ok(match, 'DARWIN_SCRIPT template found in src/index.js');
const script = match[1];

test('darwin: visible-frame geometry is the primary maximize path, zoom click only the remedy', () => {
  const geometryIdx = script.indexOf('set position of win');
  const zoomIdx = script.indexOf('AXZoomButton');
  assert.ok(geometryIdx !== -1, 'geometry set position present');
  assert.ok(zoomIdx !== -1, 'zoom button reference present');
  assert.ok(geometryIdx < zoomIdx, 'geometry runs before the zoom-click remedy');
  assert.match(script, /set size of win to \{visW, visH\}/);
  assert.match(script, /return "maximized-bounds"/);
});

test('darwin: reads NSRect as {{x, y}, {w, h}} — no broken "item 4 of fullFrame"', () => {
  assert.ok(!script.includes('item 4 of fullFrame'), 'broken NSRect access must not return');
  assert.match(script, /set screenH to item 2 of item 2 of fullFrame/);
  assert.match(script, /set visX to item 1 of item 1 of visFrame/);
  assert.match(script, /set visY to item 2 of item 1 of visFrame/);
  assert.match(script, /set visW to item 1 of item 2 of visFrame/);
  assert.match(script, /set visH to item 2 of item 2 of visFrame/);
});

test('darwin: recognizes Accessibility permission errors (incl. -1719 and 辅助)', () => {
  assert.match(script, /-1719/);
  assert.match(script, /辅助/);
  assert.match(script, /return "perm: " & errMsg/);
});

test('darwin: positions the window at the visible frame top-left (bottom-left → top-left conversion)', () => {
  assert.match(script, /set position of win to \{visX, screenH - \(visY \+ visH\)\}/);
});
