'use strict';
// Sending email. Production uses Resend (https://resend.com): set RESEND_API_KEY and EMAIL_FROM (an address on a domain you verified there).
// Without a key, production sends nothing (the features that need email stay quiet) and development just prints each email to the terminal.
// Tests use mode "capture", which collects emails in config.mail.outbox.

function createMailer(mail = {}, log = console) {
  const mode = mail.mode || 'off';
  const enabled = mode !== 'off';
  async function send({ to, subject, text, html }) {
    if (!enabled || !to) return false;
    if (mode === 'capture') { (mail.outbox || (mail.outbox = [])).push({ to, subject, text, html }); return true; }
    if (mode === 'log') { log.log(`\n--- email (not sent: no RESEND_API_KEY) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---`); return true; }
    try {
      const res = await fetch(`${mail.baseUrl || 'https://api.resend.com'}/emails`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${mail.apiKey}` },
        body: JSON.stringify({ from: mail.from, to: [to], subject, html, text }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); log.error('email failed', res.status, String(j.message || j.name || '').slice(0, 200)); return false; }
      return true;
    } catch (e) { log.error('email failed', e.name === 'TimeoutError' ? 'timeout' : e.message); return false; }
  }
  return { enabled, mode, send };
}

module.exports = { createMailer };
