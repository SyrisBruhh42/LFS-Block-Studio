import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHudPercentSnapSystem,
  applyWindowSnapSystem,
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

test('applyWindowSnapSystem supports both Free 1px mode and Magnetic Edge/Center/16px Grid Snap mode', () => {
  const raw = {
    x: 17,
    y: 49,
    width: 480,
    height: 360,
    minWidth: 320,
    minHeight: 240,
  };

  // Free mode preserves exact 1px coordinates
  const freeRes = applyWindowSnapSystem(raw, 1200, 800, 'free', false, 16, 8);
  assert.equal(freeRes.rect.x, 17);
  assert.equal(freeRes.rect.y, 49);
  assert.equal(freeRes.verticalGuidePx, null);
  assert.equal(freeRes.horizontalGuidePx, null);

  // Snap mode magnetically snaps to Left Edge (8px) and Top Dock (44px) when within 14px threshold
  const edgeSnap = applyWindowSnapSystem(raw, 1200, 800, 'snap', false, 16, 8);
  assert.equal(edgeSnap.rect.x, 8);
  assert.equal(edgeSnap.rect.y, 44);
  assert.equal(edgeSnap.verticalGuidePx, 8);
  assert.equal(edgeSnap.horizontalGuidePx, 44);

  // Snap mode snaps arbitrary interior coordinates to 16px studio grid
  const interiorSnap = applyWindowSnapSystem(
    { ...raw, x: 133, y: 171 },
    1200,
    800,
    'snap',
    false,
    16,
    8
  );
  assert.equal(interiorSnap.rect.x % 16, 0);
  assert.equal(interiorSnap.rect.y % 16, 0);
});

test('applyHudPercentSnapSystem snaps to center/docks in snap mode and allows 0.1% precision in free mode', () => {
  const freeHud = applyHudPercentSnapSystem(48.7, 33.4, 'free', 2);
  assert.equal(freeHud.xPercent, 48.7);
  assert.equal(freeHud.yPercent, 33.4);

  const centerSnapHud = applyHudPercentSnapSystem(48.7, 90.2, 'snap', 2);
  assert.equal(centerSnapHud.xPercent, 50);
  assert.equal(centerSnapHud.yPercent, 91);
  assert.equal(centerSnapHud.verticalGuidePercent, 50);
  assert.equal(centerSnapHud.horizontalGuidePercent, 91);
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

test('computeResponsiveBarLayout prevents overlap at 520px split-screen and preserves custom user-dragged positions', () => {
  const primaryBar = DEFAULT_MODULAR_HUD_CONFIG.bars.find(
    (b) => b.id === 'bar_primary_blocks'
  )!;
  const toolsBar = DEFAULT_MODULAR_HUD_CONFIG.bars.find(
    (b) => b.id === 'bar_tools_macros'
  )!;

  const pLayout = computeResponsiveBarLayout(primaryBar, 520, 640, 0.78, true);
  const tLayout = computeResponsiveBarLayout(toolsBar, 520, 640, 0.78, true);
  assert.ok(
    pLayout.topPx - tLayout.topPx >= 64,
    'Primary hotbar and Quick Tools hotbar must not overlap vertically'
  );

  // Moving and locking a bar at a custom position (e.g. 28%, 34%) must preserve that position
  const customDraggedBar = {
    ...toolsBar,
    locked: true,
    position: { xPercent: 28, yPercent: 34 },
  };
  const customLayout = computeResponsiveBarLayout(
    customDraggedBar,
    520,
    640,
    0.78,
    true
  );
  assert.ok(customLayout.topPx < 300);
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
