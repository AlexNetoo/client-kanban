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
