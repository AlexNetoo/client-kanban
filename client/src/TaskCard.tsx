import { Badge, Button, Card, DropdownMenu } from "./halaska-kit";
import { DueLabel } from "./Dashboard";
import { PriorityChip } from "./chips";
import { EyeIcon, LockIcon, Person } from "./ui";
import { useMe } from "./session";
import { usePalette } from "./theme";
import { COLUMNS, type Column, type Designer, type Task } from "./types";

interface Props {
  task: Task; designers: Designer[];
  onOpen: () => void; onEdit: () => void; onMove: (status: Column) => void;
}

/** Compact board card. Clicking the title opens the full task view (TaskModal). */
export function TaskCard({ task: t, designers, onOpen, onEdit, onMove }: Props) {
  const pal = usePalette();
  const me = useMe();
  const owner = me.role === "owner";
  const mine = t.assigneeId === me.designer?.id;
  const assignee = designers.find((d) => d.id === t.assigneeId);

  return (
    // The whole card opens the task (like Jira); the title stays a real button for keyboard and screen-reader users,
    // and the action buttons (marked data-no-open) keep their own behaviour.
    <div className="task-surface" onClick={(e) => { if (!(e.target as HTMLElement).closest("[data-no-open]")) onOpen(); }} style={{ cursor: "pointer", borderRadius: 16 }}>
    <Card padding={14} style={{ display: "flex", flexDirection: "column", gap: 10, borderRadius: 16 }}>
      <button type="button" className="task-title" aria-haspopup="dialog" onClick={onOpen}
        style={{ all: "unset", cursor: "pointer", fontWeight: 600, fontSize: 14, lineHeight: 1.4, color: pal.text, display: "block" }}>{t.title}</button>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12, color: pal.textSecondary }}>
        <PriorityChip priority={t.priority} />
        {t.dueDate && <DueLabel date={t.dueDate} done={t.status === "done"} />}
        {(t.links?.length ?? 0) > 0 && <Badge>{t.links.length} linked</Badge>}
        {t.comments.length > 0 && <Badge>{t.comments.length} {t.comments.length === 1 ? "comment" : "comments"}</Badge>}
        {t.clientUpdate && <Badge><EyeIcon /> Client update</Badge>}
        {owner && t.privateNotes && <span title="Private notes: only you can see them" style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px dashed ${pal.textTertiary}`, borderRadius: 8, padding: "2px 8px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}><LockIcon /> Private note</span>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: pal.textSecondary, minWidth: 0 }}>
          {assignee ? <><Person name={assignee.name} size={22} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assignee.name}</span></> : "Unassigned"}
        </span>
        <span data-no-open style={{ display: "inline-flex", gap: 4 }}>
          {owner && <Button variant="ghost" size="sm" aria-label={`Edit task ${t.title}`} onClick={onEdit}>Edit</Button>}
          {(owner || mine) && <DropdownMenu
            trigger={<Button variant="ghost" size="sm" aria-label={`Move “${t.title}” to another column`}>Move to…</Button>}
            items={COLUMNS.filter((c) => c.id !== t.status).map((c) => ({ label: c.label, onClick: () => onMove(c.id) }))} />}
        </span>
      </div>
    </Card>
    </div>
  );
}
