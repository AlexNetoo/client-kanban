import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Text } from "./halaska-kit";
import { api } from "./api";
import { Area } from "./fields";
import { useToast } from "./ui";
import { usePalette } from "./theme";
import { PRIORITY, columnLabel, type AiAction, type Designer } from "./types";

interface Msg { role: "user" | "assistant"; text: string; actions?: AiAction[]; picked?: boolean[]; applied?: boolean }

const SUGGESTIONS = [
  "Break this project into tasks",
  "Write descriptions for tasks that don’t have one",
  "Tighten the task titles",
  "Suggest priorities for the open tasks",
];
const FIELD_LABEL: Record<string, string> = { title: "Title", description: "Description", status: "Status", priority: "Priority", dueDate: "Due date", assigneeId: "Assignee" };

function show(k: string, v: string, designers: Designer[]) {
  if (k === "status") return columnLabel(v as never);
  if (k === "priority") return PRIORITY[v as keyof typeof PRIORITY] ?? v;
  if (k === "assigneeId") return designers.find((d) => d.id === v)?.name ?? "Unassigned";
  return v;
}

/** Chat drawer that proposes task changes. Nothing changes until the user ticks proposals and presses Apply. */
export function Assistant({ projectId, designers, enabled, isAdmin, onClose, onApplied }: { projectId: string; designers: Designer[]; enabled: boolean; isAdmin: boolean; onClose: () => void; onApplied: () => void }) {
  const pal = usePalette();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(-1);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector("textarea")?.focus(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const send = async (override?: string) => {
    const message = (override ?? text).trim();
    if (!message || busy) return;
    const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: message }]); setText(""); setBusy(true); setError("");
    try {
      const r = await api.aiAssist(projectId, message, history);
      setMsgs((m) => [...m, { role: "assistant", text: r.reply || (r.actions.length ? "Here’s what I suggest." : "Done."), actions: r.actions, picked: r.actions.map(() => true) }]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const apply = async (i: number) => {
    const m = msgs[i]; if (!m.actions || !m.picked) return;
    setApplying(i); let ok = 0; const failed: string[] = [];
    for (const [j, a] of m.actions.entries()) {
      if (!m.picked[j]) continue;
      try { if (a.type === "create_task") await api.createTask(projectId, a.fields as never); else await api.updateTask(a.taskId, a.fields as never); ok += 1; }
      catch (e) { failed.push((e as Error).message); }
    }
    setApplying(-1);
    setMsgs((all) => all.map((x, k) => (k === i ? { ...x, applied: true } : x)));
    toast(failed.length ? `Applied ${ok}, ${failed.length} failed: ${failed[0]}` : `Applied ${ok} change${ok === 1 ? "" : "s"}`, failed.length ? "error" : undefined);
    onApplied();
  };

  return (
    <div className="ai-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="ai-panel" role="dialog" aria-modal="true" aria-label="AI assistant" style={{ background: pal.bg, borderLeft: `1px solid ${pal.border}` }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${pal.border}` }}>
          <div><div style={{ fontWeight: 600, fontSize: 16 }}>AI assistant</div><Text size="sm" secondary>Plans tasks and edits them. You approve every change.</Text></div>
          <Button variant="ghost" size="sm" aria-label="Close assistant" onClick={onClose}>Close</Button>
        </header>

        <div className="ai-scroll">
          {!enabled ? (
            <div style={{ border: `1px dashed ${pal.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Not set up yet</div>
              <Text size="sm" secondary>{isAdmin ? "Add your Anthropic API key as ANTHROPIC_API_KEY (Vercel project settings, then redeploy). To use a model on your own computer instead, install Ollama and set OLLAMA_MODEL in the .env file (README: AI assistant). It turns on automatically." : "The admin hasn’t switched the assistant on yet."}</Text>
            </div>
          ) : msgs.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Text secondary>Describe what you need, or start with one of these:</Text>
              {SUGGESTIONS.map((s) => <button key={s} type="button" className="type-chip" onClick={() => send(s)} style={{ borderColor: pal.border, color: pal.text, textAlign: "left" }}>{s}</button>)}
            </div>
          ) : msgs.map((m, i) => (
            <div key={i} className={`ai-msg ai-msg--${m.role}`} style={m.role === "user" ? { background: pal.bgMuted } : undefined}>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 14, lineHeight: 1.5 }}>{m.text}</p>
              {m.actions && m.actions.length > 0 && m.picked && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {m.actions.map((a, j) => (
                    <div key={j} className="ai-action" style={{ border: `1px solid ${pal.border}`, borderRadius: 12, opacity: m.applied && !m.picked![j] ? 0.5 : 1 }}>
                      <Checkbox checked={m.picked![j]} disabled={m.applied} aria-label={a.type === "create_task" ? `New task: ${a.fields.title}` : `Update ${a.taskTitle}`}
                        onChange={(c: boolean) => setMsgs((all) => all.map((x, k) => (k === i ? { ...x, picked: x.picked!.map((p, q) => (q === j ? c : p)) } : x)))}
                        label={<span style={{ fontWeight: 600, fontSize: 13 }}>{a.type === "create_task" ? `New: ${a.fields.title}` : `Edit: ${a.taskTitle}`}</span>} />
                      <ul style={{ margin: "6px 0 0 28px", display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: pal.textSecondary }}>
                        {Object.entries(a.fields).filter(([k]) => !(a.type === "create_task" && k === "title") && !(a.type === "create_task" && k === "assigneeId" && !a.fields.assigneeId)).map(([k, v]) => (
                          <li key={k} style={{ overflowWrap: "anywhere" }}><span style={{ color: pal.textTertiary }}>{FIELD_LABEL[k] ?? k}: </span>{show(k, String(v), designers)}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {m.applied ? <Text size="sm" secondary>Applied.</Text>
                    : <Button size="sm" loading={applying === i} disabled={!m.picked.some(Boolean)} onClick={() => apply(i)}>Apply {m.picked.filter(Boolean).length} selected</Button>}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="ai-msg ai-msg--assistant" aria-live="polite"><span className="ai-dots" aria-label="Thinking"><i /><i /><i /></span></div>}
          {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>{error}</p>}
          <div ref={end} />
        </div>

        {enabled && (
          <form ref={box as never} onSubmit={(e) => { e.preventDefault(); send(); }} style={{ padding: 16, borderTop: `1px solid ${pal.border}`, display: "flex", flexDirection: "column", gap: 8 }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && (e.target as HTMLElement).tagName === "TEXTAREA") { e.preventDefault(); send(); } }}>
            <Area label="Ask the assistant" rows={3} value={text} onChange={setText} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Text size="sm" secondary>Enter to send · Shift+Enter for a new line</Text>
              <Button type="button" loading={busy} disabled={!text.trim()} onClick={() => send()}>Send</Button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
