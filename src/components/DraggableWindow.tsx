import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ResizeHandleDirection,
  STUDIO_SNAP_MODE_CHANGE_EVENT,
  StudioSnapMode,
  WindowRect,
  applyHudPercentSnapSystem,
  applyWindowSnapSystem,
  clampWindowRectToViewport,
  createCenteredWindowRect,
  getGlobalStudioSnapMode,
  resizeWindowRect,
  setGlobalStudioSnapMode,
} from '../engine/windowLayoutEngine';
import {
  ChevronDown,
  ChevronUp,
  Grid,
  GripHorizontal,
  GripVertical,
  Maximize2,
  Minimize2,
  Move,
  Pin,
  RotateCcw,
  X,
} from 'lucide-react';

const WINDOW_STORAGE_KEY = 'lfs_studio_window_rects_v1';
export const RESET_ALL_WINDOWS_EVENT = 'lfs:reset-all-windows';

function loadSavedWindowRect(windowId: string): Partial<WindowRect> | null {
  try {
    const raw = localStorage.getItem(WINDOW_STORAGE_KEY);
    if (!raw) return null;
    if (raw.length > 128 * 1024) return null;
    const map = JSON.parse(raw);
    if (!map || typeof map !== 'object' || Array.isArray(map) || Object.hasOwn(map, 'version') || Object.hasOwn(map, 'schemaVersion')) return null;
    return Object.hasOwn(map, windowId) ? map[windowId] : null;
  } catch {
    return null;
  }
}

