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
type Box = { left: number; right: number; top: number; bottom: number };

const MAX_SCALE = 3;

/**
 * A Monopoly GO–style camera: the scene is drawn much bigger than the screen and you drag
 * around it freely; it never shows past the scene's edges. Pinch or the mouse wheel zooms
 * (never out past the scene filling the screen). The camera glides to keep the `follow`
 * element (the token) in view whenever `followKey` changes, e.g. on each step of a walk.
 */
export function PanZoom({
  children,
  world,
  focus,
  frame,
  follow,
  followKey,
  startScale = 1.5,
  className,
}: {
  children: ReactNode;
  /** The whole scene: the camera never shows past its edges. */
  world: RefObject<HTMLElement | null>;
  /** What to centre on when the screen opens (the board). */
  focus: RefObject<HTMLElement | null>;
  /** The open space between the top and bottom bars, where things are centred. */
  frame: RefObject<HTMLElement | null>;
  follow?: RefObject<HTMLElement | null>;
  followKey?: unknown;
  startScale?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [gliding, setGliding] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  /** An element's box relative to the container centre, with the camera taken off. */
  const natural = useCallback((element: HTMLElement | null): Box | null => {
    const container = box.current?.getBoundingClientRect();
    const rect = element?.getBoundingClientRect();
    if (!container || !rect || container.width === 0) return null;
    const { x, y, scale } = viewRef.current;
    const cx = container.left + container.width / 2;
    const cy = container.top + container.height / 2;
    return {
      left: (rect.left - cx - x) / scale,
      right: (rect.right - cx - x) / scale,
      top: (rect.top - cy - y) / scale,
      bottom: (rect.bottom - cy - y) / scale,
    };
  }, []);

  /** Keep the scene covering the whole screen: no zooming out past it, no dragging off it. */
  const clamp = useCallback(
    (next: View): View => {
      const container = box.current?.getBoundingClientRect();
      const scene = natural(world.current);
      if (!container || !scene) return next;
      const halfW = container.width / 2;
      const halfH = container.height / 2;
      const cover = Math.max((2 * halfW) / (scene.right - scene.left), (2 * halfH) / (scene.bottom - scene.top));
      const scale = Math.min(MAX_SCALE, Math.max(cover, next.scale));
      const fit = (value: number, low: number, high: number) => (low > high ? (low + high) / 2 : Math.max(low, Math.min(high, value)));
      return {
        scale,
        x: fit(next.x, halfW - scale * scene.right, -halfW - scale * scene.left),
        y: fit(next.y, halfH - scale * scene.bottom, -halfH - scale * scene.top),
      };
    },
    [natural, world],
  );

  /** Centre an element on the frame at a scale. */
  const centreOn = useCallback(
    (element: HTMLElement | null, scale: number): View | null => {
      const target = natural(element);
      const area = frame.current?.getBoundingClientRect();
      const container = box.current?.getBoundingClientRect();
      if (!target || !area || !container) return null;
      const ax = area.left + area.width / 2 - (container.left + container.width / 2);
      const ay = area.top + area.height / 2 - (container.top + container.height / 2);
      const tx = (target.left + target.right) / 2;
      const ty = (target.top + target.bottom) / 2;
      return clamp({ scale, x: ax - scale * tx, y: ay - scale * ty });
    },
    [natural, frame, clamp],
  );

  // Open on the board, zoomed in; re-centre when the screen is resized or rotated.
  useLayoutEffect(() => {
    const open = () => {
      const next = centreOn(focus.current, startScale);
      if (next) {
        setGliding(false);
        setView(next);
      }
    };
    open();
    window.addEventListener("resize", open);
    return () => window.removeEventListener("resize", open);
  }, [centreOn, focus, startScale]);

  // Follow the token: when it leaves the middle of the frame, glide it back to the centre.
  useEffect(() => {
    if (followKey === undefined || !follow?.current) return;
    const id = window.setTimeout(() => {
      const token = follow.current?.getBoundingClientRect();
      const area = frame.current?.getBoundingClientRect();
      if (!token || !area) return;
      const x = token.left + token.width / 2;
      const y = token.top + token.height / 2;
      const inside =
        x > area.left + area.width * 0.2 &&
        x < area.right - area.width * 0.2 &&
        y > area.top + area.height * 0.2 &&
        y < area.bottom - area.height * 0.2;
      if (inside) return;
      const next = centreOn(follow.current, viewRef.current.scale);
      if (next) {
        setGliding(true);
        setView(next);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [followKey, follow, frame, centreOn]);

  /** Zoom by `factor` keeping the screen point (px, py) still under the finger or cursor. */
  function zoomAt(px: number, py: number, factor: number): View {
    const rect = box.current!.getBoundingClientRect();
    const from = viewRef.current;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const scale = Math.min(MAX_SCALE, from.scale * factor);
    const rx = (px - cx - from.x) / from.scale;
    const ry = (py - cy - from.y) / from.scale;
    return clamp({ scale, x: px - cx - scale * rx, y: py - cy - scale * ry });
  }

  function onPointerDown(event: ReactPointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setGliding(false);
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
    // Two fingers: zoom by how much they spread, around their midpoint.
    const other = points.find((p) => p !== before)!;
    const was = Math.hypot(before.x - other.x, before.y - other.y);
    const is = Math.hypot(event.clientX - other.x, event.clientY - other.y);
    if (was < 1) return;
    setView(zoomAt((event.clientX + other.x) / 2, (event.clientY + other.y) / 2, is / was));
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
