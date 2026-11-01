import { ActionBarSlotItem, ModularActionBar } from './types';

export type ResizeHandleDirection =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw';

export type StudioSnapMode = 'snap' | 'free';

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

export interface WindowSnapResult {
  rect: WindowRect;
  verticalGuidePx: number | null;
  horizontalGuidePx: number | null;
  snapBadge: string;
}

export interface HudPercentSnapResult {
  xPercent: number;
  yPercent: number;
  verticalGuidePercent: number | null;
  horizontalGuidePercent: number | null;
  snapBadge: string;
}

export interface StudioWindowState extends WindowRect {
  id: string;
  isMinimized: boolean;
  isMaximized: boolean;
  /** When true, modal windows float without a blocking backdrop so 3D viewport remains interactive */
  isPinnedFloating: boolean;
  zIndex: number;
}

export interface UniversalDragPayload {
  type: 'block' | 'tool' | 'command' | 'macro_loop';
  targetId: string;
  label?: string;
  color?: string;
  sourceBarId?: string;
  sourceSlotIdx?: number;
}

export const STUDIO_DRAG_MIME = 'application/x-lfs-studio-item';
export const STUDIO_SNAP_MODE_STORAGE_KEY = 'lfs_studio_snap_mode_v1';
export const STUDIO_SNAP_MODE_CHANGE_EVENT = 'lfs:snap-mode-change';

export function getGlobalStudioSnapMode(): StudioSnapMode {
  if (typeof window === 'undefined') return 'snap';
  try {
    const raw = localStorage.getItem(STUDIO_SNAP_MODE_STORAGE_KEY);
    if (raw === 'free' || raw === 'snap') return raw;
  } catch {
    // Ignore
  }
  return 'snap';
}

export function setGlobalStudioSnapMode(mode: StudioSnapMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STUDIO_SNAP_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore
  }
  window.dispatchEvent(
    new CustomEvent(STUDIO_SNAP_MODE_CHANGE_EVENT, { detail: mode })
  );
}

export function serializeStudioDragPayload(
  payload: UniversalDragPayload
): string {
  return JSON.stringify(payload);
}

export function parseStudioDragPayload(
  raw: string | null | undefined
): UniversalDragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.targetId === 'string' &&
      (parsed.type === 'block' ||
        parsed.type === 'tool' ||
        parsed.type === 'command' ||
        parsed.type === 'macro_loop')
    ) {
      return parsed as UniversalDragPayload;
    }
  } catch {
    // Ignore malformed payload
  }
  return null;
}

