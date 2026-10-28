/**
 * First-visit loader, ported from alexneto.com: a vinyl record is drawn to a 72x72 canvas and re-rendered as a 36x36
 * grid of square dots that dissolve in while the tonearm drops. A mono counter reads "loading 000" up to 100, then
 * "now playing"; the record zooms away and the page is "ready". Same timeline and maths as the site, no library.
 *   0.00s  record dissolves in, spins up   progress runs 0 -> 0.97 over 1.25s (waits for fonts, 2.4s at most)
 *   done   +0.16s page is "ready" and the panel fades out, +0.9s panel removed
 */
const SIZE = 36; // dot grid, SIZE x SIZE
const SRC = 72; // offscreen canvas the record is drawn on (2x the grid, sampled 2x2 per dot)

// Dot colours by brightness (0..7), then blue and orange accents. Dark palette first, light second.
const PALETTE_DARK = ["70,68,64", "92,90,85", "118,115,109", "146,142,135", "174,169,161", "200,195,187", "224,218,209", "244,238,229", "107,149,255", "244,176,98"];
const PALETTE_LIGHT = ["214,210,202", "192,188,180", "166,162,155", "138,134,128", "108,105,99", "78,76,71", "52,50,46", "30,29,27", "58,92,220", "214,128,30"];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const hash = (x: number, y: number) => {
  const n = 43758.5453 * Math.sin(127.1 * x + 311.7 * y);
  return n - Math.floor(n);
};

let ready = false;
export function markReady() {
  if (ready) return;
  ready = true;
  document.documentElement.classList.add("is-ready");
}

