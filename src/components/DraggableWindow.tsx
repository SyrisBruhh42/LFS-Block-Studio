import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ResizeHandleDirection,
  WindowRect,
  clampWindowRectToViewport,
  createCenteredWindowRect,
  resizeWindowRect,
} from '../engine/windowLayoutEngine';
import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  GripVertical,
  Maximize2,
  Minimize2,
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
    const map = JSON.parse(raw);
    return map?.[windowId] || null;
  } catch {
    return null;
  }
}

function saveWindowRect(windowId: string, rect: WindowRect) {
  try {
    const raw = localStorage.getItem(WINDOW_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[windowId] = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
    localStorage.setItem(WINDOW_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage error
  }
}

export function triggerResetAllStudioWindows() {
  try {
    localStorage.removeItem(WINDOW_STORAGE_KEY);
  } catch {
    // Ignore
  }
  window.dispatchEvent(new CustomEvent(RESET_ALL_WINDOWS_EVENT));
  window.dispatchEvent(new CustomEvent('lfs-studio-reset-all-windows'));
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
  /** If true, starts without a full-screen blocking backdrop so user can build in 3D while open */
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
  defaultWidth = 980,
  defaultHeight = 680,
  minWidth = 340,
  minHeight = 240,
  defaultX,
  defaultY,
  defaultPinnedFloating = true,
  onClose,
  onDockSidebar,
  dockButtonLabel = 'Dock Panel',
  testId,
  children,
}) => {
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
    startClientX: number;
    startClientY: number;
    startRect: WindowRect;
  } | null>(null);

  const resizeStateRef = useRef<{
    direction: ResizeHandleDirection;
    startClientX: number;
    startClientY: number;
    startRect: WindowRect;
  } | null>(null);

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('a')
    ) {
      return;
    }
    bringToFront();
    if (isMaximized) return;

    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rect,
    };
  };

  const handleHeaderPointerMove = (e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    e.stopPropagation();
    const vw = window.visualViewport?.width || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;

    const next = clampWindowRectToViewport(
      {
        ...drag.startRect,
        x: drag.startRect.x + dx,
        y: drag.startRect.y + dy,
      },
      vw,
      vh,
      isMinimized,
      6
    );
    setRect(next);
  };

  const handleHeaderPointerUp = (e: React.PointerEvent) => {
    if (dragStateRef.current) {
      e.stopPropagation();
      dragStateRef.current = null;
      saveWindowRect(windowId, rect);
    }
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    direction: ResizeHandleDirection
  ) => {
    if (isMaximized || isMinimized) return;
    e.stopPropagation();
    bringToFront();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeStateRef.current = {
      direction,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rect,
    };
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    const res = resizeStateRef.current;
    if (!res) return;
    e.stopPropagation();
    const vw = window.visualViewport?.width || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const dx = e.clientX - res.startClientX;
    const dy = e.clientY - res.startClientY;
    const next = resizeWindowRect(
      res.startRect,
      res.direction,
      dx,
      dy,
      vw,
      vh,
      6
    );
    setRect(next);
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    if (resizeStateRef.current) {
      e.stopPropagation();
      resizeStateRef.current = null;
      saveWindowRect(windowId, rect);
    }
  };

  const handleResetWindowGeometry = () => {
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
      <section
        role="dialog"
        aria-label={title}
        data-window-id={windowId}
        style={effectiveStyle}
        onPointerDown={bringToFront}
        className="fixed pointer-events-auto rounded-2xl bg-slate-900/98 border border-slate-700/90 shadow-2xl flex flex-col overflow-hidden transition-[height] duration-75"
      >
        {/* Universal Draggable & Double-Click Maximize Studio Window Bar */}
        <div
          data-testid={`window-drag-bar-${windowId}`}
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          onDoubleClick={() => {
            if (!isMinimized) setIsMaximized((prev) => !prev);
          }}
          className="h-9 px-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2 select-none cursor-grab active:cursor-grabbing shrink-0"
        >
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <GripHorizontal className="w-4 h-4 text-amber-400 shrink-0" />
            {icon && <span className="shrink-0 flex items-center">{icon}</span>}
            <span className="text-xs font-bold text-slate-100 truncate">
              {title}
            </span>
            {subtitle && rect.width >= 560 && (
              <span className="hidden md:inline text-[11px] text-slate-400 truncate">
                · {subtitle}
              </span>
            )}
            {rect.width >= 820 && (
              <span className="hidden xl:inline text-[10px] font-mono text-slate-500 ml-1 truncate">
                (Drag to move · Drag edges/corners to resize)
              </span>
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

            <button
              type="button"
              onClick={() => setIsPinnedFloating((prev) => !prev)}
              title={
                isPinnedFloating
                  ? '3D Pass-Through Active: You can orbit & build in 3D while this window floats. Click to restore modal backdrop.'
                  : 'Float & Pin Window: Remove dark backdrop so you can build in 3D while keeping this window open'
              }
              className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border transition-colors ${
                isPinnedFloating
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Pin className="w-3 h-3" />
              <span className="hidden sm:inline">
                {isPinnedFloating ? '3D Interactive' : 'Float Over 3D'}
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
              className="absolute top-3 bottom-3 right-0 w-2 cursor-ew-resize z-30"
            />
            {/* West / Left edge */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 'w')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              className="absolute top-3 bottom-3 left-0 w-2 cursor-ew-resize z-30"
            />
            {/* South / Bottom edge */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 's')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              className="absolute bottom-0 left-3 right-3 h-2 cursor-ns-resize z-30"
            />
            {/* North / Top edge */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 'n')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              className="absolute top-0 left-3 right-3 h-1.5 cursor-ns-resize z-30"
            />
            {/* South-East Corner with visible resize grip */}
            <div
              data-testid={`window-resize-se-${windowId}`}
              onPointerDown={(e) => handleResizePointerDown(e, 'se')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
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
              className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-40"
            />
            {/* North-East Corner */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 'ne')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              className="absolute top-0 right-0 w-3.5 h-3.5 cursor-nesw-resize z-40"
            />
            {/* North-West Corner */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, 'nw')}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
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
 * Makes any floating HUD toolbar or overlay inside the 3D viewport draggable by its grip handle,
 * while clamping automatically inside the parent container on window resize.
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

  const inferredDefaults = useCallback((): { xPercent: number; yPercent: number } => {
    if (
      typeof defaultXPercent === 'number' &&
      typeof defaultYPercent === 'number'
    ) {
      return { xPercent: defaultXPercent, yPercent: defaultYPercent };
    }
    if (anchorClassName.includes('top-14')) {
      return { xPercent: 50, yPercent: 11 };
    }
    if (anchorClassName.includes('top-3') && anchorClassName.includes('left-3')) {
      return { xPercent: 9, yPercent: 5 };
    }
    if (anchorClassName.includes('top-3') && anchorClassName.includes('right-3')) {
      return { xPercent: 90, yPercent: 5 };
    }
    if (anchorClassName.includes('top-3')) {
      return { xPercent: 50, yPercent: 4 };
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
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const handleGripPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.xPercent,
      origY: pos.yPercent,
    };
  };

  const handleGripPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const parent =
      containerRef.current?.parentElement || document.documentElement;
    const pw = Math.max(300, parent.clientWidth || window.innerWidth);
    const ph = Math.max(240, parent.clientHeight || window.innerHeight);

    const dxPct = ((e.clientX - d.startX) / pw) * 100;
    const dyPct = ((e.clientY - d.startY) / ph) * 100;

    const next = {
      xPercent: Number(
        Math.max(5, Math.min(95, d.origX + dxPct)).toFixed(1)
      ),
      yPercent: Number(
        Math.max(4, Math.min(95, d.origY + dyPct)).toFixed(1)
      ),
    };
    setPos(next);
  };

  const handleGripPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      e.stopPropagation();
      dragRef.current = null;
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
    ? 'lg:hidden flex items-center gap-0.5'
    : 'flex items-center gap-0.5';

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      style={{
        left: `${pos.xPercent}%`,
        top: `${pos.yPercent}%`,
        transform: 'translate(-50%, -50%)',
        zIndex,
      }}
      className={`absolute ${visibilityClasses} ${className}`}
    >
      <div
        onPointerDown={handleGripPointerDown}
        onPointerMove={handleGripPointerMove}
        onPointerUp={handleGripPointerUp}
        title={`${label} (Drag grip to reposition anywhere on screen)`}
        className="px-1 py-1 rounded bg-slate-950/90 border border-slate-800 hover:border-amber-400/60 text-slate-400 hover:text-amber-400 cursor-grab active:cursor-grabbing shrink-0 flex items-center shadow"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      {children}
    </div>
  );
};
