import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Select, Text } from "./halaska-kit";
import { api } from "./api";
import { Area, Text1 } from "./fields";
import { EyeIcon, LockIcon, Modal, useToast } from "./ui";
import { usePalette } from "./theme";
import { COLUMNS, PRIORITY, PROJECT_STATUS, type Column, type Designer, type Priority, type Project, type ProjectStatus, type Task } from "./types";

const toOptions = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

export const assigneeOptions = (designers: Designer[]) => [{ value: "", label: "Unassigned" }, ...designers.map((d) => ({ value: d.id, label: d.name }))];

function Form({ onSubmit, error, children }: { onSubmit: () => void; error: string; children: ReactNode }) {
  const pal = usePalette();
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {error}</p>}
      {children}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  );
}

function useSave(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await work(); onDone(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

export function ProjectDialog({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(project?.name ?? "");
  const [client, setClient] = useState(project?.client ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [dueDate, setDue] = useState(project?.dueDate ?? "");
  const [summary, setSummary] = useState(project?.summary ?? "");
  const { busy, error, run } = useSave(onClose);
  const save = () => run(async () => {
    const data = { name, client, status, dueDate, summary };
    if (project) await api.updateProject(project.id, data); else await api.createProject(data);
    toast(project ? "Project updated" : "Project created");
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={project ? "Edit project" : "New project"}
      actions={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>{project ? "Save changes" : "Create project"}</Button></>}>
      <Form onSubmit={save} error={error}>
        <Text1 label="Project name" required value={name} onChange={setName} />
        <Text1 label="Client" required value={client} onChange={setClient} />
        <div className="row2">
          <Select label="Status" value={status} onChange={(v: string) => setStatus(v as ProjectStatus)} options={toOptions(PROJECT_STATUS)} />
          <Text1 label="Due date" type="date" value={dueDate} onChange={setDue} />
        </div>
        <Area label="Summary (visible to the client)" value={summary} onChange={setSummary} />
      </Form>
    </Modal>
  );
}

/** Client-visible = solid frame + eye. Private = dashed, hatched frame + lock. Distinct without relying on colour. */
function Callout({ kind, title, note, children }: { kind: "client" | "private"; title: string; note: string; children: ReactNode }) {
  const pal = usePalette();
  const client = kind === "client";
  return (
    <section aria-label={title} style={{
      border: client ? `1px solid ${pal.text}` : `2px dashed ${pal.textTertiary}`, borderRadius: 16, padding: 14,
      display: "flex", flexDirection: "column", gap: 8,
      backgroundImage: client ? "none" : `repeating-linear-gradient(135deg, transparent 0 6px, ${pal.borderSubtle} 6px 7px)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>{client ? <EyeIcon /> : <LockIcon />}{title}</div>
      <Text size="sm" secondary>{note}</Text>
      {children}
    </section>
  );
}

export function TaskDialog({ projectId, task, designers, defaultStatus = "backlog", onClose, onSaved, onDelete }: {
  projectId: string; task?: Task; designers: Designer[]; defaultStatus?: Column; onClose: () => void; onSaved: (t: Task) => void; onDelete?: (t: Task) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Column>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [dueDate, setDue] = useState(task?.dueDate ?? "");
  const [assigneeId, setAssignee] = useState(task?.assigneeId ?? "");
  const [clientUpdate, setClientUpdate] = useState(task?.clientUpdate ?? "");
  const [privateNotes, setPrivate] = useState(task?.privateNotes ?? "");
  const { busy, error, run } = useSave(onClose);
  const save = () => run(async () => {
    const data = { title, description, status, priority, dueDate, clientUpdate, privateNotes, assigneeId };
    const saved = task ? await api.updateTask(task.id, data) : await api.createTask(projectId, data);
    toast(task ? "Task saved" : "Task added");
    onSaved(saved);
  });
  return (
    <Modal open onClose={onClose} title={task ? "Edit task" : "New task"}
      actions={<>
        {task && onDelete && <Button variant="secondary" size="sm" onClick={() => onDelete(task)}>Delete</Button>}
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={busy} onClick={save}>{task ? "Save task" : "Add task"}</Button>
      </>}>
      <Form onSubmit={save} error={error}>
        <Text1 label="Title" required value={title} onChange={setTitle} />
        <Area label="Description" value={description} onChange={setDescription} />
        <div className="row2">
          <Select label="Status" value={status} onChange={(v: string) => setStatus(v as Column)} options={COLUMNS.map((c) => ({ value: c.id, label: c.label }))} />
          <Select label="Priority" value={priority} onChange={(v: string) => setPriority(v as Priority)} options={toOptions(PRIORITY)} />
        </div>
        <div className="row2">
          <Text1 label="Due date" type="date" value={dueDate} onChange={setDue} />
          <Select label="Assigned designer" value={assigneeId} onChange={(v: string) => setAssignee(v)} options={assigneeOptions(designers)} />
        </div>
        <Callout kind="client" title="Client-visible update" note="Shown to your client in their view.">
          <Area label="Update for the client" value={clientUpdate} onChange={setClientUpdate} />
        </Callout>
        <Callout kind="private" title="Private notes" note="Only you can see this. Never sent to clients.">
          <Area label="Private notes" value={privateNotes} onChange={setPrivate} />
        </Callout>
      </Form>
    </Modal>
  );
}
