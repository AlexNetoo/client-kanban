'use strict';
// Figma link previews. Without FIGMA_ACCESS_TOKEN the app still shows a link card built from the URL itself;
// with a token it also fetches the file name, last-modified date and a thumbnail of the linked frame.
const PATH = /^\/(design|file|proto|board|slides|make|deck)\/([A-Za-z0-9]{10,40})(?:\/|$)/;

/** Returns { key, node } for a Figma file URL, else null. Only the key and node id ever reach the Figma API. */
function parseFigma(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return null; }
  if (u.protocol !== 'https:' || !['figma.com', 'www.figma.com'].includes(u.hostname)) return null;
  const m = PATH.exec(u.pathname);
  if (!m) return null;
  const node = (u.searchParams.get('node-id') || '').replace('-', ':');
  return { key: m[2], node: /^\d+:\d+$/.test(node) ? node : '' };
}

async function figmaGet(cfg, pathAndQuery) {
  const res = await fetch(`${cfg.baseUrl}${pathAndQuery}`, { headers: { 'X-Figma-Token': cfg.token }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`figma ${res.status}`);
  return res.json();
}

async function imageAsDataUri(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('image');
  const type = (res.headers.get('content-type') || 'image/png').split(';')[0];
  if (!/^image\/(png|jpeg|webp)$/.test(type)) throw new Error('image type');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 3 * 1024 * 1024) throw new Error('image too large');
  return `data:${type};base64,${buf.toString('base64')}`;
}

async function fetchPreview(cfg, { key, node }) {
  const file = await figmaGet(cfg, `/v1/files/${key}?depth=1`);
  let image = '';
  try {
    if (node) {
      const imgs = await figmaGet(cfg, `/v1/images/${key}?ids=${encodeURIComponent(node)}&format=png&scale=1`);
      const url = imgs.images && imgs.images[node];
      if (url) image = await imageAsDataUri(url);
    }
    if (!image && file.thumbnailUrl) image = await imageAsDataUri(file.thumbnailUrl);
  } catch { /* the card still works without a picture */ }
  return { configured: true, name: String(file.name || ''), lastModified: String(file.lastModified || ''), image };
}

module.exports = { parseFigma, fetchPreview };
