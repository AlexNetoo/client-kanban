import { useState } from "react";
import { Badge, Button, Card, DropdownMenu, Select, TextArea, Text } from "./halaska-kit";
import { api } from "./api";
import { DueLabel } from "./Dashboard";
import { assigneeOptions } from "./dialogs";
import { EyeIcon, LockIcon, Person, useToast, val } from "./ui";
import { usePalette } from "./theme";
import { formatDateTime } from "./lib/format";
import { COLUMNS, PRIORITY, columnLabel, type Column, type Designer, type Task } from "./types";

const chevron = (open: boolean) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ flex: "none", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}><path d="m6 9 6 6 6-6" /></svg>
);

interface Props {
  task: Task; designers: Designer[]; expanded: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void; onMove: (status: Column) => void;
  onChange: (t: Task) => void; // task updated in place (assignee, comments)
}

/** Draggable card. Collapsed: title and badges. Expanded: full details, assignee, and the comment thread. */
export function TaskCard({ task: t, designers, expanded, onToggle, onEdit, onDelete, onMove, onChange }: Props) {
  const pal = usePalette();
  const toast = useToast();
  const [postAs, setPostAs] = useState("owner");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const assignee = designers.find((d) => d.id === t.assigneeId);
  const panelId = `panel-${t.id}`;

  const assign = async (assigneeId: string) => {
    try { onChange(await api.updateTask(t.id, { assigneeId })); toast(assigneeId ? "Task assigned" : "Task unassigned"); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try { onChange(await api.addComment(t.id, { text, authorId: postAs })); setText(""); toast("Comment posted"); }
    catch (e) { toast((e as Error).message, "error"); } finally { setPosting(false); }
  };
  const removeComment = async (id: string) => {
    try { onChange(await api.deleteComment(t.id, id)); toast("Comment deleted"); } catch (e) { toast((e as Error).message, "error"); }
  };

  const label = (s: string) => <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: pal.textTertiary, marginBottom: 6 }}>{s}</div>;
  const high = t.priority === "high";

  return (
    <Card padding={14} style={{ display: "flex", flexDirection: "column", gap: 10, cursor: "grab", borderRadius: 16 }}>
      <button type="button" className="task-title" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}
        style={{ all: "unset", cursor: "pointer", fontWeight: 600, fontSize: 14, lineHeight: 1.4, color: pal.text, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <span>{t.title}</span>{chevron(expanded)}
      </button>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12, color: pal.textSecondary }}>
        {high
          ? <span style={{ background: pal.text, color: pal.bg, borderRadius: 8, padding: "3px 8px", fontWeight: 600, fontSize: 10, letterSpacing: 0.3, textTransform: "uppercase" }}>High priority</span>
          : <Badge>{PRIORITY[t.priority]} priority</Badge>}
        {t.dueDate && <DueLabel date={t.dueDate} done={t.status === "done"} />}
        {t.comments.length > 0 && <Badge>{t.comments.length} {t.comments.length === 1 ? "comment" : "comments"}</Badge>}
        {t.clientUpdate && <Badge><EyeIcon /> Client update</Badge>}
        {t.privateNotes && <span title="Private notes: only you can see them" style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px dashed ${pal.textTertiary}`, borderRadius: 8, padding: "2px 8px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}><LockIcon /> Private note</span>}
      </div>

      {assignee && !expanded && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><Person name={assignee.name} size={22} /><span>{assignee.name}</span></div>
      )}

      {expanded && (
        <div id={panelId} style={{ display: "flex", flexDirection: "column", gap: 16, borderTop: `1px solid ${pal.border}`, paddingTop: 14, cursor: "auto" }}>
          <div>{label("Description")}{t.description ? <p style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{t.description}</p> : <Text size="sm" secondary>No description yet.</Text>}</div>

          <Select label="Assigned designer" value={t.assigneeId} onChange={assign} options={assigneeOptions(designers)} />

          {t.clientUpdate && (
            <section aria-label="Client-visible update" style={{ border: `1px solid ${pal.text}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12 }}><EyeIcon /> Client-visible update</div>
              <p style={{ marginTop: 6, fontSize: 14 }}>{t.clientUpdate}</p>
            </section>
          )}
          {t.privateNotes && (
            <section aria-label="Private notes" style={{ border: `2px dashed ${pal.textTertiary}`, borderRadius: 12, padding: 12, backgroundImage: `repeating-linear-gradient(135deg, transparent 0 6px, ${pal.borderSubtle} 6px 7px)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12 }}><LockIcon /> Private notes · only you</div>
              <p style={{ marginTop: 6, fontSize: 14 }}>{t.privateNotes}</p>
            </section>
          )}

          <section aria-label="Comments">
            {label(`Comments (${t.comments.length})`)}
            {t.comments.length === 0 && <Text size="sm" secondary>No comments yet. Internal only: clients never see these.</Text>}
            <ul style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {t.comments.map((c) => (
                <li key={c.id} style={{ display: "flex", gap: 10 }}>
                  <Person name={c.authorName} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{c.authorName} <time dateTime={c.createdAt} style={{ fontWeight: 400, color: pal.textTertiary, fontSize: 12 }}>· {formatDateTime(c.createdAt)}</time></span>
                      <Button variant="ghost" size="sm" aria-label={`Delete comment by ${c.authorName}`} onClick={() => removeComment(c.id)}>Delete</Button>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => { e.preventDefault(); post(); }} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              <Select label="Posting as" value={postAs} onChange={setPostAs} options={[{ value: "owner", label: "Freelancer" }, ...designers.map((d) => ({ value: d.id, label: d.name }))]} />
              <TextArea label="Add a comment" rows={2} value={text} onChange={(e: never) => setText(val(e))} aria-label="Add a comment" />
              <div><Button type="button" size="sm" loading={posting} onClick={post}>Post comment</Button></div>
            </form>
          </section>

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" aria-label={`Delete task ${t.title}`} onClick={onDelete}>Delete task</Button>
            <Button size="sm" aria-label={`Edit task ${t.title}`} onClick={onEdit}>Edit task</Button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: pal.textSecondary, minWidth: 0 }}>
          {assignee && expanded && <><Person name={assignee.name} size={22} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assignee.name}</span></>}
          {!expanded && !assignee && <span>Unassigned</span>}
        </span>
        <span style={{ display: "inline-flex", gap: 4 }}>
          {!expanded && <Button variant="ghost" size="sm" aria-label={`Edit task ${t.title}`} onClick={onEdit}>Edit</Button>}
          <DropdownMenu
            trigger={<Button variant="ghost" size="sm" aria-label={`Move “${t.title}” to another column`}>Move to…</Button>}
            items={COLUMNS.filter((c) => c.id !== t.status).map((c) => ({ label: c.label, onClick: () => onMove(c.id) }))} />
        </span>
      </div>
    </Card>
  );
}
export { columnLabel };
