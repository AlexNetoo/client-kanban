'use strict';
// The emails the portal sends. Plain, grayscale and short. Everything that comes from users (names, task titles) is escaped.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRAND = 'Alex Neto';
const PORTAL = 'Client Portal';

function layout({ preheader, heading, paragraphs, button, note }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:18px;font-weight:600;padding-bottom:24px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#111;margin-right:8px"></span>${esc(PORTAL)}</td></tr>
<tr><td style="font-size:22px;font-weight:600;line-height:1.3;padding-bottom:12px">${esc(heading)}</td></tr>
${paragraphs.map((p) => `<tr><td style="font-size:15px;line-height:1.6;color:#333;padding-bottom:12px">${p.html ?? esc(p)}</td></tr>`).join('\n')}
${button ? `<tr><td style="padding:12px 0 20px"><a href="${esc(button.url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 22px;border-radius:999px">${esc(button.label)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#777;padding-bottom:16px">Button not working? Copy this link into your browser:<br><a href="${esc(button.url)}" style="color:#777;word-break:break-all">${esc(button.url)}</a></td></tr>` : ''}
<tr><td style="font-size:12px;line-height:1.5;color:#999;border-top:1px solid #eee;padding-top:16px">${esc(note || `${BRAND} · ${PORTAL}`)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [`${PORTAL}`, '', heading, '', ...paragraphs.map((p) => p.text ?? p), ...(button ? ['', `${button.label}: ${button.url}`] : []), '', note || `${BRAND} · ${PORTAL}`].join('\n');
  return { html, text };
}

const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

function welcome({ name, email, kind, signInUrl, setPasswordUrl, days }) {
  const who = kind === 'designer' ? 'designer' : 'client';
  return {
    subject: `Your ${PORTAL} account is ready`,
    ...layout({
      preheader: 'Set your password to get started.',
      heading: `Welcome, ${first(name)}`,
      paragraphs: [
        `An account has been created for you on the ${BRAND} ${PORTAL} as a ${who}.`,
        { html: `Your sign-in email is <strong>${esc(email)}</strong>. First, choose your own password using the button below (the link works for ${days} days).`, text: `Your sign-in email is ${email}. First, choose your own password using the link below (it works for ${days} days).` },
        { html: `After that you can always sign in here: <a href="${esc(signInUrl)}" style="color:#111">${esc(signInUrl)}</a>`, text: `After that you can always sign in here: ${signInUrl}` },
      ],
      button: { label: 'Set your password', url: setPasswordUrl },
    }),
  };
}

function passwordReset({ name, resetUrl, minutes }) {
  return {
    subject: `Reset your ${PORTAL} password`,
    ...layout({
      preheader: 'Use this link to choose a new password.',
      heading: 'Reset your password',
      paragraphs: [`Hi ${first(name)}, we received a request to reset the password for your ${PORTAL} account.`, `The link below works for ${minutes} minutes and can be used once. If you didn’t ask for this, you can ignore this email: your password stays the same.`],
      button: { label: 'Choose a new password', url: resetUrl },
    }),
  };
}

function projectApproved({ name, projectName, url }) {
  return {
    subject: `Your project “${projectName}” was approved`,
    ...layout({
      preheader: 'Your project board is ready.',
      heading: 'Your project was approved',
      paragraphs: [{ html: `Hi ${esc(first(name))}, good news: <strong>${esc(projectName)}</strong> was approved and your project board is ready. You can follow progress and leave comments on it any time.`, text: `Hi ${first(name)}, good news: ${projectName} was approved and your project board is ready. You can follow progress and leave comments on it any time.` }],
      button: { label: 'Open your project', url },
    }),
  };
}

/** `tasks`: [{ title, project, url }]. One email per person per day, listing everything due today. */
function dueReminder({ name, tasks, kind, settingsUrl }) {
  const n = tasks.length;
  const list = tasks.map((t) => `• ${t.title} (${t.project})\n  ${t.url}`).join('\n');
  return {
    subject: n === 1 ? `Due today: ${tasks[0].title}` : `${n} tasks are due today`,
    ...layout({
      preheader: n === 1 ? tasks[0].title : `${n} tasks are due today`,
      heading: n === 1 ? 'A task is due today' : `${n} tasks are due today`,
      paragraphs: [
        `Hi ${first(name)}, ${kind === 'designer' ? 'these tasks assigned to you are' : 'these tasks on your projects are'} due today.`,
        { html: `<ul style="margin:0;padding-left:18px">${tasks.map((t) => `<li style="margin-bottom:6px"><a href="${esc(t.url)}" style="color:#111;font-weight:500">${esc(t.title)}</a> <span style="color:#777">· ${esc(t.project)}</span></li>`).join('')}</ul>`, text: list },
      ],
      note: `You get this because you have an account on the ${PORTAL}. Turn these emails off in Settings: ${settingsUrl}`,
    }),
  };
}

module.exports = { welcome, passwordReset, projectApproved, dueReminder, esc };
