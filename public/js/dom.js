// Tiny DOM helpers. Text is always set via textContent/createTextNode, never innerHTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') Object.entries(v).forEach(([p, val]) => el.style.setProperty(p, val));
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (Array.isArray(c)) c.forEach(add);
    else if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

const ICONS = {
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
export function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  return t.content.firstChild;
}

const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export function formatDate(iso) {
  if (!iso) return '';
  return parse(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function isOverdue(iso, done = false) {
  if (!iso || done) return false;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return parse(iso) < t;
}
export const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

export function dueLabel(iso, done = false) {
  if (!iso) return h('span', { class: 'muted', text: 'No due date' });
  const late = isOverdue(iso, done);
  return h('span', { class: late ? 'overdue' : '' }, icon('calendar'), ' ', (late ? 'Overdue · ' : 'Due ') + formatDate(iso));
}

export function progressBar(value, label) {
  return h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': value, 'aria-label': label },
    h('span', { style: { '--value': value } }));
}

export function toast(message, type = 'success') {
  const box = document.getElementById('toasts');
  const el = h('div', { class: `toast ${type}`, role: type === 'error' ? 'alert' : null, text: message });
  box.append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

// Modal built on <dialog>: focus trap, Esc to close and backdrop semantics come from the platform.
export function openDialog(build) {
  const dialog = h('dialog');
  const close = () => dialog.close();
  dialog.append(build(close));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', onConfirm }) {
  return openDialog((close) => {
    const err = h('div', { class: 'form-error', role: 'alert' });
    const ok = h('button', { class: 'btn btn-danger', type: 'submit' }, confirmLabel);
    return h('form', {
      method: 'dialog',
      onsubmit: async (e) => {
        e.preventDefault();
        ok.disabled = true;
        try { await onConfirm(); close(); } catch (ex) { err.textContent = ex.message; ok.disabled = false; }
      },
    },
    h('h2', { text: title }), h('p', { class: 'muted', style: { 'margin-bottom': '14px' }, text: message }), err,
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: close, autofocus: true }, 'Cancel'), ok));
  });
}

export function stateBlock({ title, message, action, label }) {
  return h('div', { class: 'state' }, h('h2', { text: title }), h('p', { class: 'muted', text: message }),
    action && h('button', { class: 'btn btn-primary', type: 'button', onclick: action }, label));
}

export const skeletons = (n = 3) => h('div', { class: 'grid', 'aria-busy': 'true', 'aria-label': 'Loading' },
  ...Array.from({ length: n }, () => h('div', { class: 'skeleton' })));
