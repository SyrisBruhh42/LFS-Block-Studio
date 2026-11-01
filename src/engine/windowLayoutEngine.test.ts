import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampWindowRectToViewport,
  computeResponsiveBarLayout,
  computeResponsiveWorkspaceMetrics,
  createCenteredWindowRect,
  dragPayloadToSlotItem,
  parseStudioDragPayload,
  resizeWindowRect,
  serializeStudioDragPayload,
} from './windowLayoutEngine';
import { DEFAULT_MODULAR_HUD_CONFIG } from './openSourceBlockMarket';

test('clampWindowRectToViewport keeps window inside shrunk viewport bounds', () => {
  const rect = {
    x: 900,
    y: 700,
    width: 650,
    height: 520,
    minWidth: 320,
    minHeight: 240,
  };

  const clamped = clampWindowRectToViewport(rect, 800, 600, false, 10);
  assert.ok(clamped.width <= 780);
  assert.ok(clamped.height <= 580);
  assert.ok(clamped.x >= 10);
  assert.ok(clamped.x + clamped.width <= 790);
  assert.ok(clamped.y >= 10);
  assert.ok(clamped.y + clamped.height <= 590);
});

test('resizeWindowRect resizes from southeast and northwest handles within bounds', () => {
  const start = createCenteredWindowRect(500, 400, 1280, 800, 300, 220);
  const grownSe = resizeWindowRect(start, 'se', 120, 80, 1280, 800);
  assert.equal(grownSe.width, 620);
  assert.equal(grownSe.height, 480);
  assert.equal(grownSe.x, start.x);
  assert.equal(grownSe.y, start.y);

  const shrunkNw = resizeWindowRect(start, 'nw', 100, 60, 1280, 800);
  assert.equal(shrunkNw.width, 400);
  assert.equal(shrunkNw.height, 340);
  assert.equal(shrunkNw.x, start.x + 100);
  assert.equal(shrunkNw.y, start.y + 60);
});

test('computeResponsiveWorkspaceMetrics preserves center 3D viewport on split-screen resize', () => {
  const desktop = computeResponsiveWorkspaceMetrics(1440, 900, true, 260, true, 340);
  assert.equal(desktop.effectiveLeftWidth, 260);
  assert.equal(desktop.effectiveRightWidth, 340);
  assert.equal(desktop.centerViewportWidth, 840);
  assert.equal(desktop.shouldStackBottomBars, true);

  const wide = computeResponsiveWorkspaceMetrics(1800, 1000, true, 240, true, 320);
  assert.equal(wide.centerViewportWidth, 1240);
  assert.equal(wide.shouldStackBottomBars, false);
});

test('computeResponsiveBarLayout prevents side bars from overflowing narrow viewports', () => {
  const mostUsedBar = DEFAULT_MODULAR_HUD_CONFIG.bars.find(
    (b) => b.id === 'bar_most_used'
  )!;
  const layout = computeResponsiveBarLayout(mostUsedBar, 640, 520, 0.85, true);
  assert.ok(layout.leftPx >= 60);
  assert.ok(layout.leftPx <= 580);
  assert.ok(layout.topPx >= 46);
  assert.ok(layout.topPx <= 500);
});

test('universal drag payload serializes and converts to ActionBarSlotItem', () => {
  const raw = serializeStudioDragPayload({
    type: 'block',
    targetId: 'cobble_brick',
    label: 'Cobble',
  });
  const parsed = parseStudioDragPayload(raw);
  assert.ok(parsed);
  assert.equal(parsed.type, 'block');
  assert.equal(parsed.targetId, 'cobble_brick');

  const slot = dragPayloadToSlotItem(parsed);
  assert.equal(slot.type, 'block');
  assert.equal(slot.targetId, 'cobble_brick');
});
