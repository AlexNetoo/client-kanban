import { h, icon, openDialog, confirmDialog, toast } from './dom.js';
import { api } from './api.js';

export const COLUMNS = [
  { id: 'backlog', label: 'Backlog' }, { id: 'todo', label: 'To do' }, { id: 'in_progress', label: 'In progress' },
  { id: 'in_review', label: 'In review' }, { id: 'done', label: 'Done' },
];
export const columnLabel = (id) => COLUMNS.find((c) => c.id === id)?.label || id;
export const PROJECT_STATUS = { planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed' };
export const PRIORITY = { low: 'Low', medium: 'Medium', high: 'High' };

let uid = 0;
function field(label, control, hint) {
  const id = `f${++uid}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label, hint && h('span', { class: 'hint' }, ' ', hint)), control);
}
const options = (map, selected) => Object.entries(map).map(([v, l]) => h('option', { value: v, selected: v === selected }, l));

// Shared submit handling: disables the button, shows server errors inline.
function submitHandler(errEl, saveBtn, work, close) {
  return async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    saveBtn.disabled = true;
    try { await work(); close(); } catch (ex) { errEl.textContent = ex.message; saveBtn.disabled = false; }
  };
}

export function projectDialog({ project, onSaved }) {
  const editing = !!project;
  return openDialog((close) => {
    const err = h('div', { class: 'form-error', role: 'alert' });
    const name = h('input', { type: 'text', required: true, maxlength: 120, value: project?.name || '', autocomplete: 'off' });
    const client = h('input', { type: 'text', required: true, maxlength: 120, value: project?.client || '', autocomplete: 'off' });
    const status = h('select', {}, ...options(PROJECT_STATUS, project?.status || 'active'));
    const due = h('input', { type: 'date', value: project?.dueDate || '' });
    const summary = h('textarea', { maxlength: 1000 }, project?.summary || '');
    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, editing ? 'Save changes' : 'Create project');
    return h('form', {
      onsubmit: submitHandler(err, save, async () => {
        const data = { name: name.value, client: client.value, status: status.value, dueDate: due.value, summary: summary.value };
        const saved = editing ? await api.updateProject(project.id, data) : await api.createProject(data);
        toast(editing ? 'Project updated' : 'Project created');
        onSaved(saved);
      }, close),
    },
    h('h2', { text: editing ? 'Edit project' : 'New project' }), err,
    field('Project name', name), field('Client', client),
    h('div', { class: 'row' }, field('Status', status), field('Due date', due)),
    field('Summary', summary, '(visible to the client)'),
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), save));
  });
}

export function taskDialog({ projectId, task, defaultStatus = 'backlog', onSaved, onDeleted }) {
  const editing = !!task;
  return openDialog((close) => {
    const err = h('div', { class: 'form-error', role: 'alert' });
    const title = h('input', { type: 'text', required: true, maxlength: 160, value: task?.title || '', autocomplete: 'off' });
    const description = h('textarea', { maxlength: 2000 }, task?.description || '');
    const status = h('select', {}, ...COLUMNS.map((c) => h('option', { value: c.id, selected: c.id === (task?.status || defaultStatus) }, c.label)));
    const priority = h('select', {}, ...options(PRIORITY, task?.priority || 'medium'));
    const due = h('input', { type: 'date', value: task?.dueDate || '' });
    const clientUpdate = h('textarea', { maxlength: 1000 }, task?.clientUpdate || '');
    const privateNotes = h('textarea', { maxlength: 2000 }, task?.privateNotes || '');
    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, editing ? 'Save task' : 'Add task');

    const clientBox = h('div', { class: 'callout client' },
      field(h('span', { class: 'label', style: { display: 'inline-flex', gap: '6px', 'align-items': 'center', margin: 0 } }, icon('eye'), 'Client-visible update'), clientUpdate,
        '— shown to your client'));
    const privateBox = h('div', { class: 'callout private' },
      field(h('span', { style: { display: 'inline-flex', gap: '6px', 'align-items': 'center' } }, icon('lock'), 'Private notes'), privateNotes,
        '— only you can see this'));

    return h('form', {
      onsubmit: submitHandler(err, save, async () => {
        const data = {
          title: title.value, description: description.value, status: status.value, priority: priority.value,
          dueDate: due.value, clientUpdate: clientUpdate.value, privateNotes: privateNotes.value,
        };
        const saved = editing ? await api.updateTask(task.id, data) : await api.createTask(projectId, data);
        toast(editing ? 'Task saved' : 'Task added');
        onSaved(saved);
      }, close),
    },
    h('h2', { text: editing ? 'Edit task' : 'New task' }), err,
    field('Title', title), field('Description', description),
    h('div', { class: 'row' }, field('Status', status), field('Priority', priority)),
    field('Due date', due),
    clientBox, privateBox,
    h('div', { class: 'dialog-actions' },
      editing && h('button', {
        class: 'btn btn-danger', type: 'button',
        onclick: () => { close(); confirmDialog({ title: 'Delete this task?', message: `“${task.title}” will be permanently removed.`, onConfirm: async () => { await api.deleteTask(task.id); toast('Task deleted'); onDeleted(task); } }); },
      }, 'Delete'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), save));
  });
}
