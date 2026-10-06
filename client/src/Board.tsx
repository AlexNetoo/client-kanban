import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Badge, Button, Card, DropdownMenu, Heading, Progress, Text } from "./halaska-kit";
import { api } from "./api";
import { TaskDialog } from "./dialogs";
import { DueLabel, ProjectMenu } from "./Dashboard";
import { ConfirmDialog, EyeIcon, Loading, LockIcon, PlusIcon, StateBlock, useToast } from "./ui";
import { usePalette } from "./theme";
import { COLUMNS, PRIORITY, PROJECT_STATUS, columnLabel, type Column, type Project, type Task } from "./types";

export function Board({ id }: { id: string }) {
  const pal = usePalette();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [editing, setEditing] = useState<{ task?: Task; status?: Column } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [dropCol, setDropCol] = useState<Column | null>(null);
  const dragId = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const focusTask = (taskId?: string) => setTimeout(() => root.current?.querySelector<HTMLElement>(`[data-task-id="${taskId}"] .task-title`)?.focus(), 0);

  const load = useCallback(async (focus?: string) => {
    try {
      const d = await api.getProject(id);
      setProject(d.project); setTasks(d.tasks); setError(null);
      document.title = `${d.project.name} · Project Hub`;
      if (focus) focusTask(focus);
    } catch (e) { setError({ status: (e as { status?: number }).status ?? 0, message: (e as Error).message }); }
  }, [id]);
  useEffect(() => { setProject(null); load(); }, [load]);

  /** Optimistic move; reload on failure so the UI never lies. */
  const move = async (task: Task, status: Column, position?: number) => {
    const before = tasks;
    const rest = tasks.filter((t) => t.id !== task.id);
    const col = rest.filter((t) => t.status === status);
    const moved = { ...task, status };
    let next: Task[];
    if (position === undefined || position >= col.length) {
      const last = col[col.length - 1];
      const at = last ? rest.indexOf(last) + 1 : rest.length;
      next = [...rest.slice(0, at), moved, ...rest.slice(at)];
    } else {
      const at = rest.indexOf(col[position]);
      next = [...rest.slice(0, at), moved, ...rest.slice(at)];
    }
    setTasks(next);
    setProject((p) => p && recount(p, next));
    focusTask(task.id);
    try {
      await api.updateTask(task.id, { status, ...(position !== undefined ? { position } : {}) });
      toast(`Moved “${task.title}” to ${columnLabel(status)}`);
    } catch (e) { setTasks(before); toast((e as Error).message, "error"); load(task.id); }
  };

  if (error) return (
    <>
      <p style={{ marginBottom: 16 }}><a href="#/">← All projects</a></p>
      <StateBlock title={error.status === 404 ? "Project not found" : "Couldn’t load this project"} description={error.message}
        action={error.status === 404 ? undefined : <Button onClick={() => load()}>Try again</Button>} />
    </>
  );
  if (!project) return <Loading rows={1} />;

  const onDrop = (e: DragEvent<HTMLUListElement>, col: Column) => {
    e.preventDefault(); setDropCol(null);
    const task = tasks.find((t) => t.id === dragId.current);
    if (!task) return;
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>(".task:not(.dragging)")];
    const position = cards.filter((c) => e.clientY > c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2).length;
    move(task, col, position);
  };

  return (
    <div ref={root}>
      <a href="#/" style={{ display: "inline-block", marginBottom: 14, color: pal.textSecondary, fontSize: 14 }}>← All projects</a>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
        <div>
          <Heading level={1}>{project.name}</Heading>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", marginTop: 10, color: pal.textSecondary, fontSize: 14 }}>
            <span>{project.client}</span><Badge>{PROJECT_STATUS[project.status]}</Badge>
            <DueLabel date={project.dueDate} done={project.status === "completed"} />
            {project.archived && <Badge>Archived</Badge>}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Button icon={<PlusIcon />} onClick={() => setEditing({ status: "todo" })}>Add task</Button>
          <Button variant="secondary" icon={<EyeIcon />} onClick={() => { location.hash = `#/c/${project.shareToken}`; }}>Client view</Button>
          <ProjectMenu project={project} onChange={() => load()} afterDelete={() => { location.hash = "#/"; }} />
        </div>
      </div>

      <div style={{ maxWidth: 480, marginBottom: 28 }}>
        <Progress value={project.progress} />
        <p style={{ marginTop: 8, fontSize: 13, color: pal.textSecondary }}>{project.progress}% complete · {project.counts.done} of {project.total} tasks done</p>
      </div>

      {project.total === 0 && <div style={{ marginBottom: 20 }}><StateBlock title="No tasks yet" description="Add the first task to start this board." action={<Button onClick={() => setEditing({ status: "todo" })}>Add task</Button>} /></div>}

      <div className="board" role="group" aria-label="Kanban board">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.id);
          return (
            <section key={col.id} className="column" aria-labelledby={`col-${col.id}`}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${pal.text}` }}>
                <h2 id={`col-${col.id}`} style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700 }}>
                  {col.label} <span aria-label={`${items.length} tasks`} style={{ color: pal.textTertiary, marginLeft: 6 }}>{items.length}</span>
                </h2>
                <Button variant="ghost" size="sm" icon={<PlusIcon />} aria-label={`Add task to ${col.label}`} onClick={() => setEditing({ status: col.id })}>Add</Button>
              </div>
              <ul className={`cards${dropCol === col.id ? " drop-target" : ""}`} aria-labelledby={`col-${col.id}`}
                onDragOver={(e) => { if (dragId.current) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropCol(col.id); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropCol(null); }}
                onDrop={(e) => onDrop(e, col.id)}>
                {items.map((t) => (
                  <li key={t.id} className="task" data-task-id={t.id} draggable
                    onDragStart={(e) => { dragId.current = t.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); e.currentTarget.classList.add("dragging"); }}
                    onDragEnd={(e) => { dragId.current = null; setDropCol(null); e.currentTarget.classList.remove("dragging"); }}>
                    <Card padding={14} style={{ display: "flex", flexDirection: "column", gap: 10, cursor: "grab" }}>
                      <button type="button" className="task-title" onClick={() => setEditing({ task: t })}
                        style={{ all: "unset", cursor: "pointer", fontWeight: 600, fontSize: 14, lineHeight: 1.4, color: pal.text }}>{t.title}</button>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12, color: pal.textSecondary }}>
                        <span style={t.priority === "high" ? { background: pal.text, color: pal.bg, borderRadius: 8, padding: "3px 8px", fontWeight: 600, fontSize: 10, letterSpacing: 0.3, textTransform: "uppercase" } : undefined}>
                          {t.priority === "high" ? `${PRIORITY[t.priority]} priority` : <Badge>{PRIORITY[t.priority]} priority</Badge>}
                        </span>
                        {t.dueDate && <DueLabel date={t.dueDate} done={t.status === "done"} />}
                        {t.clientUpdate && <Badge><EyeIcon /> Client update</Badge>}
                        {t.privateNotes && <span title="Private notes: only you can see them" style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px dashed ${pal.textTertiary}`, borderRadius: 8, padding: "2px 8px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}><LockIcon /> Private note</span>}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <DropdownMenu
                          trigger={<Button variant="ghost" size="sm" aria-label={`Move “${t.title}” to another column`}>Move to…</Button>}
                          items={COLUMNS.filter((c) => c.id !== t.status).map((c) => ({ label: c.label, onClick: () => move(t, c.id) }))} />
                      </div>
                    </Card>
                  </li>
                ))}
                {items.length === 0 && <li style={{ fontSize: 13, color: pal.textTertiary, textAlign: "center", padding: 16, border: `1px dashed ${pal.border}`, borderRadius: 14 }}>Nothing here yet</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {editing && (
        <TaskDialog projectId={id} task={editing.task} defaultStatus={editing.status} onClose={() => setEditing(null)}
          onSaved={(t) => load(t.id)} onDelete={(t) => { setEditing(null); setDeleting(t); }} />
      )}
      <ConfirmDialog open={!!deleting} title="Delete this task?" description={deleting ? `“${deleting.title}” will be permanently removed.` : ""} onClose={() => setDeleting(null)}
        onConfirm={async () => { if (deleting) { await api.deleteTask(deleting.id); toast("Task deleted"); load(); } }} />
    </div>
  );
}

function recount(p: Project, tasks: Task[]): Project {
  const counts = Object.fromEntries(COLUMNS.map((c) => [c.id, 0])) as Record<Column, number>;
  tasks.forEach((t) => { counts[t.status] += 1; });
  return { ...p, counts, total: tasks.length, progress: tasks.length ? Math.round((counts.done / tasks.length) * 100) : 0 };
}
