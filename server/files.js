'use strict';
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

/** Anything that could be run on a teammate's machine is refused outright. */
const PREVIEWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const BLOCKED_EXT = new Set(['exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'dll', 'vbs', 'ps1', 'jar']);

function safeName(name) {
  const cleaned = String(name || '').replace(/[\\/:*?"<>|#%\u0000-\u001f\u007f]+/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120);
  return cleaned || 'file';
}
const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

/** Local development: files live on disk next to the data file; the browser uploads through this server. */
class LocalFiles {
  constructor(dir) { this.dir = dir; this.kind = 'local'; }

  file(att) { return path.join(this.dir, att.id); }

  async createUpload(att) { return { url: `/api/uploads/${att.id}`, method: 'PUT', headers: {} }; }

  async stat(att) {
    try { return { size: fs.statSync(this.file(att)).size }; } catch { return null; }
  }

  /** Stream the request body to disk, refusing anything over `max` bytes. */
  async receive(att, req, max) {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file(att)}.part`;
    let size = 0;
    const limit = async function* limit(source) {
      for await (const chunk of source) {
        size += chunk.length;
        if (size > max) throw Object.assign(new Error('File is too large'), { tooLarge: true });
        yield chunk;
      }
    };
    const out = fs.createWriteStream(tmp, { mode: 0o600 });
    try {
      await pipeline(req, limit, out);
      fs.renameSync(tmp, this.file(att));
      return size;
    } catch (e) {
      // The file may still be opening when the error hits; wait for the stream to close before deleting it.
      if (!out.closed) await new Promise((resolve) => { out.once('close', resolve); out.destroy(); });
      try { fs.unlinkSync(tmp); } catch { /* nothing was written */ }
      throw e;
    }
  }

  async download(att, res, headers) {
    // Only raster images keep their type (so thumbnails render); everything else is opaque bytes. Never SVG/HTML.
    const type = PREVIEWABLE.has(att.type) ? att.type : 'application/octet-stream';
    res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': fs.statSync(this.file(att)).size });
    fs.createReadStream(this.file(att)).pipe(res);
  }

  async remove(att) { try { fs.unlinkSync(this.file(att)); } catch { /* already gone */ } }
}

/**
 * Vercel Blob (private store): the browser uploads straight to Blob with a short-lived URL signed for exactly
 * one pathname and size limit, so file bytes never pass through (or hit the size cap of) a serverless function.
 * Downloads are authorised by us, then redirected to a signed URL that expires in two minutes.
 */
class BlobFiles {
  constructor() { this.kind = 'blob'; this.sdk = null; }

  async lib() { return (this.sdk ||= await import('@vercel/blob')); }

  async createUpload(att, max) {
    const { issueSignedToken, presignUrl } = await this.lib();
    const validUntil = Date.now() + 30 * 60e3;
    const token = await issueSignedToken({ pathname: att.pathname, operations: ['put'], validUntil, maximumSizeInBytes: max });
    const { presignedUrl } = await presignUrl(token, {
      access: 'private', operation: 'put', pathname: att.pathname, validUntil,
      allowOverwrite: false, addRandomSuffix: false, maximumSizeInBytes: max,
    });
    return { url: presignedUrl, method: 'PUT', headers: { 'Content-Type': att.type || 'application/octet-stream' } };
  }

  async stat(att) {
    const { head, BlobNotFoundError } = await this.lib();
    try { return { size: (await head(att.pathname)).size }; } catch (e) { if (e instanceof BlobNotFoundError) return null; throw e; }
  }

  async downloadUrl(att) {
    const { issueSignedToken, presignUrl } = await this.lib();
    const validUntil = Date.now() + 2 * 60e3;
    const token = await issueSignedToken({ pathname: att.pathname, operations: ['get'], validUntil });
    return (await presignUrl(token, { access: 'private', operation: 'get', pathname: att.pathname, validUntil })).presignedUrl;
  }

  async remove(att) {
    try { const { del } = await this.lib(); await del(att.pathname); } catch { /* already gone */ }
  }
}

module.exports = { LocalFiles, BlobFiles, safeName, extOf, BLOCKED_EXT };
