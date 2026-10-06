'use strict';
const fs = require('fs');
const path = require('path');

/** Another writer changed the data since we read it. The caller re-reads and retries. */
class ConflictError extends Error {}

/** Single-process storage: one JSON file, written atomically (temp file + rename). */
class FilePersistence {
  constructor(file) { this.file = file; this.shared = false; }

  async load() {
    if (!fs.existsSync(this.file)) return null;
    return { text: fs.readFileSync(this.file, 'utf8'), version: null };
  }

  async save(text) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, text, { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    return null;
  }
}

/**
 * Vercel Blob (private store): the whole database is one JSON blob.
 * Reads bypass the CDN cache so they always see the latest write, and writes are conditional on the ETag
 * we read (optimistic concurrency), so two serverless instances can never silently overwrite each other.
 */
class BlobPersistence {
  constructor(pathname) { this.pathname = pathname; this.shared = true; this.sdk = null; }

  async lib() { return (this.sdk ||= await import('@vercel/blob')); }

  async load() {
    const { get } = await this.lib();
    const r = await get(this.pathname, { access: 'private', useCache: false });
    if (!r) return null;
    if (r.statusCode !== 200 || !r.stream) throw new Error('Unexpected response reading the data store');
    // Larger bodies come back with a weak ETag (W/"…", a compression side effect); conditional writes need the strong one.
    return { text: await new Response(r.stream).text(), version: String(r.blob.etag).replace(/^W\//, '') };
  }

  async save(text, version) {
    const { put, BlobPreconditionFailedError } = await this.lib();
    try {
      const res = await put(this.pathname, text, {
        access: 'private', contentType: 'application/json', addRandomSuffix: false,
        allowOverwrite: version != null, ...(version != null ? { ifMatch: version } : {}),
      });
      return res.etag;
    } catch (e) {
      // Stale ETag, or two instances creating the very first copy at once.
      if (e instanceof BlobPreconditionFailedError || (version == null && /already exists/i.test(String(e && e.message)))) throw new ConflictError();
      throw e;
    }
  }
}

module.exports = { FilePersistence, BlobPersistence, ConflictError };