export function dragPayloadToSlotItem(
  payload: UniversalDragPayload
): ActionBarSlotItem {
  return {
    id: `slot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: payload.type,
    targetId: payload.targetId,
    label: payload.label,
  };
}

/**
 * Clamps a floating window rectangle so it never overflows or gets lost off-screen
 * when the browser window is resized down or rotated.
 */
export function clampWindowRectToViewport(
  rect: WindowRect,
  viewportWidth: number,
  viewportHeight: number,
  isMinimized = false,
  safeMargin = 8
): WindowRect {
  const vw = Math.max(320, viewportWidth);
  const vh = Math.max(320, viewportHeight);
  const topSafeMargin = vh >= 520 ? Math.max(safeMargin, 44) : safeMargin;

  const maxAllowedW = Math.max(240, vw - safeMargin * 2);
  const maxAllowedH = Math.max(180, vh - topSafeMargin - safeMargin);

  const effectiveMinW = Math.min(rect.minWidth, maxAllowedW);
  const effectiveMinH = Math.min(rect.minHeight, maxAllowedH);

  const width = Math.max(effectiveMinW, Math.min(maxAllowedW, rect.width));
  const height = Math.max(effectiveMinH, Math.min(maxAllowedH, rect.height));

  const visibleHeight = isMinimized ? 40 : height;

  const minX = safeMargin;
  const maxX = Math.max(safeMargin, vw - width - safeMargin);
  const minY = topSafeMargin;
  const maxY = Math.max(topSafeMargin, vh - visibleHeight - safeMargin);

  const x = Math.round(Math.max(minX, Math.min(maxX, rect.x)));
  const y = Math.round(Math.max(minY, Math.min(maxY, rect.y)));

  return {
    ...rect,
    x,
    y,
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * Applies either 1px Free Positioning or Magnetic 16px Grid + Edge/Center Snapping
 * when dragging floating windows around the studio workspace.
 */
export function applyWindowSnapSystem(
  rawRect: WindowRect,
  viewportWidth: number,
  viewportHeight: number,
  snapMode: StudioSnapMode = 'snap',
  isMinimized = false,
  gridStepPx = 16,
  safeMargin = 8
): WindowSnapResult {
  const clamped = clampWindowRectToViewport(
    rawRect,
    viewportWidth,
    viewportHeight,
    isMinimized,
    safeMargin
  );

  if (snapMode === 'free') {
    return {
      rect: clamped,
      verticalGuidePx: null,
      horizontalGuidePx: null,
      snapBadge: `Free (${clamped.x}, ${clamped.y})`,
    };
  }

  const vw = Math.max(320, viewportWidth);
  const vh = Math.max(320, viewportHeight);
  const topSafe = vh >= 520 ? Math.max(safeMargin, 44) : safeMargin;
  const bottomSafe = 44;
  const visibleH = isMinimized ? 40 : clamped.height;

  const magnetThreshold = 14;
  let x = clamped.x;
  let y = clamped.y;
  let verticalGuidePx: number | null = null;
  let horizontalGuidePx: number | null = null;
  const snapReasons: string[] = [];

  const centerX = Math.round((vw - clamped.width) / 2);
  const rightEdgeX = vw - clamped.width - safeMargin;

  if (Math.abs(x - safeMargin) <= magnetThreshold) {
    x = safeMargin;
    verticalGuidePx = safeMargin;
    snapReasons.push('Left Edge');
  } else if (Math.abs(x - rightEdgeX) <= magnetThreshold) {
    x = rightEdgeX;
    verticalGuidePx = vw - safeMargin;
    snapReasons.push('Right Edge');
  } else if (Math.abs(x - centerX) <= magnetThreshold) {
    x = centerX;
    verticalGuidePx = Math.round(vw / 2);
    snapReasons.push('Center X');
  } else if (gridStepPx > 1) {
    x = Math.round(x / gridStepPx) * gridStepPx;
  }

  const centerY = Math.round(
    topSafe + (vh - topSafe - bottomSafe - visibleH) / 2
  );
  const bottomEdgeY = Math.max(topSafe, vh - visibleH - bottomSafe);

  if (Math.abs(y - topSafe) <= magnetThreshold) {
    y = topSafe;
    horizontalGuidePx = topSafe;
    snapReasons.push('Top Dock');
  } else if (Math.abs(y - bottomEdgeY) <= magnetThreshold) {
    y = bottomEdgeY;
    horizontalGuidePx = vh - bottomSafe;
    snapReasons.push('Bottom Dock');
  } else if (Math.abs(y - centerY) <= magnetThreshold) {
    y = centerY;
    horizontalGuidePx = Math.round(vh / 2);
    snapReasons.push('Center Y');
  } else if (gridStepPx > 1) {
    y = Math.round(y / gridStepPx) * gridStepPx;
  }

  const finalRect = clampWindowRectToViewport(
    { ...clamped, x, y },
    vw,
    vh,
    isMinimized,
    safeMargin
  );

  const snapBadge =
    snapReasons.length > 0
      ? `Snap: ${snapReasons.join(' + ')} (${finalRect.x}, ${finalRect.y})`
      : `Grid ${gridStepPx}px (${finalRect.x}, ${finalRect.y})`;

  return {
    rect: finalRect,
    verticalGuidePx,
    horizontalGuidePx,
    snapBadge,
  };
}

/**
 * Applies either Free 0.1% positioning or Magnetic Center/Edge/Grid percentage snapping
 * for HUD overlays and Modular Action Bars inside the 3D viewport.
 */
export function applyHudPercentSnapSystem(
  rawXPercent: number,
  rawYPercent: number,
  snapMode: StudioSnapMode = 'snap',
  gridStepPercent = 2
): HudPercentSnapResult {
  const clampedX = Math.max(4, Math.min(96, rawXPercent));
  const clampedY = Math.max(4, Math.min(95, rawYPercent));

  if (snapMode === 'free') {
    return {
      xPercent: Number(clampedX.toFixed(1)),
      yPercent: Number(clampedY.toFixed(1)),
      verticalGuidePercent: null,
      horizontalGuidePercent: null,
      snapBadge: `Free (${clampedX.toFixed(1)}%, ${clampedY.toFixed(1)}%)`,
    };
  }

  let x = clampedX;
  let y = clampedY;
  let verticalGuidePercent: number | null = null;
  let horizontalGuidePercent: number | null = null;
  const reasons: string[] = [];

  if (Math.abs(x - 50) <= 2.4) {
    x = 50;
    verticalGuidePercent = 50;
    reasons.push('Center X');
  } else if (Math.abs(x - 12) <= 2.0) {
    x = 12;
    verticalGuidePercent = 12;
    reasons.push('Left Dock');
  } else if (Math.abs(x - 88) <= 2.0) {
    x = 88;
    verticalGuidePercent = 88;
    reasons.push('Right Dock');
  } else if (gridStepPercent > 0) {
    x = Math.round(x / gridStepPercent) * gridStepPercent;
  }

  if (Math.abs(y - 50) <= 2.4) {
    y = 50;
    horizontalGuidePercent = 50;
    reasons.push('Center Y');
  } else if (Math.abs(y - 6) <= 2.0) {
    y = 6;
    horizontalGuidePercent = 6;
    reasons.push('Top Dock');
  } else if (Math.abs(y - 91) <= 2.0) {
    y = 91;
    horizontalGuidePercent = 91;
    reasons.push('Bottom Dock');
  } else if (Math.abs(y - 80) <= 2.0) {
    y = 80;
    horizontalGuidePercent = 80;
    reasons.push('Upper Dock');
  } else if (gridStepPercent > 0) {
    y = Math.round(y / gridStepPercent) * gridStepPercent;
  }

  const finalX = Number(Math.max(4, Math.min(96, x)).toFixed(1));
  const finalY = Number(Math.max(4, Math.min(95, y)).toFixed(1));

  return {
    xPercent: finalX,
    yPercent: finalY,
    verticalGuidePercent,
    horizontalGuidePercent,
    snapBadge:
      reasons.length > 0
        ? `Snap: ${reasons.join(' · ')} (${finalX}%, ${finalY}%)`
        : `Grid ${gridStepPercent}% (${finalX}%, ${finalY}%)`,
  };
}

/**
 * Computes a centered initial window rect that adapts cleanly to any screen size.
 */
export function createCenteredWindowRect(
  preferredWidth: number,
  preferredHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  minWidth = 340,
  minHeight = 260,
  offsetIndex = 0
): WindowRect {
  const vw = Math.max(320, viewportWidth);
  const vh = Math.max(320, viewportHeight);
  const margin = vw < 640 ? 8 : 20;
  const topSafeMargin = vh >= 520 ? Math.max(margin, 44) : margin;

  const width = Math.min(preferredWidth, vw - margin * 2);
  const height = Math.min(preferredHeight, vh - topSafeMargin - margin);
  const cascade = (offsetIndex % 5) * 18;

  const rawX = Math.round((vw - width) / 2) + cascade;
  const rawY =
    Math.round(topSafeMargin + (vh - topSafeMargin - margin - height) / 2) +
    cascade;

  return clampWindowRectToViewport(
    {
      x: rawX,
      y: rawY,
      width,
      height,
      minWidth: Math.min(minWidth, width),
      minHeight: Math.min(minHeight, height),
    },
    vw,
    vh,
    false,
    margin
  );
}

/**
 * Resizes a window from any of the 8 compass handles while enforcing min/max bounds.
 */
export function resizeWindowRect(
  startRect: WindowRect,
  direction: ResizeHandleDirection,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
  safeMargin = 8,
  snapMode: StudioSnapMode = 'free',
  gridStepPx = 16
): WindowRect {
  let { x, y, width, height } = startRect;
  const { minWidth, minHeight } = startRect;
  const vw = Math.max(320, viewportWidth);
  const vh = Math.max(320, viewportHeight);

  const effMinW = Math.min(minWidth, vw - safeMargin * 2);
  const effMinH = Math.min(minHeight, vh - safeMargin * 2);

  const stepVal = (v: number) =>
    snapMode === 'snap' && gridStepPx > 1
      ? Math.round(v / gridStepPx) * gridStepPx
      : v;

  if (direction.includes('e')) {
    const maxW = vw - x - safeMargin;
    width = Math.max(effMinW, Math.min(maxW, stepVal(startRect.width + deltaX)));
  }
  if (direction.includes('s')) {
    const maxH = vh - y - safeMargin;
    height = Math.max(
      effMinH,
      Math.min(maxH, stepVal(startRect.height + deltaY))
    );
  }
  if (direction.includes('w')) {
    const maxDeltaLeft = startRect.width - effMinW;
    const minDeltaLeft = safeMargin - startRect.x;
    const rawDx = stepVal(deltaX);
    const clampedDx = Math.max(minDeltaLeft, Math.min(maxDeltaLeft, rawDx));
    x = startRect.x + clampedDx;
    width = startRect.width - clampedDx;
  }
  if (direction.includes('n')) {
    const maxDeltaTop = startRect.height - effMinH;
    const minDeltaTop = safeMargin - startRect.y;
    const rawDy = stepVal(deltaY);
    const clampedDy = Math.max(minDeltaTop, Math.min(maxDeltaTop, rawDy));
    y = startRect.y + clampedDy;
    height = startRect.height - clampedDy;
  }

  return clampWindowRectToViewport(
    { x, y, width, height, minWidth, minHeight },
    vw,
    vh,
    false,
    safeMargin
  );
}

export interface ResponsiveWorkspaceMetrics {
  effectiveLeftWidth: number;
  effectiveRightWidth: number;
  centerViewportWidth: number;
  centerViewportHeight: number;
  isCompactViewport: boolean;
  isUltraCompactViewport: boolean;
  hudBarAutoScale: number;
  shouldStackBottomBars: boolean;
}

/**
 * Calculates responsive sidebar & center 3D viewport dimensions so resizing the browser
 * never crushes the 3D canvas or causes bottom HUD action bars to collide.
 */
export function computeResponsiveWorkspaceMetrics(
  windowWidth: number,
  windowHeight: number,
  leftOpenAndDocked: boolean,
  preferredLeftWidth: number,
  rightOpenAndDocked: boolean,
  preferredRightWidth: number
): ResponsiveWorkspaceMetrics {
  const vw = Math.max(320, windowWidth);
  const vh = Math.max(320, windowHeight);

  // Reserve at least 46% of window width (or 360px minimum) for the 3D viewport
  const minCenterWidth = Math.min(440, Math.round(vw * 0.46));
  const maxTotalSidebars = Math.max(0, vw - minCenterWidth);

  let effectiveLeftWidth = leftOpenAndDocked
    ? Math.max(190, Math.min(380, preferredLeftWidth))
    : 0;
  let effectiveRightWidth = rightOpenAndDocked
    ? Math.max(240, Math.min(460, preferredRightWidth))
    : 0;

  if (effectiveLeftWidth + effectiveRightWidth > maxTotalSidebars) {
    if (vw < 860) {
      // On narrow windows, sidebars overlay/float instead of crushing flex layout
      effectiveLeftWidth = Math.min(effectiveLeftWidth, vw - 48);
      effectiveRightWidth = Math.min(effectiveRightWidth, vw - 48);
    } else {
      const ratio =
        maxTotalSidebars / Math.max(1, effectiveLeftWidth + effectiveRightWidth);
      effectiveLeftWidth = Math.max(180, Math.floor(effectiveLeftWidth * ratio));
      effectiveRightWidth = Math.max(
        220,
        Math.floor(effectiveRightWidth * ratio)
      );
    }
  }

  const dockedWidthConsumed =
    vw < 860 ? 0 : effectiveLeftWidth + effectiveRightWidth;
  const centerViewportWidth = Math.max(280, vw - dockedWidthConsumed);
  const headerFooterAllowance = vw < 1024 ? 164 : 132;
  const centerViewportHeight = Math.max(240, vh - headerFooterAllowance);

  const isCompactViewport = centerViewportWidth < 960;
  const isUltraCompactViewport = centerViewportWidth < 680;

  const hudBarAutoScale =
    centerViewportWidth < 560
      ? 0.78
      : centerViewportWidth < 880
        ? 0.88
        : centerViewportWidth < 1120
          ? 0.94
          : 1.0;

  // When center viewport is narrower than 1120px, side-by-side bottom bars would overlap
  const shouldStackBottomBars = centerViewportWidth < 1120;

  return {
    effectiveLeftWidth,
    effectiveRightWidth,
    centerViewportWidth,
    centerViewportHeight,
    isCompactViewport,
    isUltraCompactViewport,
    hudBarAutoScale,
    shouldStackBottomBars,
  };
}

function isFactoryDefaultBarPosition(bar: ModularActionBar): boolean {
  const { xPercent, yPercent } = bar.position;
  if (bar.id === 'bar_primary_blocks') {
    return xPercent === 50 && (yPercent === 91 || yPercent === 92);
  }
  if (bar.id === 'bar_tools_macros' || bar.id === 'bar_quick_tools') {
    return xPercent === 50 && (yPercent === 83 || yPercent === 82 || yPercent === 80);
  }
  if (bar.id === 'bar_most_used') {
    return (
      (xPercent === 94 && yPercent === 50) ||
      (xPercent === 20 && yPercent === 91)
    );
  }
  if (bar.id === 'bar_command_loops') {
    return xPercent === 80 && yPercent === 91;
  }
  return false;
}

/**
 * Computes collision-free pixel coordinates for Modular Action Bars
 * inside the active 3D viewport container so resizing the window never clips or overlaps bars,
 * while always respecting custom positions after the user drags a bar.
 */
export function computeResponsiveBarLayout(
  bar: ModularActionBar,
  centerViewportWidth: number,
  centerViewportHeight: number,
  hudBarAutoScale: number,
  shouldStackBottomBars: boolean
): {
  leftPx: number;
  topPx: number;
  effectiveScale: number;
} {
  const cw = Math.max(300, centerViewportWidth);
  const ch = Math.max(240, centerViewportHeight);

  const effectiveScale = Number(
    Math.max(0.68, Math.min(1.35, (bar.scale || 1) * hudBarAutoScale)).toFixed(2)
  );
  const slotPx = Math.round(40 * effectiveScale);
  const slotCount = Math.max(1, bar.slots.length || 6);

  const cols =
    bar.layout === 'column'
      ? 1
      : bar.layout === 'grid_2x'
        ? 4
        : bar.layout === 'grid_3x'
          ? 3
          : slotCount;
  const rows =
    bar.layout === 'column'
      ? slotCount
      : bar.layout === 'grid_2x'
        ? Math.ceil(slotCount / 4)
        : bar.layout === 'grid_3x'
          ? Math.ceil(slotCount / 3)
          : 1;

  const estBarWidth = cols * (slotPx + 4) + 20;
  const estBarHeight = rows * (slotPx + 4) + 34;

  const halfW = Math.min(cw / 2 - 6, estBarWidth / 2);
  const halfH = Math.min(ch / 2 - 6, estBarHeight / 2);

  const minLeft = halfW + 6;
  const maxLeft = Math.max(minLeft, cw - halfW - 6);
  const minTop = halfH + 44; // Leave room for top HUD bar
  const maxTop = Math.max(minTop, ch - halfH - 14);

  const isDefaultPos = isFactoryDefaultBarPosition(bar);

  // If the bar is still at its untouched factory default position, keep Bar 1 & Bar 2 cleanly stacked at the bottom
  // with guaranteed pixel separation so they NEVER overlap even on short/split-screen viewports!
  if (isDefaultPos) {
    const primaryTopPx = Math.round(Math.max(minTop, maxTop - 4));
    const rowSpacingPx = Math.max(68, Math.round(estBarHeight + 10));

    if (bar.id === 'bar_primary_blocks') {
      return {
        leftPx: Math.round(cw * 0.5),
        topPx: primaryTopPx,
        effectiveScale,
      };
    }
    if (bar.id === 'bar_tools_macros' || bar.id === 'bar_quick_tools') {
      return {
        leftPx: Math.round(cw * 0.5),
        topPx: Math.round(Math.max(minTop, primaryTopPx - rowSpacingPx)),
        effectiveScale,
      };
    }
    if (shouldStackBottomBars && bar.id === 'bar_most_used') {
      const rawLeft = bar.layout === 'column' ? cw - halfW - 8 : cw * 0.25;
      const rawTop =
        bar.layout === 'column'
          ? ch * 0.5
          : Math.max(minTop, primaryTopPx - rowSpacingPx * 2);
      return {
        leftPx: Math.round(Math.max(minLeft, Math.min(maxLeft, rawLeft))),
        topPx: Math.round(Math.max(minTop, Math.min(maxTop, rawTop))),
        effectiveScale,
      };
    }
  }

  const rawLeft = (bar.position.xPercent / 100) * cw;
  const rawTop = (bar.position.yPercent / 100) * ch;

  return {
    leftPx: Math.round(Math.max(minLeft, Math.min(maxLeft, rawLeft))),
    topPx: Math.round(Math.max(minTop, Math.min(maxTop, rawTop))),
    effectiveScale,
  };
}
