import { useEffect, useRef, useState } from "react";
import { Button, Select, Text, TextInput } from "./halaska-kit";
import { api } from "./api";
import { useToast, val } from "./ui";
import { useMe } from "./session";
import { usePalette } from "./theme";
import { columnLabel, type Task, type TaskLink, type TaskSearchResult } from "./types";

// What the admin picks, and how it is stored: "is blocked by X" is stored as "X blocks this".
const RELATIONS: { value: string; label: string; type: TaskLink["type"]; inverse: boolean }[] = [
  { value: "relates", label: "relates to", type: "relates", inverse: false },
  { value: "blocks", label: "blocks", type: "blocks", inverse: false },
  { value: "blocked_by", label: "is blocked by", type: "blocks", inverse: true },
  { value: "duplicates", label: "duplicates", type: "duplicates", inverse: false },
  { value: "duplicated_by", label: "is duplicated by", type: "duplicates", inverse: true },
];

/** Jira-style "Linked tasks": relation + task, each opening that task. Only the admin can add or remove. */
export function LinkedTasks({ task, onChange }: { task: Task; onChange: (t: Task) => void }) {
  const pal = usePalette();
  const toast = useToast();
  const owner = useMe().role === "owner";
  const links = task.links ?? [];
  const [adding, setAdding] = useState(false);
  const [relation, setRelation] = useState("relates");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TaskSearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // Debounced search; ignore answers that arrive out of order.
  useEffect(() => {
    if (!adding) return;
    const n = ++seq.current;
    const t = setTimeout(() => { api.searchTasks(q, task.id).then((r) => { if (n === seq.current) setResults(r); }).catch(() => { if (n === seq.current) setResults([]); }); }, 220);
    return () => clearTimeout(t);
  }, [adding, q, task.id]);

  const linked = new Set(links.map((l) => l.task.id));
  const choices = (results ?? []).filter((r) => !linked.has(r.id));

  const add = async (target: TaskSearchResult) => {
    const rel = RELATIONS.find((r) => r.value === relation)!;
    setBusy(true);
    try { onChange(await api.addLink(task.id, { targetId: target.id, type: rel.type, inverse: rel.inverse })); toast(`Linked: ${rel.label} “${target.title}”`); setAdding(false); setQ(""); setResults(null); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const remove = async (l: TaskLink) => {
    try { onChange(await api.deleteLink(task.id, l.id)); toast("Link removed"); } catch (e) { toast((e as Error).message, "error"); }
  };

  if (!owner && links.length === 0) return null;
  return (
    <section aria-label="Linked tasks">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, color: pal.textTertiary }}>Linked tasks ({links.length})</h3>
        {owner && !adding && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Link a task</Button>}
      </div>

      {links.length === 0 && !adding && <Text size="sm" secondary>No linked tasks yet.</Text>}
      {links.length > 0 && (
        <ul style={{ display: "flex", flexDirection: "column", border: `1px solid ${pal.border}`, borderRadius: 14, overflow: "hidden" }}>
          {links.map((l, i) => (
            <li key={l.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px", padding: "10px 14px", borderTop: i ? `1px solid ${pal.borderSubtle}` : "none" }}>
              <span style={{ width: 118, flex: "none", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: pal.textTertiary }}>{l.label}</span>
              <a href={`#/p/${l.task.projectId}/t/${l.task.id}`} style={{ flex: "1 1 160px", minWidth: 0, color: pal.text, fontWeight: 600, fontSize: 14, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={`${l.task.title} · ${l.task.projectName}`}>
                {l.task.title}{l.task.projectId !== task.projectId && <span style={{ fontWeight: 400, color: pal.textSecondary }}> · {l.task.projectName}</span>}
              </a>
              <span style={{ flex: "none", fontSize: 12, color: pal.textSecondary, border: `1px solid ${pal.border}`, borderRadius: 999, padding: "2px 10px" }}>{columnLabel(l.task.status)}</span>
              {owner && <Button variant="ghost" size="sm" aria-label={`Remove link to ${l.task.title}`} onClick={() => remove(l)}>Remove</Button>}
            </li>
          ))}
        </ul>
      )}

      {owner && adding && (
        <div style={{ marginTop: links.length ? 14 : 0, border: `1px solid ${pal.border}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row2">
            <Select label="This task…" value={relation} onChange={(v: string) => setRelation(v)} options={RELATIONS.map((r) => ({ value: r.value, label: r.label }))} />
            <TextInput label="…this task (search by title or project)" value={q} onChange={(e: never) => setQ(val(e))} aria-label="Search tasks to link" />
          </div>
          <ul aria-label="Matching tasks" aria-live="polite" style={{ display: "flex", flexDirection: "column", maxHeight: 220, overflowY: "auto" }}>
            {results === null && <li><Text size="sm" secondary>Searching…</Text></li>}
            {results !== null && choices.length === 0 && <li><Text size="sm" secondary>No matching tasks.</Text></li>}
            {choices.map((r) => (
              <li key={r.id}>
                <button type="button" disabled={busy} onClick={() => add(r)} style={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", padding: "8px 10px", borderRadius: 10, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", color: pal.text }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = pal.bgMuted)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  onFocus={(e) => (e.currentTarget.style.background = pal.bgMuted)} onBlur={(e) => (e.currentTarget.style.background = "transparent")}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</span>
                  <span style={{ fontSize: 12, color: pal.textSecondary, whiteSpace: "nowrap" }}>{r.projectName} · {columnLabel(r.status)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div><Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setQ(""); setResults(null); }}>Cancel</Button></div>
        </div>
      )}
    </section>
  );
}
