import { h, icon, dueLabel, progressBar, stateBlock, skeletons, formatDate, formatDateTime } from './dom.js';
import { api } from './api.js';
import { PROJECT_STATUS } from './dialogs.js';

const STAGES = [
  { id: 'in_progress', label: 'In progress now' },
  { id: 'in_review', label: 'Ready for review' },
  { id: 'todo', label: 'Up next' },
  { id: 'backlog', label: 'Planned' },
  { id: 'done', label: 'Completed' },
];

export async function clientView(main, token, role) {
  main.replaceChildren(skeletons(1));
  let data;
  try { data = await api.clientView(token); }
  catch (e) {
    main.replaceChildren(stateBlock({
      title: e.status === 404 ? 'We couldn’t find that project' : 'Couldn’t load this project',
      message: e.status === 404 ? 'The link may be out of date. Ask your freelancer for a fresh one.' : e.message,
      action: e.status === 404 ? null : () => clientView(main, token, role), label: 'Try again',
    }));
    return;
  }
  const { project: p, tasks } = data;
  document.title = `${p.name} · Project progress`;

  const updates = tasks.filter((t) => t.clientUpdate).sort((a, b) => (b.clientUpdateAt || '').localeCompare(a.clientUpdateAt || '')).slice(0, 8);
  const stage = (s) => {
    const items = tasks.filter((t) => t.status === s.id);
    if (!items.length) return null;
    return h('section', { class: 'section', 'aria-labelledby': `st-${s.id}` },
      h('h2', { id: `st-${s.id}` }, s.id === 'done' && icon('check'), `${s.label} `, h('span', { class: 'muted', text: `(${items.length})` })),
      h('ul', { class: 'list' }, ...items.map((t) => h('li', { class: 'item' },
        h('h3', {}, t.title, t.dueDate && s.id !== 'done' && h('span', { class: 'muted', style: { 'font-weight': 400, 'font-size': '.85rem' } }, dueLabel(t.dueDate))),
        t.description && h('p', { class: 'muted', style: { 'margin-top': '4px', 'font-size': '.95rem' }, text: t.description }),
        t.clientUpdate && h('div', { class: 'update' }, h('strong', {}, 'Update: '), t.clientUpdate)))));
  };

  main.replaceChildren(...[
    role === 'owner' && h('div', { class: 'preview-banner' },
      h('span', {}, icon('eye'), ' Client preview — this is exactly what your client sees. Private notes are never included.'),
      h('a', { class: 'btn btn-sm', href: '#/' }, '← Back to dashboard')),
    h('section', { class: 'hero', 'aria-labelledby': 'proj-title' },
      h('div', {}, h('p', { class: 'muted', text: p.client }), h('h1', { id: 'proj-title', text: p.name }),
        p.summary && h('p', { class: 'muted', style: { 'margin-top': '6px' }, text: p.summary })),
      h('div', { class: 'pct-row' }, h('span', { class: 'pct', text: `${p.progress}%` }), h('span', { class: 'muted', text: `complete · ${p.counts.done} of ${p.total} tasks finished` })),
      progressBar(p.progress, `${p.name} is ${p.progress}% complete`),
      h('div', { class: 'chips' }, h('span', { class: `badge ${p.status}` }, PROJECT_STATUS[p.status]), h('span', {}, dueLabel(p.dueDate, p.status === 'completed')),
        h('span', { class: 'muted', text: `Last updated ${formatDate(p.updatedAt.slice(0, 10))}` }))),
    tasks.length === 0
      ? stateBlock({ title: 'Work is about to begin', message: 'Tasks will appear here as soon as they are planned.' })
      : h('div', { class: 'client-layout' },
        h('div', {}, ...STAGES.map(stage)),
        h('aside', { 'aria-labelledby': 'latest' }, h('section', { class: 'section' },
          h('h2', { id: 'latest' }, 'Latest updates'),
          updates.length
            ? h('ul', { class: 'list' }, ...updates.map((t) => h('li', { class: 'item' }, h('h3', { text: t.title }),
              h('div', { class: 'update' }, t.clientUpdate, t.clientUpdateAt && h('time', { datetime: t.clientUpdateAt }, formatDateTime(t.clientUpdateAt))))))
            : h('p', { class: 'muted', text: 'No updates yet. Check back soon.' }))))].filter(Boolean));
}
