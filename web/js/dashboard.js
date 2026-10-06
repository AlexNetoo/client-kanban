import { h, icon, dueLabel, progressBar, stateBlock, skeletons, confirmDialog, toast } from './dom.js';
import { api } from './api.js';
import { projectDialog, PROJECT_STATUS } from './dialogs.js';

export const clientLink = (p) => `${location.origin}/#/c/${p.shareToken}`;

export async function copyClientLink(p) {
  try { await navigator.clipboard.writeText(clientLink(p)); toast('Client link copied'); }
  catch { toast('Couldn’t copy automatically. Open the client view and copy the address.', 'error'); }
}

export function projectMenu(p, { onChange, afterDelete }) {
  const item = (label, fn, cls) => h('button', { type: 'button', class: cls, onclick: (e) => { e.target.closest('details').open = false; fn(); } }, label);
  return h('details', { class: 'more' },
    h('summary', { class: 'btn btn-sm', 'aria-label': `More actions for ${p.name}` }, icon('more'), ' More'),
    h('div', { class: 'menu' },
      item('Edit project', () => projectDialog({ project: p, onSaved: onChange })),
      item('Preview client view', () => { location.hash = `#/c/${p.shareToken}`; }),
      item('Copy client link', () => copyClientLink(p)),
      item('Reset client link', () => confirmDialog({
        title: 'Reset client link?', confirmLabel: 'Reset link',
        message: 'The current link will stop working. Share the new link with your client.',
        onConfirm: async () => { await api.updateProject(p.id, { resetShareToken: true }); toast('Link reset'); onChange(); },
      })),
      item(p.archived ? 'Restore from archive' : 'Archive project', async () => {
        try { await api.updateProject(p.id, { archived: !p.archived }); toast(p.archived ? 'Project restored' : 'Project archived'); onChange(); }
        catch (e) { toast(e.message, 'error'); }
      }),
      item('Delete project', () => confirmDialog({
        title: 'Delete this project?', message: `“${p.name}” and all of its tasks will be permanently deleted. Archive it instead to keep the history.`,
        onConfirm: async () => { await api.deleteProject(p.id); toast('Project deleted'); (afterDelete || onChange)(); },
      }), 'danger')));
}

export async function dashboardView(main) {
  document.title = 'Projects · Project Hub';
  let tab = 'active';
  let projects = [];

  async function load() {
    main.replaceChildren(h('h1', { text: 'Projects' }), skeletons());
    try { projects = await api.listProjects(); }
    catch (e) { main.replaceChildren(h('h1', { text: 'Projects' }), stateBlock({ title: 'Couldn’t load projects', message: e.message, action: load, label: 'Try again' })); return; }
    render();
  }

  function render() {
    const live = projects.filter((p) => !p.archived);
    const archived = projects.filter((p) => p.archived);
    const shown = (tab === 'active' ? live : archived).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    const openTasks = live.reduce((n, p) => n + p.total - p.counts.done, 0);
    const inProgress = live.reduce((n, p) => n + p.counts.in_progress, 0);
    const inReview = live.reduce((n, p) => n + p.counts.in_review, 0);

    const tabBtn = (id, label, n) => h('button', { type: 'button', 'aria-pressed': String(tab === id), onclick: () => { tab = id; render(); } }, `${label} (${n})`);
    const body = shown.length
      ? h('ul', { class: 'grid', style: { 'list-style': 'none', padding: 0, margin: 0 }, 'aria-label': `${tab} projects` }, ...shown.map(card))
      : tab === 'active'
        ? stateBlock({ title: 'No projects yet', message: 'Create your first project to start a board and share progress with a client.', action: newProject, label: 'New project' })
        : stateBlock({ title: 'Nothing archived', message: 'Archived projects are kept here, hidden from clients.' });

    main.replaceChildren(
      h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Projects' }), h('p', { class: 'muted', text: 'Everything in flight, and how it looks to each client.' })),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: newProject }, icon('plus'), 'New project'))),
      h('div', { class: 'stats' },
        stat(live.length, 'Active projects'), stat(openTasks, 'Open tasks'), stat(inProgress, 'In progress'), stat(inReview, 'Awaiting review')),
      h('div', { class: 'tabs', role: 'group', 'aria-label': 'Project filter' }, tabBtn('active', 'Active', live.length), tabBtn('archived', 'Archived', archived.length)),
      body);
  }

  const stat = (n, label) => h('div', { class: 'stat' }, h('div', { class: 'n', text: n }), h('div', { class: 'muted', text: label }));
  const newProject = () => projectDialog({ onSaved: load });

  function card(p) {
    return h('li', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', {}, h('h2', {}, h('a', { href: `#/p/${p.id}` }, p.name)), h('p', { class: 'muted', text: p.client })),
        h('span', { class: `badge ${p.status}` }, PROJECT_STATUS[p.status])),
      h('div', {}, progressBar(p.progress, `${p.name} progress`),
        h('p', { class: 'muted', style: { 'margin-top': '6px', 'font-size': '.9rem' } }, `${p.progress}% · ${p.counts.done} of ${p.total} tasks done`)),
      h('div', { class: 'card-foot' }, h('span', { style: { 'font-size': '.9rem' } }, dueLabel(p.dueDate, p.status === 'completed')),
        h('div', { class: 'actions' },
          h('a', { class: 'btn btn-sm btn-primary', href: `#/p/${p.id}`, 'aria-label': `Open board for ${p.name}` }, 'Open board'),
          projectMenu(p, { onChange: load }))));
  }

  await load();
}
