export interface FigmaLinkInfo { url: string; kind: string; title: string; node: string }
const KINDS: Record<string, string> = { design: "Design file", file: "Design file", proto: "Prototype", board: "FigJam board", slides: "Slides", make: "Figma Make", deck: "Slides" };

/** Reads what a Figma URL says about itself: the file's name comes from the address, so no account or token is needed. */
export function parseFigma(raw: string): FigmaLinkInfo | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || !["figma.com", "www.figma.com"].includes(u.hostname)) return null;
  const m = /^\/(design|file|proto|board|slides|make|deck)\/[A-Za-z0-9]{10,40}(?:\/([^/?#]*))?/.exec(u.pathname);
  if (!m) return null;
  let slug = m[2] ?? "";
  try { slug = decodeURIComponent(slug); } catch { /* keep the raw slug */ }
  const title = slug.replace(/---/g, " / ").replace(/-/g, " ").replace(/\s+/g, " ").trim() || KINDS[m[1]];
  return { url: raw, kind: KINDS[m[1]], title, node: u.searchParams.get("node-id") ?? "" };
}

const URL_RE = /https?:\/\/[^\s<>"]+/g;
/** Splits text into plain strings and URLs, leaving trailing punctuation outside the link. */
export function splitLinks(text: string): (string | { url: string })[] {
  const out: (string | { url: string })[] = []; let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0]; let trail = "";
    while (/[.,;:!?)\]'"]$/.test(url)) { trail = url.slice(-1) + trail; url = url.slice(0, -1); }
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push({ url }); if (trail) out.push(trail);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
