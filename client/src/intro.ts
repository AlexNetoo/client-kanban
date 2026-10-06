/**
 * First-visit intro, ported from alexneto.com: the mark scales in, the name rises word by word, then the panel
 * lifts away and the page animates in. Same timeline and easings, built on the Web Animations API (no library).
 *   0.00s  mark scale 0 -> 1            0.9s  expo.out
 *   0.35s  words rise, 0.07s stagger     1.0s  expo.out
 *   1.87s  inner fades out               0.45s power2.in
 *   2.22s  panel lifts (yPercent -100)   1.0s  expo.inOut
 *   2.62s  page is "ready" (entrance animations / hero background fade in)
 */
const EXPO_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EXPO_IN_OUT = "cubic-bezier(0.76, 0, 0.24, 1)";
const POWER2_IN = "cubic-bezier(0.55, 0.085, 0.68, 0.53)";

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
  const mark = el.querySelector<HTMLElement>(".intro__mark")!;
  const words = [...el.querySelectorAll<HTMLElement>(".intro__word > span")];
  const inner = el.querySelector<HTMLElement>(".intro__inner")!;
  const fill = { fill: "both" as const };

  mark.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: 900, easing: EXPO_OUT, ...fill });
  words.forEach((w, i) => w.animate([{ transform: "translateY(115%)" }, { transform: "translateY(0)" }], { duration: 1000, delay: 350 + i * 70, easing: EXPO_OUT, ...fill }));
  inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: 1870, easing: POWER2_IN, ...fill });
  const lift = el.animate([{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }], { duration: 1000, delay: 2220, easing: EXPO_IN_OUT, ...fill });
  lift.onfinish = () => { el.remove(); };
  window.setTimeout(markReady, 2620);
  // Safety net: tabs opened in the background pause animations, so never let the cover panel outlive the intro.
  window.setTimeout(() => { el.remove(); markReady(); }, 5000);
}
