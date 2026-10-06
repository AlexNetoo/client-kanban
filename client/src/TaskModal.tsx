import { useState } from "react";
import { Button, Select, TextArea, Text } from "./halaska-kit";
import { api } from "./api";
import { assigneeOptions } from "./dialogs";
import { LinkedTasks } from "./LinkedTasks";
import { Attachments } from "./Attachments";
import { PriorityChip } from "./chips";
import { EyeIcon, LockIcon, Person, WideModal, useToast, val } from "./ui";
import { useMe } from "./session";
import { usePalette } from "./theme";
import { formatDate, formatDateTime } from "./lib/format";
import { COLUMNS, PRIORITY, type Column, type Designer, type Priority, type Task } from "./types";

const COLUMN_OPTIONS = COLUMNS.map((c) => ({ value: c.id, label: c.label }));
const PRIORITY_OPTIONS = (Object.keys(PRIORITY) as Priority[]).map((p) => ({ value: p, label: PRIORITY[p] }));

/** Jira-style task view: content on the left, details on the right, everything scrollable. */
export function TaskModal({ task: t, projectName, designers, onClose, onChange, onMove, onEdit, onDelete }: {
  task: Task; projectName: string; designers: Designer[]; onClose: () => void;
  onChange: (t: Task) => void; onMove: (t: Task, s: Column) => void; onEdit: () => void; onDelete: () => void;
}) {
  const pal = usePalette();
  const toast = useToast();
  const me = useMe();
  const owner = me.role === "owner";
  const mine = t.assigneeId === me.designer?.id;
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const assignee = designers.find((d) => d.id === t.assigneeId);

  const patch = async (data: Parameters<typeof api.updateTask>[1], message: string) => {
    try { onChange(await api.updateTask(t.id, data)); toast(message); } catch (e) { toast((e as Error).message, "error"); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/#/p/${t.projectId}/t/${t.id}`); toast("Link copied"); }
    catch { toast("Couldn’t copy automatically. Copy the address bar instead.", "error"); }
  };
  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try { onChange(await api.addComment(t.id, { text })); setText(""); toast("Comment posted"); }
    catch (e) { toast((e as Error).message, "error"); } finally { setPosting(false); }
  };
  const removeComment = async (id: string) => {
    try { onChange(await api.deleteComment(t.id, id)); toast("Comment deleted"); } catch (e) { toast((e as Error).message, "error"); }
  };

  const h = (s: string) => <h3 style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, color: pal.textTertiary }}>{s}</h3>;
  // The kit's Select draws its own label; read-only values and the date input get one here.
  const row = (label: string, body: React.ReactNode, ownLabel = false) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      {!ownLabel && <span style={{ fontSize: 13, color: pal.textSecondary }}>{label}</span>}{body}
    </div>
  );

  return (
    <WideModal open onClose={onClose} label={`Task: ${t.title}`} header={<span>{projectName} <span aria-hidden="true">/</span> <span style={{ color: pal.text, fontWeight: 600 }}>Task</span></span>}>
      <div className="task-modal">
        <div className="task-main">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.25 }}>{t.title}</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="ghost" aria-label={`Copy link to ${t.title}`} onClick={copyLink}>Copy link</Button>
              {owner && <Button size="sm" variant="secondary" aria-label={`Edit task ${t.title}`} onClick={onEdit}>Edit</Button>}
              {owner && <Button size="sm" variant="secondary" aria-label={`Delete task ${t.title}`} onClick={onDelete}>Delete</Button>}
            </div>
          </div>

          <section aria-label="Description">
            {h("Description")}
            {t.description ? <p style={{ fontSize: 15, lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0 }}>{t.description}</p> : <Text size="sm" secondary>No description yet.</Text>}
          </section>

          <Attachments task={t} onChange={onChange} />

          <LinkedTasks task={t} onChange={onChange} />

          {t.clientUpdate && (
            <section aria-label="Client-visible update" style={{ border: `1px solid ${pal.text}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}><EyeIcon /> Client-visible update</div>
              <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6 }}>{t.clientUpdate}</p>
              {t.clientUpdateAt && <p style={{ margin: "6px 0 0", fontSize: 12, color: pal.textTertiary }}>Posted {formatDateTime(t.clientUpdateAt)}</p>}
            </section>
          )}
          {owner && t.privateNotes && (
            <section aria-label="Private notes" style={{ border: `2px dashed ${pal.textTertiary}`, borderRadius: 16, padding: 16, backgroundImage: `repeating-linear-gradient(135deg, transparent 0 6px, ${pal.borderSubtle} 6px 7px)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}><LockIcon /> Private notes · only you</div>
              <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6 }}>{t.privateNotes}</p>
            </section>
          )}

          <section aria-label="Comments">
            {h(`Comments (${t.comments.length})`)}
            <div style={{ display: "flex", gap: 12 }}>
              <Person name={owner ? "Freelancer" : me.designer?.name ?? "You"} size={32} />
              <form onSubmit={(e) => { e.preventDefault(); post(); }} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                <TextArea label={`Add a comment as ${owner ? "Freelancer" : me.designer?.name ?? "you"}`} rows={3} value={text} onChange={(e: never) => setText(val(e))}
                  aria-label={`Add a comment as ${owner ? "Freelancer" : me.designer?.name ?? "you"}`} caption="Internal only. Clients never see comments." />
                <div><Button type="button" size="sm" loading={posting} onClick={post}>Post comment</Button></div>
              </form>
            </div>
            {t.comments.length === 0
              ? <p style={{ marginTop: 16, fontSize: 14, color: pal.textSecondary }}>No comments yet.</p>
              : <ul style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 20 }}>
                {[...t.comments].reverse().map((c) => (
                  <li key={c.id} style={{ display: "flex", gap: 12 }}>
                    <Person name={c.authorName} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{c.authorName} <time dateTime={c.createdAt} style={{ fontWeight: 400, color: pal.textTertiary, fontSize: 12 }}>· {formatDateTime(c.createdAt)}</time></span>
                        {(owner || c.authorId === me.designer?.id) && <Button variant="ghost" size="sm" aria-label={`Delete comment by ${c.authorName}`} onClick={() => removeComment(c.id)}>Delete</Button>}
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.text}</p>
                    </div>
                  </li>
                ))}
              </ul>}
          </section>
        </div>

        <aside className="task-side" aria-label="Task details">
          {(owner || mine)
            ? <Select label="Status" value={t.status} onChange={(v: string) => (owner ? patch({ status: v as Column }, "Status updated") : onMove(t, v as Column))} options={COLUMN_OPTIONS} />
            : <div>{h("Status")}<Text>{COLUMNS.find((c) => c.id === t.status)?.label}</Text></div>}
          <div style={{ border: `1px solid ${pal.border}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700 }}>Details</h3>
            {row("Assignee", owner
              ? <Select label="Assignee" value={t.assigneeId} onChange={(v: string) => patch({ assigneeId: v }, v ? "Task assigned" : "Task unassigned")} options={assigneeOptions(designers)} />
              : assignee ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}><Person name={assignee.name} size={24} />{assignee.name}{mine ? " (you)" : ""}</span> : <Text size="sm" secondary>Unassigned</Text>, owner)}
            {row("Priority", owner
              ? <Select label="Priority" value={t.priority} onChange={(v: string) => patch({ priority: v as Priority }, "Priority updated")} options={PRIORITY_OPTIONS} />
              : <PriorityChip priority={t.priority} />, owner)}
            {row("Due date", owner
              ? <input type="date" aria-label="Due date" value={t.dueDate} onChange={(e) => patch({ dueDate: e.target.value }, "Due date updated")}
                style={{ font: "inherit", fontSize: 14, color: pal.text, background: pal.bgInput, border: `1px solid ${pal.border}`, borderRadius: 12, padding: "8px 10px", width: "100%" }} />
              : <span style={{ fontSize: 14 }}>{t.dueDate ? formatDate(t.dueDate) : "No due date"}</span>)}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: pal.textTertiary, lineHeight: 1.7 }}>
            Created {formatDateTime(t.createdAt)}<br />Updated {formatDateTime(t.updatedAt)}
          </p>
        </aside>
      </div>
    </WideModal>
  );
}
