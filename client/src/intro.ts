/**
 * First-visit loader: a small patch of the site's dot grid (the dots that light up under the pointer on alexneto.com)
 * with a soft spot of light sweeping across it. It shows for about 0.7 seconds (a little longer if the fonts are still
 * loading, 1.6s at most), then fades out and the page is "ready". Pure CSS (index.css, .intro); this only times it.
 * Plays once per browser session (public/boot.js adds .no-intro afterwards) and never for reduced motion.
 */
const MIN_MS = 700;
const MAX_MS = 1600;

let ready = false;
export function markReady() {
  if (ready) return;
  ready = true;
  document.documentElement.classList.add("is-ready");
}

export function runIntro() {
  const el = document.getElementById("intro");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!el || reduced || document.documentElement.classList.contains("no-intro")) {
    el?.remove();
    markReady();
    return;
  }
  try { sessionStorage.setItem("intro", "1"); } catch { /* private mode */ }

  const start = performance.now();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    el.classList.add("is-done");
    markReady();
    window.setTimeout(() => el.remove(), 500);
  };
  const whenFonts = () => window.setTimeout(finish, Math.max(0, MIN_MS - (performance.now() - start)));
  document.fonts.ready.then(whenFonts, whenFonts);
  window.setTimeout(finish, MAX_MS);
}
