import { useState } from "react";
import { DateField } from "./fields";
import { Linkify } from "./Linkify";
import { Button, Checkbox, Select, TextArea, Text } from "./halaska-kit";
import { api } from "./api";
import { assigneeOptions } from "./dialogs";
import { LinkedTasks } from "./LinkedTasks";
import { Attachments } from "./Attachments";
import { WebLinks } from "./WebLinks";
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
  const canEdit = me.role !== "client"; // the admin and designers edit; clients read and comment
  const isClient = me.role === "client";
  const who = owner ? "Admin" : me.designer?.name ?? me.client?.name ?? "you";
  const mine = t.assigneeId === me.designer?.id;
  const [text, setText] = useState("");
  const [shared, setShared] = useState(false); // admin/designers: share this comment with the client
  const [posting, setPosting] = useState(false);
  const assignee = designers.find((d) => d.id === t.assigneeId);

  const patch = async (data: Parameters<typeof api.updateTask>[1], message: string) => {
    try { onChange(await api.updateTask(t.id, data)); toast(message); } catch (e) { toast((e as Error).message, "error"); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname.replace(/\/$/, "")}#/p/${t.projectId}/t/${t.id}`); toast("Link copied"); }
    catch { toast("Couldn’t copy automatically. Copy the address bar instead.", "error"); }
  };
  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try { onChange(await api.addComment(t.id, { text, shared })); setText(""); setShared(false); toast("Comment posted"); }
    catch (e) { toast((e as Error).message, "error"); } finally { setPosting(false); }
  };
  const removeComment = async (id: string) => {
    try { onChange(await api.deleteComment(t.id, id)); toast("Comment deleted"); } catch (e) { toast((e as Error).message, "error"); }
  };

  const statusLabel = COLUMNS.find((c) => c.id === t.status)?.label;
  // The kit's Select draws its own label; read-only values and the date input get one here.
  const row = (label: string, body: React.ReactNode, ownLabel = false) => (
    <div className="task-field">
      {!ownLabel && <span className="task-field__label">{label}</span>}{body}
    </div>
  );
  const comments = t.comments; // oldest first, the newest right above the box you type in

  return (
    <WideModal open onClose={onClose} label={`Task: ${t.title}`}
      header={<span>{projectName}</span>}
      actions={<>
        <Button size="sm" variant="ghost" aria-label="Copy a link to this task" title="Copy a link to this task" onClick={copyLink}>Copy link</Button>
        {canEdit && <Button size="sm" variant="ghost" aria-label={`Edit task ${t.title}`} onClick={onEdit}>Edit</Button>}
        {canEdit && <Button size="sm" variant="ghost" aria-label={`Delete task ${t.title}`} onClick={onDelete}>Delete</Button>}
      </>}>
      <div className="task-modal">
        <h2 className="task-head">{t.title}</h2>

        <div className="task-main">
          <section aria-label="Description">
            <h3 className="sec-h">Description</h3>
            {t.description
              ? <p style={{ fontSize: 15, lineHeight: 1.65, whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}><Linkify text={t.description} /></p>
              : canEdit
                ? <button type="button" className="task-empty" onClick={onEdit}>Add a description</button>
                : <Text size="sm" secondary>No description yet.</Text>}
          </section>

          {t.clientUpdate && (
            <section aria-label="Client-visible update" className="task-note" style={{ background: pal.bgSubtle, borderColor: pal.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13 }}><EyeIcon /> {isClient ? "Update from the team" : "Client-visible update"}</div>
              <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6, overflowWrap: "anywhere" }}><Linkify text={t.clientUpdate} /></p>
              {t.clientUpdateAt && <p style={{ margin: "6px 0 0", fontSize: 12, color: pal.textTertiary }}>Posted {formatDateTime(t.clientUpdateAt)}</p>}
            </section>
          )}
          {owner && t.privateNotes && (
            <section aria-label="Private notes" className="task-note" style={{ border: `1px dashed ${pal.textTertiary}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13 }}><LockIcon /> Private notes · only you</div>
              <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6 }}>{t.privateNotes}</p>
            </section>
          )}

          <Attachments task={t} onChange={onChange} />

          <WebLinks task={t} onChange={onChange} />

          <LinkedTasks task={t} onChange={onChange} />

          <section aria-label="Activity">
            <div className="task-activity">
              <h3 className="sec-h" style={{ margin: 0 }}>Activity</h3>
              <span className="task-tab" style={{ background: pal.bgMuted }}>Comments <span className="sec-n">{comments.length}</span></span>
            </div>
            {comments.length === 0
              ? <p style={{ margin: "0 0 16px", fontSize: 14, color: pal.textSecondary }}>No comments yet. Start the conversation below.</p>
              : <ul style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 20 }}>
                {comments.map((c) => (
                  <li key={c.id} style={{ display: "flex", gap: 12 }}>
                    <Person name={c.authorName} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{c.authorName}{c.authorRole !== "owner" && <span style={{ fontWeight: 400, color: pal.textSecondary, fontSize: 12 }}> · {c.authorRole === "client" ? "Client" : "Designer"}</span>} <time dateTime={c.createdAt} style={{ fontWeight: 400, color: pal.textTertiary, fontSize: 12, marginLeft: 6 }}>{formatDateTime(c.createdAt)}</time></span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          {!isClient && <span title={c.visibility === "client" ? "The client can see this comment" : "Only the team can see this comment"} className="task-vis" style={{ background: c.visibility === "client" ? pal.bgMuted : "transparent", borderColor: pal.border, color: pal.textSecondary }}>{c.visibility === "client" ? "Shared" : "Internal"}</span>}
                          {(owner || c.authorId === me.designer?.id || c.authorId === me.client?.id) && <Button variant="ghost" size="sm" aria-label={`Delete comment by ${c.authorName}`} onClick={() => removeComment(c.id)}>Delete</Button>}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><Linkify text={c.text} /></p>
                    </div>
                  </li>
                ))}
              </ul>}
            <div style={{ display: "flex", gap: 12 }}>
              <Person name={who} size={32} />
              <form onSubmit={(e) => { e.preventDefault(); post(); }} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <TextArea rows={2} value={text} placeholder="Add a comment…" onChange={(e: never) => setText(val(e))}
                  aria-label={`Add a comment as ${who}`}
                  caption={isClient ? "Your comment is visible to the project team." : shared ? "Visible to the team and to the client." : "Internal: only the team sees this. Tick “Share with client” to include them."} />
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
                  <Button type="button" size="sm" loading={posting} disabled={!text.trim()} onClick={post}>Comment</Button>
                  {!isClient && <Checkbox checked={shared} onChange={(c: boolean) => setShared(c)} label="Share with client" aria-label="Share this comment with the client" />}
                </div>
              </form>
            </div>
          </section>
        </div>

        <aside className="task-side" aria-label="Task details">
          <div className="task-status" style={{ background: pal.bgSubtle }}>
            {canEdit
              ? <Select label="Status" value={t.status} onChange={(v: string) => patch({ status: v as Column }, "Status updated")} options={COLUMN_OPTIONS} />
              : <><span className="task-field__label">Status</span><span className="task-pill" style={{ background: pal.text, color: pal.bg }}>{statusLabel}</span></>}
          </div>
          <div className="task-details" style={{ borderColor: pal.border }}>
            <h3 className="sec-h" style={{ margin: 0 }}>Details</h3>
            {row("Assignee", canEdit
              ? <Select label="Assignee" value={t.assigneeId} onChange={(v: string) => patch({ assigneeId: v }, v ? "Task assigned" : "Task unassigned")} options={assigneeOptions(designers)} />
              : assignee ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15 }}><Person name={assignee.name} size={24} />{assignee.name}{mine ? " (you)" : ""}</span> : <Text size="sm" secondary>Unassigned</Text>, canEdit)}
            {row("Priority", canEdit
              ? <Select label="Priority" value={t.priority} onChange={(v: string) => patch({ priority: v as Priority }, "Priority updated")} options={PRIORITY_OPTIONS} />
              : <PriorityChip priority={t.priority} />, canEdit)}
            {row("Due date", canEdit
              ? <DateField label="Due date" bare clearable value={t.dueDate} onChange={(v) => patch({ dueDate: v }, "Due date updated")} />
              : <span style={{ fontSize: 15 }}>{t.dueDate ? formatDate(t.dueDate) : "No due date"}</span>)}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: pal.textTertiary, lineHeight: 1.7 }}>
            Created {formatDateTime(t.createdAt)}<br />Updated {formatDateTime(t.updatedAt)}
          </p>
        </aside>
      </div>
    </WideModal>
  );
}
