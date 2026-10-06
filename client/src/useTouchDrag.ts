import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

interface Opts {
  /** Where would a drop at (list, y) land? */
  target: (list: HTMLElement, y: number) => { before: string; position: number };
  onHover: (col: string | null, before: string) => void;
  onDrop: (taskId: string, col: string, position: number) => void;
  canDrag: (taskId: string) => boolean;
}

const HOLD_MS = 350;   // press and hold, so a normal swipe still scrolls the page
const SLOP = 8;        // moving further than this before the hold ends cancels it (the user is scrolling)

/**
 * Touch drag and drop for the board. HTML5 drag events don't fire for touch, so this uses pointer events:
 * press and hold a card, it lifts (a floating copy follows the finger), drag over any column, release to drop.
 * The board scrolls by itself near its edges. Mouse input keeps using the native drag events.
 */
export function useTouchDrag(opts: Opts) {
  const o = useRef(opts); o.current = opts;
  const cleanup = useRef<(() => void) | null>(null);
  const justDragged = useRef(false);
  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, taskId: string) => {
    if (e.pointerType !== "touch" || !e.isPrimary || !o.current.canDrag(taskId)) return;
    if ((e.target as HTMLElement).closest("[data-no-open]")) return; // the Edit and Move buttons keep their own behaviour
    const el = e.currentTarget; const startX = e.clientX; const startY = e.clientY;
    let x = startX, y = startY, active = false, ghost: HTMLElement | null = null, raf = 0, ox = 0, oy = 0, hoverCol: string | null = null;

    const stop = () => {
      window.clearTimeout(timer); cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", block); document.removeEventListener("contextmenu", noMenu);
      ghost?.remove(); el.classList.remove("dragging"); document.body.classList.remove("touch-dragging");
      o.current.onHover(null, "end"); cleanup.current = null;
    };
    const block = (ev: TouchEvent) => { if (active && ev.cancelable) ev.preventDefault(); }; // stops the page scrolling under the finger while dragging
    const noMenu = (ev: Event) => ev.preventDefault();

    const hover = () => {
      const under = document.elementFromPoint(x, y) as HTMLElement | null;
      const list = under?.closest<HTMLElement>("ul.cards[data-col]") ?? null;
      hoverCol = list?.dataset.col ?? null;
      if (list) o.current.onHover(hoverCol, o.current.target(list, y).before); else o.current.onHover(null, "end");
    };
    const tick = () => { // keep the board scrolling while the finger rests near an edge
      if (!active) return;
      const board = el.closest<HTMLElement>(".board");
      if (board) { const r = board.getBoundingClientRect(); if (x < r.left + 56) board.scrollLeft -= 14; else if (x > r.right - 56) board.scrollLeft += 14; }
      const list = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("ul.cards");
      if (list) { const lr = list.getBoundingClientRect(); if (y < lr.top + 56) list.scrollTop -= 12; else if (y > lr.bottom - 56) list.scrollTop += 12; }
      if (y < 90) window.scrollBy(0, -14); else if (y > window.innerHeight - 90) window.scrollBy(0, 14);
      if (ghost) ghost.style.transform = `translate(${x - ox}px, ${y - oy}px) rotate(1.5deg)`;
      hover(); raf = requestAnimationFrame(tick);
    };

    const activate = () => {
      active = true; justDragged.current = true;
      const r = el.getBoundingClientRect(); ox = startX - r.left; oy = startY - r.top;
      ghost = el.cloneNode(true) as HTMLElement; ghost.removeAttribute("data-task-id");
      Object.assign(ghost.style, { position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, margin: "0", pointerEvents: "none", zIndex: "30000", opacity: "0.95", boxShadow: "0 18px 40px -12px rgba(0,0,0,.55)", transition: "none", animation: "none" });
      ghost.classList.remove("dragging"); ghost.classList.add("task-ghost");
      document.body.appendChild(ghost); el.classList.add("dragging"); document.body.classList.add("touch-dragging");
      try { el.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      navigator.vibrate?.(12);
      tick();
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      x = ev.clientX; y = ev.clientY;
      if (!active && Math.hypot(x - startX, y - startY) > SLOP) stop();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (active) {
        const under = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
        const list = under?.closest<HTMLElement>("ul.cards[data-col]");
        if (list?.dataset.col) o.current.onDrop(taskId, list.dataset.col, o.current.target(list, ev.clientY).position);
        window.setTimeout(() => { justDragged.current = false; }, 400); // swallow the click that follows a drop
      }
      stop();
    };
    const cancel = () => { if (active) window.setTimeout(() => { justDragged.current = false; }, 400); stop(); };

    const timer = window.setTimeout(activate, HOLD_MS);
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", cancel);
    document.addEventListener("touchmove", block, { passive: false }); document.addEventListener("contextmenu", noMenu);
    cleanup.current = stop;
  };

  return { onPointerDown, wasDrag: () => justDragged.current };
}
