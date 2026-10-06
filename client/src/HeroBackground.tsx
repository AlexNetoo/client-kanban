import { useEffect, useRef } from "react";

const LINES = 34;

const parseColor = (v: string): [number, number, number] => {
  const s = v.trim();
  if (s.startsWith("#")) {
    const h = s.length === 4 ? [...s.slice(1)].map((c) => c + c).join("") : s.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/\d+/g);
  return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [250, 250, 250];
};

/**
 * Hero background (ported 1:1 from alexneto.com): fine, slowly drifting lines that bend around the pointer.
 * Drawn in the theme's ink colour, paused off-screen, and static for reduced motion.
 */
export function HeroBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0;
    let H = 0;
    let color: [number, number, number] = [250, 250, 250];
    let raf = 0;
    let running = false;
    let visible = false;
    let t = 6; // start mid-phase so the first frame already looks composed
    let last = 0;
    const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

    const readColor = () => {
      color = parseColor(getComputedStyle(document.documentElement).getPropertyValue("--ink"));
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const [r, g, b] = color;
      const step = W < 700 ? 10 : 7;
      const amp = H * 0.1;
      for (let i = 0; i < LINES; i++) {
        const u = i / (LINES - 1);
        const env = 0.3 + 0.7 * Math.sin(Math.PI * u);
        const base = H * (0.08 + 0.84 * u);
        ctx.beginPath();
        for (let x = 0; x <= W + step; x += step) {
          const nx = x / W;
          let y =
            base +
            amp *
              env *
              (Math.sin(nx * 3.1 + t * 0.32 + u * 2.6) * 0.62 +
                Math.sin(nx * 7.3 - t * 0.21 + u * 4.4) * 0.24 +
                Math.sin(nx * 1.4 + t * 0.15 - u * 1.8) * 0.3);
          const dx = x - ptr.x;
          const dy = y - ptr.y;
          y += dy * 0.16 * Math.exp(-(dx * dx + dy * dy) / (2 * 170 * 170));
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${r},${g},${b},${(0.07 + 0.2 * Math.pow(Math.sin(Math.PI * u), 1.4)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    const loop = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      t += dt;
      ptr.x += (ptr.tx - ptr.x) * 0.08;
      ptr.y += (ptr.ty - ptr.y) * 0.08;
      draw();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduced || running || !visible) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ptr.tx = e.clientX - r.left;
      ptr.ty = e.clientY - r.top;
      if (ptr.x < -1000) {
        ptr.x = ptr.tx;
        ptr.y = ptr.ty;
      }
    };
    const onLeave = () => {
      ptr.tx = ptr.ty = ptr.x = ptr.y = -9999;
    };

    readColor();
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const mo = new MutationObserver(() => {
      readColor();
      if (!running) draw();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className="hero__bg" aria-hidden="true" />;
}