function saveWindowRect(windowId: string, rect: WindowRect) {
  try {
    const raw = localStorage.getItem(WINDOW_STORAGE_KEY);
    if (raw && raw.length > 128 * 1024) return false;
    const existing = raw ? JSON.parse(raw) : {};
    if (!existing || typeof existing !== 'object' || Array.isArray(existing) || Object.keys(existing).length > 128 || Object.hasOwn(existing, 'version') || Object.hasOwn(existing, 'schemaVersion')) return false;
    const map = { ...existing };
    map[windowId] = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
    localStorage.setItem(WINDOW_STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export function triggerResetAllStudioWindows() {
  try {
    localStorage.removeItem(WINDOW_STORAGE_KEY);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${WINDOW_STORAGE_KEY}_hud_`)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore
  }
  window.dispatchEvent(new CustomEvent(RESET_ALL_WINDOWS_EVENT));
  window.dispatchEvent(new CustomEvent('lfs-studio-reset-all-windows'));
}

export function useStudioSnapMode(): [
  StudioSnapMode,
  (next: StudioSnapMode) => void,
  () => void,
] {
  const [snapMode, setSnapModeState] = useState<StudioSnapMode>(() =>
    getGlobalStudioSnapMode()
  );

  const snapModeRef = useRef(snapMode);
  snapModeRef.current = snapMode;
  useEffect(() => {
    const onSnapChange = (ev: Event) => {
      const custom = ev as CustomEvent<StudioSnapMode>;
      if (custom.detail === 'snap' || custom.detail === 'free') {
        snapModeRef.current = custom.detail;
        setSnapModeState(custom.detail);
      } else {
        snapModeRef.current = getGlobalStudioSnapMode();
        setSnapModeState(snapModeRef.current);
      }
    };
    window.addEventListener(STUDIO_SNAP_MODE_CHANGE_EVENT, onSnapChange);
    return () =>
      window.removeEventListener(STUDIO_SNAP_MODE_CHANGE_EVENT, onSnapChange);
  }, []);

  const updateSnapMode = useCallback((next: StudioSnapMode) => {
    snapModeRef.current = next;
    setSnapModeState(next);
    setGlobalStudioSnapMode(next);
  }, []);

  const toggleSnapMode = useCallback(() => {
    updateSnapMode(snapModeRef.current === 'snap' ? 'free' : 'snap');
  }, [updateSnapMode]);

  return [snapMode, updateSnapMode, toggleSnapMode];
}

let globalTopZIndex = 60;

interface DraggableWindowProps {
  windowId: string;
  isOpen?: boolean;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  defaultX?: number;
  defaultY?: number;
  zIndex?: number;
  /** If true, starts without a full-screen blocking backdrop; the host owns viewport input availability */
  defaultPinnedFloating?: boolean;
  onClose?: () => void;
  /** Optional button to dock a floating sidebar back into the left/right studio frame */
  onDockSidebar?: () => void;
  dockButtonLabel?: string;
  testId?: string;
  children: React.ReactNode;
}

export const DraggableWindow: React.FC<DraggableWindowProps> = ({
  windowId,
  isOpen = true,
  title,
  subtitle,
  icon,
  headerActions,
  defaultWidth = 920,
  defaultHeight = 640,
  minWidth = 320,
  minHeight = 220,
  defaultX,
  defaultY,
  defaultPinnedFloating = true,
  onClose,
  onDockSidebar,
  dockButtonLabel = 'Dock Panel',
  testId,
  children,
}) => {
  const [snapMode, , toggleSnapMode] = useStudioSnapMode();

  const computeInitialRect = useCallback((): WindowRect => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const saved = loadSavedWindowRect(windowId);

    const base = createCenteredWindowRect(
      defaultWidth,
      defaultHeight,
      vw,
      vh,
      minWidth,
      minHeight
    );

    const merged: WindowRect = {
      ...base,
      x:
        typeof saved?.x === 'number'
          ? saved.x
          : typeof defaultX === 'number'
            ? defaultX
            : base.x,
      y:
        typeof saved?.y === 'number'
          ? saved.y
          : typeof defaultY === 'number'
            ? defaultY
            : base.y,
      width: typeof saved?.width === 'number' ? saved.width : base.width,
      height: typeof saved?.height === 'number' ? saved.height : base.height,
    };

    return clampWindowRectToViewport(merged, vw, vh, false, 8);
  }, [
    windowId,
    defaultWidth,
    defaultHeight,
    minWidth,
    minHeight,
    defaultX,
    defaultY,
  ]);

  const [rect, setRect] = useState<WindowRect>(computeInitialRect);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isPinnedFloating, setIsPinnedFloating] = useState<boolean>(
    defaultPinnedFloating
  );
  const [zIndex, setZIndex] = useState<number>(() => ++globalTopZIndex);
  const [activeSnapOverlay, setActiveSnapOverlay] = useState<{
    verticalGuidePx: number | null;
    horizontalGuidePx: number | null;
    snapBadge: string;
  } | null>(null);

  const [layoutDraft, setLayoutDraft] = useState({ x: String(Math.round(rect.x)), y: String(Math.round(rect.y)), width: String(Math.round(rect.width)), height: String(Math.round(rect.height)) });
  const [layoutMessage, setLayoutMessage] = useState('');

  const bringToFront = useCallback(() => {
    setZIndex(++globalTopZIndex);
  }, []);

  // Re-clamp automatically whenever browser window or visualViewport resizes
  useEffect(() => {
    const handleViewportResize = () => {
      const vw = window.visualViewport?.width || window.innerWidth;
      const vh = window.visualViewport?.height || window.innerHeight;
      setRect((prev) => clampWindowRectToViewport(prev, vw, vh, isMinimized, 8));
    };

    const handleResetAll = () => {
      try {
        localStorage.removeItem(WINDOW_STORAGE_KEY);
      } catch {
        // Ignore
      }
      const vw = window.visualViewport?.width || window.innerWidth;
      const vh = window.visualViewport?.height || window.innerHeight;
      const fresh = createCenteredWindowRect(
        defaultWidth,
        defaultHeight,
        vw,
        vh,
        minWidth,
        minHeight
      );
      setRect(
        clampWindowRectToViewport(
          {
            ...fresh,
            x: typeof defaultX === 'number' ? defaultX : fresh.x,
            y: typeof defaultY === 'number' ? defaultY : fresh.y,
          },
          vw,
          vh,
          false,
          8
        )
      );
      setIsMinimized(false);
      setIsMaximized(false);
    };

    window.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.addEventListener(RESET_ALL_WINDOWS_EVENT, handleResetAll);
    return () => {
      window.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.removeEventListener(RESET_ALL_WINDOWS_EVENT, handleResetAll);
    };
  }, [
    isMinimized,
    defaultWidth,
    defaultHeight,
    minWidth,
    minHeight,
    defaultX,
    defaultY,
  ]);

  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startRect: WindowRect;
  } | null>(null);

  const resizeStateRef = useRef<{
    pointerId: number;
    direction: ResizeHandleDirection;
    startClientX: number;
    startClientY: number;
    startRect: WindowRect;
  } | null>(null);

  const cancelWindowGesture = useCallback((event?: { pointerId: number }) => {
    if (!event || dragStateRef.current?.pointerId === event.pointerId) dragStateRef.current = null;
    if (!event || resizeStateRef.current?.pointerId === event.pointerId) resizeStateRef.current = null;
    if (!dragStateRef.current && !resizeStateRef.current) setActiveSnapOverlay(null);
  }, []);

  useEffect(() => {
    const cancel = () => cancelWindowGesture();
    window.addEventListener('blur', cancel);
    if (!isOpen) cancel();
    return () => { window.removeEventListener('blur', cancel); cancel(); };
  }, [isOpen, cancelWindowGesture]);

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary || dragStateRef.current || resizeStateRef.current) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('a') || target.closest('textarea') || target.closest('details')
    ) {
      return;
    }
    bringToFront();
    if (isMaximized) return;

    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic or inactive pointer IDs
    }
    dragStateRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rect,
    };
  };

  const handleHeaderPointerMove = (e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const vw = window.visualViewport?.width || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;

    // Holding Shift temporarily inverts Snap vs Free mode while dragging
    const effectiveMode: StudioSnapMode = e.shiftKey
      ? snapMode === 'snap'
        ? 'free'
        : 'snap'
      : snapMode;

    const snapped = applyWindowSnapSystem(
      {
        ...drag.startRect,
        x: drag.startRect.x + dx,
        y: drag.startRect.y + dy,
      },
      vw,
      vh,
      effectiveMode,
      isMinimized,
      16,
      8
    );
    setRect(snapped.rect);
    setActiveSnapOverlay({
      verticalGuidePx: snapped.verticalGuidePx,
      horizontalGuidePx: snapped.horizontalGuidePx,
      snapBadge: snapped.snapBadge,
    });
  };

  const handleHeaderPointerUp = (e: React.PointerEvent) => {
    if (dragStateRef.current?.pointerId === e.pointerId) {
      e.stopPropagation();
      dragStateRef.current = null;
      setActiveSnapOverlay(null);
      saveWindowRect(windowId, rect);
    }
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    direction: ResizeHandleDirection
  ) => {
    if (isMaximized || isMinimized || e.button !== 0 || !e.isPrimary || dragStateRef.current || resizeStateRef.current) return;
    e.stopPropagation();
    bringToFront();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic or inactive pointer IDs
    }
    resizeStateRef.current = {
      pointerId: e.pointerId,
      direction,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rect,
    };
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    const res = resizeStateRef.current;
    if (!res || res.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const vw = window.visualViewport?.width || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const dx = e.clientX - res.startClientX;
    const dy = e.clientY - res.startClientY;
    const effectiveMode: StudioSnapMode = e.shiftKey
      ? snapMode === 'snap'
        ? 'free'
        : 'snap'
      : snapMode;
    const next = resizeWindowRect(
      res.startRect,
      res.direction,
      dx,
      dy,
      vw,
      vh,
      8,
      effectiveMode,
      16
    );
    setRect(next);
    setActiveSnapOverlay({
      verticalGuidePx: null,
      horizontalGuidePx: null,
      snapBadge: `${effectiveMode === 'snap' ? 'Grid 16px' : 'Free'} · ${next.width}×${next.height}`,
    });
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    if (resizeStateRef.current?.pointerId === e.pointerId) {
      e.stopPropagation();
      resizeStateRef.current = null;
      setActiveSnapOverlay(null);
      saveWindowRect(windowId, rect);
    }
  };

  const handleResetWindowGeometry = () => {
    cancelWindowGesture();
    const vw = window.visualViewport?.width || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const fresh = createCenteredWindowRect(
      defaultWidth,
      defaultHeight,
      vw,
      vh,
      minWidth,
      minHeight
    );
    const next = clampWindowRectToViewport(
      {
        ...fresh,
        x: typeof defaultX === 'number' ? defaultX : fresh.x,
        y: typeof defaultY === 'number' ? defaultY : fresh.y,
      },
      vw,
      vh,
      false,
      8
    );
    setRect(next);
    setIsMinimized(false);
    setIsMaximized(false);
    saveWindowRect(windowId, next);
  };

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  const effectiveStyle: React.CSSProperties = isMaximized
    ? {
        left: 8,
        top: 44,
        width: Math.max(300, vw - 16),
        height: isMinimized ? 40 : Math.max(220, vh - 52),
        zIndex,
      }
    : {
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: isMinimized ? 40 : rect.height,
        zIndex,
      };

  const showModalBackdrop = !isPinnedFloating && !isMinimized;

  if (!isOpen) return null;

  return (
    <div
      data-testid={testId}
      style={{ zIndex }}
      className={`fixed inset-0 ${
        showModalBackdrop
          ? 'bg-slate-950/65 pointer-events-auto'
          : 'pointer-events-none'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && showModalBackdrop && onClose) {
          onClose();
        }
      }}
    >
      {/* Magnetic Snap Alignment Guide Lines while dragging */}
      {activeSnapOverlay?.verticalGuidePx !== null &&
        activeSnapOverlay?.verticalGuidePx !== undefined && (
          <div
            aria-hidden="true"
            style={{ left: activeSnapOverlay.verticalGuidePx }}
            className="pointer-events-none fixed top-0 bottom-0 w-0.5 bg-cyan-400/80 shadow-[0_0_8px_#22d3ee] z-50"
          />
        )}
      {activeSnapOverlay?.horizontalGuidePx !== null &&
        activeSnapOverlay?.horizontalGuidePx !== undefined && (
          <div
            aria-hidden="true"
            style={{ top: activeSnapOverlay.horizontalGuidePx }}
            className="pointer-events-none fixed left-0 right-0 h-0.5 bg-cyan-400/80 shadow-[0_0_8px_#22d3ee] z-50"
          />
        )}

      <section
        role={isMinimized ? 'region' : 'dialog'}
        aria-modal={!isPinnedFloating && !isMinimized ? true : undefined}
        aria-label={title}
        data-window-id={windowId}
        style={effectiveStyle}
        onPointerDown={bringToFront}
        className="fixed pointer-events-auto rounded-2xl bg-slate-900/98 border border-slate-700/90 shadow-2xl flex flex-col overflow-hidden transition-[height] duration-75"
      >
        {/* Universal Draggable & Double-Click Maximize Studio Window Bar */}
        <div
          data-testid={`window-drag-bar-${windowId}`}
          data-studio-window-header={windowId}
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          onPointerCancel={cancelWindowGesture}
          onLostPointerCapture={cancelWindowGesture}
          onDoubleClick={event => {
            if ((event.target as HTMLElement).closest('button, input, select, textarea, a, details')) return;
            if (!isMinimized) setIsMaximized((prev) => !prev);
          }}
          className="min-h-10 px-2.5 py-1 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-1.5 select-none cursor-grab active:cursor-grabbing shrink-0"
        >
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <GripHorizontal className="w-4 h-4 text-amber-400 shrink-0" />
            {icon && <span className="shrink-0 flex items-center">{icon}</span>}
            <span className="text-xs font-bold text-slate-100 truncate">
              {title}
            </span>
            {activeSnapOverlay ? (
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/50 text-[10px] font-mono font-bold text-cyan-300 whitespace-nowrap">
                {activeSnapOverlay.snapBadge}
              </span>
            ) : (
              subtitle &&
              rect.width >= 580 && (
                <span className="hidden md:inline text-[11px] text-slate-400 truncate">
                  · {subtitle}
                </span>
              )
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {headerActions}
            {onDockSidebar && (
              <button
                type="button"
                onClick={onDockSidebar}
                title="Snap this floating window back into the studio sidebar dock"
                className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[10px] font-semibold"
              >
                {dockButtonLabel}
              </button>
            )}

            <details className="relative">
            <summary className="cursor-pointer rounded border border-slate-600 px-2 py-2 text-xs" aria-label={`Window layout for ${title}`} onClick={event => {
              if (!event.currentTarget.parentElement?.hasAttribute('open')) {
                setLayoutDraft({ x: String(Math.round(rect.x)), y: String(Math.round(rect.y)), width: String(Math.round(rect.width)), height: String(Math.round(rect.height)) });
                setLayoutMessage('');
              }
            }}>Layout</summary>
            <form aria-label={`Window layout controls for ${title}`} className="absolute right-0 top-full z-50 mt-1 w-60 rounded border border-slate-500 bg-slate-950 p-3 text-slate-100 shadow-xl" onSubmit={event => {
              event.preventDefault();
              const numbers = Object.fromEntries(Object.entries(layoutDraft).map(([key, value]) => [key, Number(value)])) as { x: number; y: number; width: number; height: number };
              if (Object.values(layoutDraft).some(value => !value.trim()) || Object.values(numbers).some(value => !Number.isFinite(value) || Math.abs(value) > 100000) || numbers.width <= 0 || numbers.height <= 0) {
                setLayoutMessage('Enter finite coordinates and positive dimensions, up to 100,000 pixels.'); return;
              }
              cancelWindowGesture();
              const next = clampWindowRectToViewport({ ...rect, ...numbers }, window.visualViewport?.width || window.innerWidth, window.visualViewport?.height || window.innerHeight, isMinimized, 8);
              setRect(next); setIsMaximized(false);
              setLayoutDraft({ x: String(Math.round(next.x)), y: String(Math.round(next.y)), width: String(Math.round(next.width)), height: String(Math.round(next.height)) });
              setLayoutMessage(saveWindowRect(windowId, next) ? 'Layout applied and saved; kept within the viewport.' : 'Layout applied for this session. Browser preferences could not be saved.');
            }}>
              <p className="mb-2 text-xs">Move or resize this window without dragging.</p>
              <div className="grid grid-cols-2 gap-2">
                {(['x', 'y', 'width', 'height'] as const).map(key => <label key={key} className="flex flex-col gap-1 text-xs">
                  <span>{key === 'x' ? 'Left' : key === 'y' ? 'Top' : key === 'width' ? 'Width' : 'Height'} (px)</span>
                  <input type="number" step="1" aria-label={`Window ${key}`} value={layoutDraft[key]} onChange={event => setLayoutDraft(current => ({ ...current, [key]: event.target.value }))} className="w-full rounded border border-slate-500 bg-slate-900 p-2" />
                </label>)}
              </div>
              <button type="submit" className="mt-2 rounded border border-sky-400 px-3 py-2 text-xs">Apply window layout</button>
              <button type="button" onClick={() => {
                cancelWindowGesture();
                const next = createCenteredWindowRect(defaultWidth, defaultHeight, window.visualViewport?.width || window.innerWidth, window.visualViewport?.height || window.innerHeight, minWidth, minHeight);
                setRect(next); setIsMaximized(false); setIsMinimized(false);
                setLayoutDraft({ x: String(Math.round(next.x)), y: String(Math.round(next.y)), width: String(Math.round(next.width)), height: String(Math.round(next.height)) });
                setLayoutMessage(saveWindowRect(windowId, next) ? 'Window centered and saved.' : 'Window centered for this session. Browser preferences could not be saved.');
              }} className="mt-2 rounded border border-slate-500 px-3 py-2 text-xs">Center and restore size</button>
              <p role="status" className="mt-2 text-xs">{layoutMessage}</p>
            </form>
          </details>
          {/* Panel snapping is independent of authored block snapping. */}
            <button
              type="button"
              data-testid={`window-snap-toggle-${windowId}`}
              aria-label="Panel snapping" aria-pressed={snapMode === 'snap'}
              onClick={toggleSnapMode}
              title={
                snapMode === 'snap'
                  ? 'Magnetic 16px Grid & Edge Snap ON (Click to switch to 1px Free Drag, or hold Shift while dragging)'
                  : '1px Free Drag ON (Click to enable Magnetic 16px Grid & Edge Snap, or hold Shift while dragging)'
              }
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center gap-1 border transition-colors ${
                snapMode === 'snap'
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300'
                  : 'bg-amber-500/20 border-amber-400/60 text-amber-300'
              }`}
            >
              {snapMode === 'snap' ? (
                <Grid className="w-3 h-3" />
              ) : (
                <Move className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">
                {snapMode === 'snap' ? 'Snap 16px' : 'Free Drag'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsPinnedFloating((prev) => !prev)}
              title={
                isPinnedFloating
                  ? 'Floating window. Restore the modal backdrop.'
                  : 'Show as a floating window without the dark backdrop.'
              }
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border transition-colors ${
                isPinnedFloating
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Pin className="w-3 h-3" />
              <span className="hidden md:inline">
                {isPinnedFloating ? 'Floating' : 'Modal'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleResetWindowGeometry}
              title="Reset window position and size to center fit"
              aria-label={`Reset ${title} window size and position`}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setIsMinimized((prev) => !prev)}
              title={
                isMinimized
                  ? 'Expand shaded window'
                  : 'Shade / Minimize window to titlebar'
              }
              aria-label={isMinimized ? `Expand ${title}` : `Minimize ${title}`}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              {isMinimized ? (
                <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsMinimized(false);
                setIsMaximized((prev) => !prev);
              }}
              title={isMaximized ? 'Restore floating window size' : 'Maximize window'}
              aria-label={isMaximized ? `Restore ${title}` : `Maximize ${title}`}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title={`Close ${title}`}
                aria-label={`Close ${title}`}
                className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Window Body Content */}
        {!isMinimized && (
          <div className="relative flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            {children}
          </div>
        )}

        {/* 8-Way Edge & Corner Resize Handles */}
        {!isMinimized && !isMaximized && (
          <>
            {/* East / Right edge */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 'e')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={cancelWindowGesture}
              onLostPointerCapture={cancelWindowGesture}
              className="absolute top-3 bottom-3 right-0 w-2 cursor-ew-resize z-30"
            />
            {/* West / Left edge */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 'w')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={cancelWindowGesture}
              onLostPointerCapture={cancelWindowGesture}
              className="absolute top-3 bottom-3 left-0 w-2 cursor-ew-resize z-30"
            />
            {/* South / Bottom edge */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 's')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={cancelWindowGesture}
              onLostPointerCapture={cancelWindowGesture}
              className="absolute bottom-0 left-3 right-3 h-2 cursor-ns-resize z-30"
            />
            {/* North / Top edge */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 'n')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={cancelWindowGesture}
              onLostPointerCapture={cancelWindowGesture}
              className="absolute top-0 left-3 right-3 h-1.5 cursor-ns-resize z-30"
            />
            {/* South-East Corner with visible resize grip */}
            <div
              data-testid={`window-resize-se-${windowId}`}
              onPointerDown={(e) => handleResizePointerDown(e, 'se')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={cancelWindowGesture}
              onLostPointerCapture={cancelWindowGesture}
              title="Drag to resize window"
              className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-40 flex items-end justify-end p-0.5 text-slate-500 hover:text-amber-400"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                className="fill-current"
              >
                <path d="M9 1v8H1L9 1zm-3 5h2V4l-2 2z" />
              </svg>
            </div>
            {/* South-West Corner */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 'sw')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={cancelWindowGesture}
              onLostPointerCapture={cancelWindowGesture}
              className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-40"
            />
            {/* North-East Corner */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 'ne')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={cancelWindowGesture}
              onLostPointerCapture={cancelWindowGesture}
              className="absolute top-0 right-0 w-3.5 h-3.5 cursor-nesw-resize z-40"
            />
            {/* North-West Corner */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 'nw')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={cancelWindowGesture}
              onLostPointerCapture={cancelWindowGesture}
              className="absolute top-0 left-0 w-3.5 h-3.5 cursor-nwse-resize z-40"
            />
          </>
        )}
      </section>
    </div>
  );
};

interface DraggableHudOverlayProps {
  hudId: string;
  defaultXPercent?: number;
  defaultYPercent?: number;
  anchorClassName?: string;
  zIndex?: number;
  className?: string;
  testId?: string;
  label?: string;
  children: React.ReactNode;
}

/**
 * Makes any floating HUD toolbar or overlay inside the 3D viewport freely draggable OR snap-aligned
 * from its integrated grip handle. Ordinary toolbar controls retain their click behavior.
 */
export const DraggableHudOverlay: React.FC<DraggableHudOverlayProps> = ({
  hudId,
  defaultXPercent,
  defaultYPercent,
  anchorClassName = '',
  zIndex = 21,
  className = '',
  testId,
  label = 'Drag HUD Bar',
  children,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [snapMode] = useStudioSnapMode();
  const [snapInfo, setSnapInfo] = useState<{
    verticalGuidePercent: number | null;
    horizontalGuidePercent: number | null;
    snapBadge: string;
  } | null>(null);

  const inferredDefaults = useCallback((): { xPercent: number; yPercent: number } => {
    if (
      typeof defaultXPercent === 'number' &&
      typeof defaultYPercent === 'number'
    ) {
      return { xPercent: defaultXPercent, yPercent: defaultYPercent };
    }
    if (anchorClassName.includes('top-14')) {
      return { xPercent: 50, yPercent: 12 };
    }
    if (anchorClassName.includes('top-3') && anchorClassName.includes('left-3')) {
      return { xPercent: 10, yPercent: 5 };
    }
    if (anchorClassName.includes('top-3') && anchorClassName.includes('right-3')) {
      return { xPercent: 90, yPercent: 5 };
    }
    if (anchorClassName.includes('top-2') || anchorClassName.includes('top-3')) {
      return { xPercent: 50, yPercent: 4.5 };
    }
    return { xPercent: 50, yPercent: 92 };
  }, [defaultXPercent, defaultYPercent, anchorClassName]);

  const [pos, setPos] = useState<{ xPercent: number; yPercent: number }>(() => {
    try {
      const raw = localStorage.getItem(`${WINDOW_STORAGE_KEY}_hud_${hudId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          typeof parsed.xPercent === 'number' &&
          typeof parsed.yPercent === 'number'
        ) {
          return parsed;
        }
      }
    } catch {
      // Ignore
    }
    return inferredDefaults();
  });

  useEffect(() => {
    const onReset = () => {
      try {
        localStorage.removeItem(`${WINDOW_STORAGE_KEY}_hud_${hudId}`);
      } catch {
        // Ignore
      }
      setPos(inferredDefaults());
    };
    window.addEventListener(RESET_ALL_WINDOWS_EVENT, onReset);
    return () => window.removeEventListener(RESET_ALL_WINDOWS_EVENT, onReset);
  }, [hudId, inferredDefaults]);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    hasMoved: boolean;
  } | null>(null);



  useEffect(() => {
    const cancel = () => { dragRef.current = null; setSnapInfo(null); };
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('blur', cancel); dragRef.current = null; };
  }, []);

  const beginDrag = (e: React.PointerEvent, fromGrip: boolean) => {
    if (e.button !== 0 || !e.isPrimary || dragRef.current) return;
    const target = e.target as HTMLElement;
    if (
      !fromGrip &&
      (target.closest('input') ||
        target.closest('select') ||
        target.closest('textarea'))
    ) {
      return;
    }
    if (fromGrip) {
      e.stopPropagation();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic or inactive pointer IDs
      }
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.xPercent,
      origY: pos.yPercent,
      hasMoved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (!d.hasMoved) {
      if (dist < 6) return;
      d.hasMoved = true;
    }
    e.stopPropagation();
    const parent =
      containerRef.current?.parentElement || document.documentElement;
    const pw = Math.max(300, parent.clientWidth || window.innerWidth);
    const ph = Math.max(240, parent.clientHeight || window.innerHeight);

    const dxPct = ((e.clientX - d.startX) / pw) * 100;
    const dyPct = ((e.clientY - d.startY) / ph) * 100;

    const effectiveMode: StudioSnapMode = e.shiftKey
      ? snapMode === 'snap'
        ? 'free'
        : 'snap'
      : snapMode;

    const snapped = applyHudPercentSnapSystem(
      d.origX + dxPct,
      d.origY + dyPct,
      effectiveMode,
      2
    );

    setPos({
      xPercent: snapped.xPercent,
      yPercent: snapped.yPercent,
    });
    setSnapInfo({
      verticalGuidePercent: snapped.verticalGuidePercent,
      horizontalGuidePercent: snapped.horizontalGuidePercent,
      snapBadge: snapped.snapBadge,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const moved = d.hasMoved;
    dragRef.current = null;
    setSnapInfo(null);
    if (moved) {
      e.stopPropagation();
      try {
        localStorage.setItem(
          `${WINDOW_STORAGE_KEY}_hud_${hudId}`,
          JSON.stringify(pos)
        );
      } catch {
        // Ignore
      }
    }
  };

  const visibilityClasses = anchorClassName.includes('lg:hidden')
    ? 'lg:hidden flex items-center'
    : /\bhidden\b/.test(anchorClassName) &&
        !anchorClassName.includes('sm:flex') &&
        !anchorClassName.includes('md:flex') &&
        !anchorClassName.includes('lg:flex')
      ? 'hidden'
      : 'flex items-center';

  return (
    <>
      {snapInfo?.verticalGuidePercent !== null &&
        snapInfo?.verticalGuidePercent !== undefined && (
          <div
            aria-hidden="true"
            style={{ left: `${snapInfo.verticalGuidePercent}%` }}
            className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-cyan-400/80 shadow-[0_0_8px_#22d3ee] z-40"
          />
        )}
      {snapInfo?.horizontalGuidePercent !== null &&
        snapInfo?.horizontalGuidePercent !== undefined && (
          <div
            aria-hidden="true"
            style={{ top: `${snapInfo.horizontalGuidePercent}%` }}
            className="pointer-events-none absolute left-0 right-0 h-0.5 bg-cyan-400/80 shadow-[0_0_8px_#22d3ee] z-40"
          />
        )}
      <div
        ref={containerRef}
        data-testid={testId}
        onPointerDown={event => event.stopPropagation()}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={event => {
          if (dragRef.current?.pointerId === event.pointerId) { dragRef.current = null; setSnapInfo(null); }
        }}
        onLostPointerCapture={event => {
          if (dragRef.current?.pointerId === event.pointerId) { dragRef.current = null; setSnapInfo(null); }
        }}
        style={{
          left: `${pos.xPercent}%`,
          top: `${pos.yPercent}%`,
          transform: 'translate(-50%, -50%)',
          zIndex,
        }}
        className={`absolute ${visibilityClasses} ${className} group/hud`}
      >
        <div
          onPointerDown={(e) => beginDrag(e, true)}
          title={`${label} — Drag the grip to move (${snapMode === 'snap' ? 'Magnetic Snap ON · Hold Shift for Free' : 'Free Drag ON · Hold Shift to Snap'})`}
          className="px-1 py-1.5 rounded-l-xl bg-slate-950/95 border border-r-0 border-slate-800 group-hover/hud:border-amber-400/60 text-slate-400 hover:text-amber-400 cursor-grab active:cursor-grabbing shrink-0 flex items-center shadow-lg"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <div className="relative flex items-center">
          {snapInfo && (
            <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-950/95 border border-cyan-400 text-[10px] font-mono font-bold text-cyan-300 whitespace-nowrap shadow-lg z-50">
              {snapInfo.snapBadge}
            </span>
          )}
          {children}
        </div>
      </div>
    </>
  );
};
