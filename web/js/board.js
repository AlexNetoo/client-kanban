import { h, icon, dueLabel, progressBar, stateBlock, skeletons, toast, formatDate } from './dom.js';
import { api } from './api.js';
import { COLUMNS, columnLabel, PROJECT_STATUS, PRIORITY, taskDialog } from './dialogs.js';
import { projectMenu } from './dashboard.js';

export async function boardView(main, id) {
  let project;
  let tasks = [];
  let dragId = null;

  async function load(focusTask) {
    if (!project) main.replaceChildren(skeletons(1));
    try {
      const data = await api.getProject(id);
      project = data.project; tasks = data.tasks;
    } catch (e) {
      main.replaceChildren(h('p', {}, h('a', { href: '#/' }, '← All projects')),
        stateBlock({ title: e.status === 404 ? 'Project not found' : 'Couldn’t load this project', message: e.message, action: e.status === 404 ? null : () => load(), label: 'Try again' }));
      return;
    }
    document.title = `${project.name} · Project Hub`;
    render();
    if (focusTask) main.querySelector(`[data-task-id="${focusTask}"] .task-title`)?.focus();
  }

  function refreshStats() {
    const counts = Object.fromEntries(COLUMNS.map((c) => [c.id, 0]));
    tasks.forEach((t) => { counts[t.status] += 1; });
    project = { ...project, counts, total: tasks.length, progress: tasks.length ? Math.round((counts.done / tasks.length) * 100) : 0 };
  }

  // Optimistic move, then persist; reload on failure so the UI never lies.
  async function move(task, status, position) {
    const before = tasks.slice();
    const idx = tasks.indexOf(task);
    tasks.splice(idx, 1);
    task.status = status;
    const col = tasks.filter((t) => t.status === status);
    if (position === undefined || position >= col.length) {
      const last = col[col.length - 1];
      tasks.splice(last ? tasks.indexOf(last) + 1 : tasks.length, 0, task);
    } else tasks.splice(tasks.indexOf(col[position]), 0, task);
    refreshStats();
    render();
    main.querySelector(`[data-task-id="${task.id}"] .task-title`)?.focus();
    try {
      await api.updateTask(task.id, { status, ...(position !== undefined ? { position } : {}) });
      toast(`Moved “${task.title}” to ${columnLabel(status)}`);
    } catch (e) {
      tasks = before;
      toast(e.message, 'error');
      load(task.id);
    }
  }

  const openTask = (task, defaultStatus) => taskDialog({
    projectId: id, task, defaultStatus,
    onSaved: (saved) => load(saved.id), onDeleted: () => load(),
  });

  function taskCard(t) {
    return h('li', {
      class: 'task', draggable: 'true', dataset: { taskId: t.id },
      ondragstart: (e) => { dragId = t.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); e.currentTarget.classList.add('dragging'); },
      ondragend: (e) => { dragId = null; e.currentTarget.classList.remove('dragging'); main.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target')); },
    },
    h('button', { class: 'task-title', type: 'button', onclick: () => openTask(t), text: t.title }),
    h('div', { class: 'task-meta' },
      h('span', { class: `badge ${t.priority}` }, `${PRIORITY[t.priority]} priority`),
      t.dueDate && h('span', {}, dueLabel(t.dueDate, t.status === 'done')),
      t.clientUpdate && h('span', { class: 'badge visible', title: 'Has a client-visible update' }, icon('eye'), 'Client update'),
      t.privateNotes && h('span', { class: 'badge private', title: 'Has private notes (only you can see them)' }, icon('lock'), 'Private note')),
    h('select', {
      'aria-label': `Move “${t.title}” to column`,
      onchange: (e) => move(t, e.target.value),
    }, ...COLUMNS.map((c) => h('option', { value: c.id, selected: c.id === t.status }, c.id === t.status ? `Column: ${c.label}` : `Move to ${c.label}`))));
  }

  function dropIndex(list, y) {
    const cards = [...list.querySelectorAll('.task:not(.dragging)')];
    let i = 0;
    for (const c of cards) { const r = c.getBoundingClientRect(); if (y > r.top + r.height / 2) i += 1; }
    return i;
  }

  function column(col) {
    const items = tasks.filter((t) => t.status === col.id);
    const list = h('ul', {
      class: 'cards', 'aria-labelledby': `col-${col.id}`,
      ondragover: (e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; list.classList.add('drop-target'); } },
      ondragleave: (e) => { if (!list.contains(e.relatedTarget)) list.classList.remove('drop-target'); },
      ondrop: (e) => {
        e.preventDefault();
        list.classList.remove('drop-target');
        const task = tasks.find((t) => t.id === dragId);
        if (task) move(task, col.id, dropIndex(list, e.clientY));
      },
    }, ...items.map(taskCard));
    if (!items.length) list.append(h('li', { class: 'empty-col', text: 'Nothing here yet' }));
    return h('section', { class: 'column' },
      h('div', { class: 'column-head' },
        h('h2', { id: `col-${col.id}` }, col.label, h('span', { class: 'count', 'aria-label': `${items.length} tasks`, text: items.length })),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': `Add task to ${col.label}`, onclick: () => openTask(null, col.id) }, icon('plus'), 'Add')),
      list);
  }

  function render() {
    const p = project;
    main.replaceChildren(...[
      h('p', {}, h('a', { href: '#/' }, '← All projects')),
      h('div', { class: 'page-head' },
        h('div', {}, h('h1', { text: p.name }),
          h('div', { class: 'meta' }, h('span', { text: p.client }), h('span', { class: `badge ${p.status}` }, PROJECT_STATUS[p.status]), dueLabel(p.dueDate, p.status === 'completed'),
            p.archived && h('span', { class: 'badge', text: 'Archived' }))),
        h('div', { class: 'actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openTask(null, 'todo') }, icon('plus'), 'Add task'),
          h('a', { class: 'btn', href: `#/c/${p.shareToken}` }, icon('eye'), 'Client view'),
          projectMenu(p, { onChange: () => load(), afterDelete: () => { location.hash = '#/'; } }))),
      h('div', { style: { 'max-width': '480px', 'margin-bottom': '20px' } }, progressBar(p.progress, 'Project progress'),
        h('p', { class: 'muted', style: { 'font-size': '.9rem', 'margin-top': '6px' }, text: `${p.progress}% complete · ${p.counts.done} of ${p.total} tasks done` })),
      p.total === 0 && stateBlock({ title: 'No tasks yet', message: 'Add the first task to start this board.', action: () => openTask(null, 'todo'), label: 'Add task' }),
      h('div', { class: 'board', role: 'group', 'aria-label': 'Kanban board' }, ...COLUMNS.map(column)),
    ].filter(Boolean));
  }

  await load();
}
