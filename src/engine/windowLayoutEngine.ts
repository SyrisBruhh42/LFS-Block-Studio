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

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
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
  sourceBarId?: string;
  sourceSlotIdx?: number;
}

export const STUDIO_DRAG_MIME = 'application/x-lfs-studio-item';

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

  const visibleHeight = isMinimized ? 44 : height;

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
  const rawY = Math.round(topSafeMargin + (vh - topSafeMargin - margin - height) / 2) + cascade;

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
  safeMargin = 8
): WindowRect {
  let { x, y, width, height } = startRect;
  const { minWidth, minHeight } = startRect;
  const vw = Math.max(320, viewportWidth);
  const vh = Math.max(320, viewportHeight);

  const effMinW = Math.min(minWidth, vw - safeMargin * 2);
  const effMinH = Math.min(minHeight, vh - safeMargin * 2);

  if (direction.includes('e')) {
    const maxW = vw - x - safeMargin;
    width = Math.max(effMinW, Math.min(maxW, startRect.width + deltaX));
  }
  if (direction.includes('s')) {
    const maxH = vh - y - safeMargin;
    height = Math.max(effMinH, Math.min(maxH, startRect.height + deltaY));
  }
  if (direction.includes('w')) {
    const maxDeltaLeft = startRect.width - effMinW;
    const minDeltaLeft = safeMargin - startRect.x;
    const clampedDx = Math.max(minDeltaLeft, Math.min(maxDeltaLeft, deltaX));
    x = startRect.x + clampedDx;
    width = startRect.width - clampedDx;
  }
  if (direction.includes('n')) {
    const maxDeltaTop = startRect.height - effMinH;
    const minDeltaTop = safeMargin - startRect.y;
    const clampedDy = Math.max(minDeltaTop, Math.min(maxDeltaTop, deltaY));
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
  const centerViewportHeight = Math.max(240, vh - 84);

  const isCompactViewport = centerViewportWidth < 960;
  const isUltraCompactViewport = centerViewportWidth < 680;

  const hudBarAutoScale =
    centerViewportWidth < 600
      ? 0.78
      : centerViewportWidth < 880
        ? 0.88
        : centerViewportWidth < 1120
          ? 0.94
          : 1.0;

  // When center viewport is narrower than 1120px, side-by-side bottom bars (18%, 50%, 82%) would overlap
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

/**
 * Computes collision-free pixel/percentage coordinates for Modular Action Bars
 * inside the active 3D viewport container so resizing the window never clips or overlaps bars.
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
  const estBarHeight = rows * (slotPx + 4) + (bar.locked ? 16 : 42);

  let targetXPercent = bar.position.xPercent;
  let targetYPercent = bar.position.yPercent;

  // If the bar is still near its factory default bottom positions and viewport is narrow,
  // auto-reflow vertically so Bar 1, Bar 2, Bar 3, and Bar 4 never collide!
  if (shouldStackBottomBars && bar.locked) {
    if (bar.id === 'bar_primary_blocks') {
      targetXPercent = 50;
      targetYPercent = 92;
    } else if (bar.id === 'bar_quick_tools') {
      targetXPercent = 50;
      targetYPercent = 81;
    } else if (bar.id === 'bar_most_used') {
      targetXPercent = cw < 740 ? 28 : 24;
      targetYPercent = 70;
    } else if (bar.id === 'bar_command_loops') {
      targetXPercent = cw < 740 ? 72 : 76;
      targetYPercent = 70;
    }
  }

  const rawLeft = (targetXPercent / 100) * cw;
  const rawTop = (targetYPercent / 100) * ch;

  const halfW = Math.min(cw / 2 - 8, estBarWidth / 2);
  const halfH = Math.min(ch / 2 - 8, estBarHeight / 2);

  const minLeft = halfW + 8;
  const maxLeft = Math.max(minLeft, cw - halfW - 8);
  const minTop = halfH + 46; // Leave room for top HUD bar
  const maxTop = Math.max(minTop, ch - halfH - 8);

  return {
    leftPx: Math.round(Math.max(minLeft, Math.min(maxLeft, rawLeft))),
    topPx: Math.round(Math.max(minTop, Math.min(maxTop, rawTop))),
    effectiveScale,
  };
}