export function runIntro() {
  const el = document.getElementById("intro");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = el?.querySelector<HTMLCanvasElement>("canvas");
  const status = el?.querySelector<HTMLElement>("p span:first-child");
  const counter = el?.querySelector<HTMLElement>("p span:last-child");
  const out = canvas?.getContext("2d");
  const src = document.createElement("canvas");
  src.width = src.height = SRC;
  const g = src.getContext("2d", { willReadFrequently: true });
  if (!el || !canvas || !status || !counter || !out || !g || reduced || document.documentElement.classList.contains("no-intro")) {
    el?.remove();
    markReady();
    return;
  }
  try { sessionStorage.setItem("intro", "1"); } catch { /* private mode */ }

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cell = window.innerWidth < 700 ? 7 : 9;
  canvas.width = SIZE * cell * dpr;
  canvas.height = SIZE * cell * dpr;
  canvas.style.width = `${SIZE * cell}px`;
  canvas.style.height = `${SIZE * cell}px`;
  const palette = document.documentElement.getAttribute("data-theme") === "light" ? PALETTE_LIGHT : PALETTE_DARK;

  // Tonearm: pivot at (34, 2); it swings from 84deg round to the record's edge.
  const pivot = { x: 34, y: 2 };
  const rest = { x: 20, y: 6.5 };
  const reach = Math.hypot(rest.x - pivot.x, rest.y - pivot.y);
  const endAngle = Math.atan2(rest.y - pivot.y, rest.x - pivot.x);
  const startAngle = (84 * Math.PI) / 180;
  let arm: [number, number, number, number] | null = null;
  let spin = 0;

  const circle = (x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 2 * Math.PI); };

  const draw = (p: number, dt: number) => {
    const reveal = clamp01(p / 0.42);
    spin += (2 + 16 * (1 - Math.pow(1 - clamp01(p / 0.8), 3))) * dt;
    g.clearRect(0, 0, SRC, SRC);
    const cx = 36, cy = 36;

    // Record: body, grooves, rim, two light wedges, blue label, spindle hole
    g.fillStyle = "rgb(74,72,68)"; circle(cx, cy, 30); g.fill();
    for (let r = 13.2, i = 0; r < 26.8; r += 2, i++) {
      g.strokeStyle = i % 2 ? "rgb(122,118,112)" : "rgb(58,56,52)"; g.lineWidth = 1.1; circle(cx, cy, r); g.stroke();
    }
    g.strokeStyle = "rgb(214,208,200)"; g.lineWidth = 1.8; circle(cx, cy, 29.1); g.stroke();
    g.fillStyle = "rgba(255,248,240,0.6)";
    for (let i = 0; i < 2; i++) {
      const a = spin + i * Math.PI;
      g.beginPath();
      g.moveTo(cx + 10.8 * Math.cos(a) * 1.25, cy + 10.8 * Math.sin(a) * 1.25);
      g.arc(cx, cy, 27.8, a - 0.2, a + 0.2);
      g.lineTo(cx + 10.8 * Math.cos(a - 0.2) * 1.25, cy + 10.8 * Math.sin(a - 0.2) * 1.25);
      g.closePath(); g.fill();
    }
    g.fillStyle = "rgb(96,140,255)"; circle(cx, cy, 10.8); g.fill();
    g.fillStyle = "rgb(26,24,22)"; circle(cx + 10.8 * Math.cos(spin) * 0.62, cy + 10.8 * Math.sin(spin) * 0.62, 1.1); g.fill();
    g.globalCompositeOperation = "destination-out"; circle(cx, cy, 1.4); g.fill(); g.globalCompositeOperation = "source-over";

    // Tonearm swings in with a small overshoot, then a ripple where the needle lands
    const drop = clamp01((p - 0.28) / 0.46);
    if (p > 0.2) {
      const a = startAngle + (endAngle - startAngle) * (1 + 2.2 * Math.pow(drop - 1, 3) + 1.2 * Math.pow(drop - 1, 2));
      const nx = (pivot.x + Math.cos(a) * reach) * 2;
      const ny = (pivot.y + Math.sin(a) * reach) * 2;
      arm = [pivot.x, pivot.y, nx / 2, ny / 2];
      g.strokeStyle = "rgb(232,226,218)"; g.lineWidth = 1.8; g.lineCap = "round";
      g.beginPath(); g.moveTo(68, 4); g.lineTo(nx, ny); g.stroke();
      g.fillStyle = "rgb(232,226,218)"; circle(68, 4, 3); g.fill();
      g.fillStyle = "rgb(244,176,98)"; circle(nx, ny, 2.3); g.fill();
      if (drop >= 1) {
        const t = clamp01((p - 0.74) / 0.26);
        g.globalAlpha = (1 - t) * 0.8; g.strokeStyle = "rgb(244,238,229)"; g.lineWidth = 1.8; circle(nx, ny, 2 * (1 + 9 * t)); g.stroke(); g.globalAlpha = 1;
      }
    }

    // Re-render the 72x72 drawing as a 36x36 grid of square dots; dots appear in a noisy radial order
    const px = g.getImageData(0, 0, SRC, SRC).data;
    const stride = 4 * SRC;
    out.setTransform(dpr, 0, 0, dpr, 0, 0);
    out.clearRect(0, 0, SIZE * cell, SIZE * cell);
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const radial = Math.hypot(col + 0.5 - 18, row + 0.5 - 18) / 15;
        let onArm = false;
        if (arm) {
          const [x1, y1, x2, y2] = arm;
          const dx = x2 - x1, dy = y2 - y1;
          const s = clamp01(((col + 0.5 - x1) * dx + (row + 0.5 - y1) * dy) / (dx * dx + dy * dy));
          onArm = Math.hypot(col + 0.5 - (x1 + s * dx), row + 0.5 - (y1 + s * dy)) < 1.6 || Math.hypot(col + 0.5 - x2, row + 0.5 - y2) < 3.2;
        }
        if (!onArm && 0.55 * hash(col, row) + 0.45 * Math.min(1, radial) > reveal) continue;
        let cover = 0, r = 0, gr = 0, b = 0;
        const base = 2 * row * stride + 2 * col * 4;
        for (const i of [base, base + 4, base + stride, base + stride + 4]) {
          const al = px[i + 3] / 255;
          cover += al; r += px[i] * al; gr += px[i + 1] * al; b += px[i + 2] * al;
        }
        const m = cover / 4;
        if (m < 0.05) continue;
        const rr = r / cover, gg = gr / cover, bb = b / cover;
        const lum = (rr + gg + bb) / 3;
        let colour = palette[Math.min(7, Math.max(0, Math.floor(lum / 31)))];
        if (bb - rr > 38) colour = palette[8]; else if (rr - bb > 70 && rr > 180) colour = palette[9];
        const full = cell - 1.3;
        const size = m > 0.45 ? full : full * (0.4 + (m / 0.45) * 0.6);
        out.globalAlpha = Math.min(1, m > 0.45 ? 0.6 + 0.4 * m : 1.4 * m);
        out.fillStyle = `rgb(${colour})`;
        out.fillRect(col * cell + (cell - size) / 2, row * cell + (cell - size) / 2, size, size);
      }
    }
    out.globalAlpha = 1;
  };

  let fontsReady = false;
  document.fonts.ready.then(() => { fontsReady = true; });
  let t0 = 0, last = 0, finishing = false, playing = false;
  const tick = (now: number) => {
    if (!t0) t0 = last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const elapsed = now - t0;
    const done = elapsed >= 1250 && (fontsReady || elapsed >= 2400);
    const p = done ? 1 : Math.min(clamp01(elapsed / 1250), 0.97);
    draw(p, dt);
    counter.textContent = String(Math.round(100 * p)).padStart(3, "0");
    if (!playing && p >= 0.74) { playing = true; status.textContent = "now playing"; }
    if (done && !finishing) {
      finishing = true;
      window.setTimeout(() => { markReady(); el.classList.add("is-done"); }, 160);
      window.setTimeout(() => el.remove(), 900);
    }
    if (!finishing || elapsed < 2250) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // Safety net: tabs opened in the background pause animation frames, so never let the cover outlive the intro.
  window.setTimeout(() => { el.remove(); markReady(); }, 6000);
}
