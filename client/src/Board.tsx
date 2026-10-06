import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Badge, Button, Heading, Progress } from "./halaska-kit";
import { api } from "./api";
import { TaskDialog } from "./dialogs";
import { Assistant } from "./Assistant";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import { StatusChip } from "./chips";
import { useProjectsNav } from "./nav";
import { DueLabel, ProjectMenu } from "./Dashboard";
import { ConfirmDialog, EyeIcon, SparkIcon, Loading, LockIcon, PlusIcon, StateBlock, useToast } from "./ui";
import { usePalette } from "./theme";
import { useMe } from "./session";
import { COLUMNS, columnLabel, type Column, type Designer, type Project, type Task } from "./types";

export function Board({ id, taskId }: { id: string; taskId?: string }) {
  const pal = usePalette();
  const me = useMe();
  const owner = me.role === "owner";
  const canAdd = me.role !== "client"; // the admin and designers add tasks; clients only read and comment
  const canMove = (_t: Task) => me.role !== "client"; // admin and designers can move any task in the project
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [editing, setEditing] = useState<{ task?: Task; status?: Column } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [designers, setDesigners] = useState<Designer[]>([]);
  // The open task lives in the address (#/p/<project>/t/<task>): links work, Back closes it, and it can be shared.
  const viewingId = taskId ?? null;
  const openTask = (tid: string) => { location.hash = `#/p/${id}/t/${tid}`; };
  const closeTask = () => { location.hash = `#/p/${id}`; };
  const nav = useProjectsNav();
  const [dropCol, setDropCol] = useState<Column | null>(null);
  const [dropBefore, setDropBefore] = useState<string>("end"); // the card the dragged one would land above, or "end"
  const dragId = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const focusTask = (taskId?: string) => setTimeout(() => root.current?.querySelector<HTMLElement>(`[data-task-id="${taskId}"] .task-title`)?.focus(), 0);

  const load = useCallback(async (focus?: string) => {
    try {
      const d = await api.getProject(id);
      setProject(d.project); setTasks(d.tasks); setError(null); nav.reload();
      document.title = `${d.project.name} · Alex Neto - Client Portal`;
      if (focus) focusTask(focus);
    } catch (e) { setError({ status: (e as { status?: number }).status ?? 0, message: (e as Error).message }); }
  }, [id]);
  useEffect(() => { setProject(null); load(); }, [load]);
  const loadDesigners = useCallback(() => { api.listDesigners().then(setDesigners).catch(() => {}); }, []);
  useEffect(() => { loadDesigners(); }, [loadDesigners]);
  const replaceTask = (t: Task) => setTasks((s) => s.map((x) => (x.id === t.id ? t : x)));

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
      toast(status === task.status ? `Reordered “${task.title}”` : `Moved “${task.title}” to ${columnLabel(status)}`);
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

  /** Where a drag at this height would land: the card it would sit above (or "end") and its index among the other cards. */
  const dropTarget = (list: HTMLElement, y: number) => {
    const cards = [...list.querySelectorAll<HTMLElement>(".task:not(.dragging)")];
    const idx = cards.findIndex((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return { before: idx === -1 ? "end" : cards[idx].dataset.taskId!, position: idx === -1 ? cards.length : idx };
  };
  const onDrop = (e: DragEvent<HTMLUListElement>, col: Column) => {
    e.preventDefault(); setDropCol(null);
    const task = tasks.find((t) => t.id === dragId.current);
    if (!task || !canMove(task)) return;
    move(task, col, dropTarget(e.currentTarget, e.clientY).position);
  };

  return (
    <div ref={root}>
      <a href="#/" style={{ display: "inline-block", marginBottom: 14, color: pal.textSecondary, fontSize: 14 }}>← {owner ? "All projects" : "My projects"}</a>
      {!owner && <p style={{ marginBottom: 14, fontSize: 14, color: pal.textSecondary }}>{me.role === "client" ? "You’re viewing this board. Open a task to read the details and leave a comment." : "You can add tasks, move your own between columns and comment on any task here."}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
        <div>
          <Heading level={1}>{project.name}</Heading>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", marginTop: 10, color: pal.textSecondary, fontSize: 14 }}>
            <span>{project.client}</span><StatusChip status={project.status} />
            <DueLabel date={project.dueDate} recurring={project.recurring} done={project.status === "completed"} />
            {project.archived && <Badge>Archived</Badge>}
          </div>
        </div>
        {canAdd && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Button icon={<PlusIcon />} onClick={() => setEditing({ status: "todo" })}>Add task</Button>
          <Button variant="secondary" icon={<SparkIcon />} onClick={() => setAssistantOpen(true)}>AI assistant</Button>
          {owner && <>
          <Button variant="secondary" icon={<EyeIcon />} onClick={() => { location.hash = `#/c/${project.shareToken}`; }}>Client view</Button>
          <Button variant="secondary" onClick={() => { location.href = "/admin"; }}>Admin console</Button>
          <ProjectMenu project={project} onChange={() => load()} afterDelete={() => { location.hash = "#/"; }} />
          </>}
        </div>}
      </div>

      <div style={{ maxWidth: 480, marginBottom: 28 }}>
        <Progress value={project.progress} />
        <p style={{ marginTop: 8, fontSize: 13, color: pal.textSecondary }}>{project.progress}% complete · {project.counts.done} of {project.total} tasks done</p>
      </div>

      {canAdd && project.total === 0 && <div style={{ marginBottom: 20 }}><StateBlock title="No tasks yet" description="Add the first task to start this board." action={<Button onClick={() => setEditing({ status: "todo" })}>Add task</Button>} /></div>}

      <div className="board" role="group" aria-label="Kanban board">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.id);
          return (
            <section key={col.id} className="column" aria-labelledby={`col-${col.id}`}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${pal.text}` }}>
                <h2 id={`col-${col.id}`} style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700 }}>
                  {col.label} <span aria-label={`${items.length} tasks`} style={{ color: pal.textTertiary, marginLeft: 6 }}>{items.length}</span>
                </h2>
                {canAdd && <Button variant="ghost" size="sm" icon={<PlusIcon />} aria-label={`Add task to ${col.label}`} onClick={() => setEditing({ status: col.id })}>Add</Button>}
              </div>
              <ul className={`cards${dropCol === col.id ? " drop-target" : ""}${dropCol === col.id && dropBefore === "end" ? " drop-end" : ""}`} aria-labelledby={`col-${col.id}`}
                onDragOver={(e) => { if (dragId.current) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropCol(col.id); setDropBefore(dropTarget(e.currentTarget, e.clientY).before); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropCol(null); }}
                onDrop={(e) => onDrop(e, col.id)}>
                {items.map((t) => (
                  <li key={t.id} className={`task${dropCol === col.id && dropBefore === t.id && dragId.current !== t.id ? " drop-before" : ""}`} data-task-id={t.id} draggable={canMove(t)}
                    onDragStart={(e) => { dragId.current = t.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); e.currentTarget.classList.add("dragging"); }}
                    onDragEnd={(e) => { dragId.current = null; setDropCol(null); e.currentTarget.classList.remove("dragging"); }}>
                    <TaskCard task={t} designers={designers} onOpen={() => openTask(t.id)} onEdit={() => setEditing({ task: t })} onMove={(s) => move(t, s)}
                      onReorder={(dir) => { const at = items.indexOf(t) + dir; if (at >= 0 && at < items.length) move(t, t.status, at); }} canUp={items.indexOf(t) > 0} canDown={items.indexOf(t) < items.length - 1} />
                  </li>
                ))}
                {items.length === 0 && <li style={{ fontSize: 13, color: pal.textTertiary, textAlign: "center", padding: 16, border: `1px dashed ${pal.border}`, borderRadius: 14 }}>Nothing here yet</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {assistantOpen && <Assistant projectId={id} designers={designers} enabled={!!me.ai} isAdmin={owner} onClose={() => setAssistantOpen(false)} onApplied={() => load()} />}
      {editing && (
        <TaskDialog projectId={id} task={editing.task} designers={designers} defaultStatus={editing.status} onClose={() => setEditing(null)}
          onSaved={(t) => load(t.id)} onDelete={(t) => { setEditing(null); setDeleting(t); }} />
      )}
      {viewingId && tasks.find((x) => x.id === viewingId) && (
        <TaskModal task={tasks.find((x) => x.id === viewingId)!} projectName={project.name} designers={designers} onClose={closeTask}
          onChange={replaceTask} onMove={(t, s) => move(t, s)}
          onEdit={() => { const t = tasks.find((x) => x.id === viewingId)!; closeTask(); setEditing({ task: t }); }}
          onDelete={() => { const t = tasks.find((x) => x.id === viewingId)!; closeTask(); setDeleting(t); }} />
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
