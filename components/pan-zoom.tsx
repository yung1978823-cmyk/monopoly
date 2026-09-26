"use client";

import { cn } from "cn";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react";

type View = { x: number; y: number; scale: number };

const MIN_SCALE = 0.8;
const MAX_SCALE = 2.4;

/**
 * A movable, zoomable camera over the board scene, like Monopoly GO: drag to move, pinch (or
 * the mouse wheel) to zoom, double-tap to snap back. It opens zoomed in to `startScale` with
 * the `focus` element centred on the `frame` element (the open space between the bars), and
 * glides back there whenever `resetKey` changes (e.g. when GO is pressed).
 */
export function PanZoom({
  children,
  focus,
  frame,
  startScale = 1.15,
  resetKey,
  className,
}: {
  children: ReactNode;
  focus: RefObject<HTMLElement | null>;
  frame: RefObject<HTMLElement | null>;
  startScale?: number;
  resetKey?: unknown;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [gliding, setGliding] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef(0);

  /** The view that puts the focus element's centre on the frame's centre at startScale. */
  const home = useCallback((): View | null => {
    const container = box.current?.getBoundingClientRect();
    const target = focus.current?.getBoundingClientRect();
    const area = frame.current?.getBoundingClientRect();
    if (!container || !target || !area || container.width === 0) return null;
    const now = viewRef.current;
    const cx = container.left + container.width / 2;
    const cy = container.top + container.height / 2;
    // Where the focus centre sits relative to the container centre with no camera applied.
    const rx = (target.left + target.width / 2 - cx - now.x) / now.scale;
    const ry = (target.top + target.height / 2 - cy - now.y) / now.scale;
    const ax = area.left + area.width / 2 - cx;
    const ay = area.top + area.height / 2 - cy;
    return { scale: startScale, x: ax - startScale * rx, y: ay - startScale * ry };
  }, [focus, frame, startScale]);

  const goHome = useCallback(
    (glide: boolean) => {
      const next = home();
      if (!next) return;
      setGliding(glide);
      setView(next);
    },
    [home],
  );

  // Open on the home view, and keep it there when the screen is resized or rotated.
  useLayoutEffect(() => {
    goHome(false);
    const onResize = () => goHome(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [goHome]);

  // Glide home when asked (e.g. each roll), so the walk is always in view.
  useEffect(() => {
    if (resetKey === undefined) return;
    const id = window.setTimeout(() => goHome(true), 0);
    return () => window.clearTimeout(id);
  }, [resetKey, goHome]);

  /** Keep at least part of the scene on screen, however far it is dragged. */
  function clamp(next: View): View {
    const rect = box.current?.getBoundingClientRect();
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    if (!rect) return { ...next, scale };
    const limitX = (rect.width * scale) / 2;
    const limitY = (rect.height * scale) / 2;
    return {
      scale,
      x: Math.max(-limitX, Math.min(limitX, next.x)),
      y: Math.max(-limitY, Math.min(limitY, next.y)),
    };
  }

  /** Zoom by `factor` keeping the screen point (px, py) still under the finger or cursor. */
  function zoomAt(px: number, py: number, factor: number, from: View = viewRef.current): View {
    const rect = box.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, from.scale * factor));
    const rx = (px - cx - from.x) / from.scale;
    const ry = (py - cy - from.y) / from.scale;
    return clamp({ scale, x: px - cx - scale * rx, y: py - cy - scale * ry });
  }

  function onPointerDown(event: ReactPointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setGliding(false);
    if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) goHome(true);
      lastTap.current = now;
    }
  }

  function onPointerMove(event: ReactPointerEvent) {
    const before = pointers.current.get(event.pointerId);
    if (!before) return;
    const points = [...pointers.current.values()];
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.length === 1) {
      const from = viewRef.current;
      setView(clamp({ ...from, x: from.x + event.clientX - before.x, y: from.y + event.clientY - before.y }));
      return;
    }
    // Two fingers: zoom by how much they spread, around their midpoint, and follow the midpoint.
    const other = points.find((p) => p !== before)!;
    const was = Math.hypot(before.x - other.x, before.y - other.y);
    const is = Math.hypot(event.clientX - other.x, event.clientY - other.y);
    if (was < 1) return;
    const midX = (event.clientX + other.x) / 2;
    const midY = (event.clientY + other.y) / 2;
    const zoomed = zoomAt(midX, midY, is / was);
    setView(clamp({ ...zoomed, x: zoomed.x + (event.clientX - before.x) / 2, y: zoomed.y + (event.clientY - before.y) / 2 }));
  }

  function onPointerUp(event: ReactPointerEvent) {
    pointers.current.delete(event.pointerId);
  }

  function onWheel(event: ReactWheelEvent) {
    setGliding(false);
    setView(zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015)));
  }

  return (
    <div
      ref={box}
      className={cn("absolute inset-0 touch-none select-none overflow-hidden", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      data-testid="pan-zoom"
    >
      <div
        className={cn("absolute inset-0 origin-center", gliding && "transition-transform duration-500 ease-out")}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
