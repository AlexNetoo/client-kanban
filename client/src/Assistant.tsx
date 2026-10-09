import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox, Text } from "./halaska-kit";
import { api } from "./api";
import { PriorityChip } from "./chips";
import { SparkIcon, useToast } from "./ui";
import { usePalette } from "./theme";
import { columnLabel, type AiAction, type Designer, type Priority, type Task, type TaskInput } from "./types";

interface Undo { kind: "created" | "updated"; id: string; before?: Partial<TaskInput> }
interface Msg { role: "user" | "assistant"; text: string; actions?: AiAction[]; picked?: boolean[]; state?: "applied" | "undone"; undo?: Undo[]; failed?: number }

const STARTERS = [
  { title: "Break it into tasks", hint: "A first plan for this project", prompt: "Break this project into tasks" },
  { title: "Write descriptions", hint: "For tasks that don’t have one", prompt: "Write descriptions for tasks that don’t have one" },
  { title: "Tighten the titles", hint: "Shorter, clearer, consistent", prompt: "Tighten the task titles" },
  { title: "Suggest priorities", hint: "For the open tasks", prompt: "Suggest priorities for the open tasks" },
];
const FOLLOW_UPS = ["Make the descriptions more detailed", "Add due dates", "Fewer, bigger tasks"];
const STATUS_LINES = ["Reading the project…", "Looking at your tasks…", "Drafting proposals…", "Almost there…"];
const FIELD_LABEL: Record<string, string> = { title: "Title", description: "Description", status: "Status", priority: "Priority", dueDate: "Due date", assigneeId: "Assignee" };

const storeKey = (id: string) => `assistant:${id}`;
const load = (id: string): Msg[] => { try { return JSON.parse(sessionStorage.getItem(storeKey(id)) || "[]"); } catch { return []; } };
const save = (id: string, m: Msg[]) => { try { sessionStorage.setItem(storeKey(id), JSON.stringify(m.slice(-30))); } catch { /* storage unavailable */ } };

function Clamp({ text, lines = 2 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 110 || text.includes("\n");
  return (
    <span>
      <span style={open ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{text}</span>
      {long && <button type="button" className="ai-more" onClick={() => setOpen(!open)}>{open ? "Show less" : "Show more"}</button>}
    </span>
  );
}

function Value({ k, v, designers }: { k: string; v: string; designers: Designer[] }) {
  if (k === "priority") return <PriorityChip priority={v as Priority} suffix="" />;
  if (k === "status") return <span>{columnLabel(v as never)}</span>;
  if (k === "assigneeId") return <span>{v ? designers.find((d) => d.id === v)?.name ?? "Someone" : "Unassigned"}</span>;
  if (k === "description") return <Clamp text={v} />;
  return <span style={{ overflowWrap: "anywhere" }}>{v}</span>;
}

function Proposal({ a, task, picked, disabled, designers, onToggle }: { a: AiAction; task?: Task; picked: boolean; disabled: boolean; designers: Designer[]; onToggle: (c: boolean) => void }) {
  const pal = usePalette();
  const create = a.type === "create_task";
  const entries = Object.entries(a.fields).filter(([k]) => !(create && k === "title"));
  const old = (k: string) => (task ? String((task as unknown as Record<string, unknown>)[k] ?? "") : "");
  return (
    <div className={`ai-prop${picked && !disabled ? " is-picked" : ""}`} style={{ borderColor: picked && !disabled ? pal.accent : pal.border, opacity: disabled && !picked ? 0.45 : 1 }}>
      <Checkbox checked={picked} disabled={disabled} onChange={onToggle} aria-label={create ? `New task: ${a.fields.title}` : `Edit ${a.taskTitle}`}
        label={<span className="ai-prop__head"><span className={`ai-tag ${create ? "ai-tag--new" : "ai-tag--edit"}`}>{create ? "New" : "Edit"}</span><strong>{create ? a.fields.title : a.taskTitle}</strong></span>} />
      <dl className="ai-prop__fields">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt style={{ color: pal.textTertiary }}>{FIELD_LABEL[k] ?? k}</dt>
            <dd>
              {!create && old(k) && old(k) !== String(v) && <span className="ai-old" style={{ color: pal.textTertiary }}>{k === "description" ? <Clamp text={old(k)} lines={1} /> : <Value k={k} v={old(k)} designers={designers} />}</span>}
              <Value k={k} v={String(v)} designers={designers} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Chat drawer that proposes task changes. Nothing changes until the user ticks proposals and presses Apply, and an applied batch can be undone. */
export function Assistant({ projectId, projectName, tasks, designers, enabled, isAdmin, onClose, onApplied }: {
  projectId: string; projectName: string; tasks: Task[]; designers: Designer[]; enabled: boolean; isAdmin: boolean; onClose: () => void; onApplied: () => void;
}) {
  const pal = usePalette();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>(() => load(projectId));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [error, setError] = useState<{ message: string; retry: string } | null>(null);
  const [working, setWorking] = useState(-1);
  const run = useRef(0);          // each request gets a number so a cancelled one is ignored when it finally answers
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { save(projectId, msgs); }, [projectId, msgs]);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy, error]);
  useEffect(() => { if (!busy) return; setStatusIdx(0); const t = setInterval(() => setStatusIdx((i) => Math.min(i + 1, STATUS_LINES.length - 1)), 2600); return () => clearInterval(t); }, [busy]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const grow = useCallback(() => { const el = input.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }, []);
  useEffect(grow, [text, grow]);

  const send = async (override?: string) => {
    const message = (override ?? text).trim();
    if (!message || busy) return;
    const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    const id = ++run.current;
    setMsgs((m) => [...m, { role: "user", text: message }]); setText(""); setBusy(true); setError(null);
    try {
      const r = await api.aiAssist(projectId, message, history);
      if (id !== run.current) return;
      setMsgs((m) => [...m, { role: "assistant", text: r.reply || (r.actions.length ? "Here’s what I suggest." : "Done."), actions: r.actions, picked: r.actions.map(() => true) }]);
    } catch (e) { if (id === run.current) setError({ message: (e as Error).message, retry: message }); }
    finally { if (id === run.current) setBusy(false); }
  };
  const stop = () => { run.current += 1; setBusy(false); setMsgs((m) => m.slice(0, -1)); }; // drop the unanswered question so the chat stays tidy
  const reset = () => { run.current += 1; setBusy(false); setMsgs([]); setError(null); setText(""); input.current?.focus(); };
  const retry = () => { if (!error) return; const q = error.retry; setMsgs((m) => (m[m.length - 1]?.role === "user" ? m.slice(0, -1) : m)); setError(null); send(q); };

  const toggle = (i: number, j: number | "all", c: boolean) => setMsgs((all) => all.map((x, k) => (k !== i || !x.picked ? x : { ...x, picked: x.picked.map((p, q) => (j === "all" || q === j ? c : p)) })));

  const apply = async (i: number) => {
    const m = msgs[i]; if (!m.actions || !m.picked) return;
    setWorking(i); const undo: Undo[] = []; let failed = 0; let firstError = "";
    for (const [j, a] of m.actions.entries()) {
      if (!m.picked[j]) continue;
      try {
        if (a.type === "create_task") { const t = await api.createTask(projectId, { status: "backlog", priority: "medium", ...a.fields } as never); undo.push({ kind: "created", id: t.id }); }
        else {
          const cur = tasks.find((t) => t.id === a.taskId) as unknown as Record<string, unknown> | undefined;
          const before = Object.fromEntries(Object.keys(a.fields).map((k) => [k, cur?.[k] ?? ""])) as Partial<TaskInput>;
          await api.updateTask(a.taskId, a.fields as never); undo.push({ kind: "updated", id: a.taskId, before });
        }
      } catch (e) { failed += 1; firstError ||= (e as Error).message; }
    }
    setWorking(-1);
    setMsgs((all) => all.map((x, k) => (k === i ? { ...x, state: "applied", undo, failed } : x)));
    toast(failed ? `Applied ${undo.length}, ${failed} failed: ${firstError}` : `Applied ${undo.length} change${undo.length === 1 ? "" : "s"}`, failed ? "error" : undefined);
    onApplied();
  };
  const undoApply = async (i: number) => {
    const m = msgs[i]; if (!m.undo) return;
    setWorking(i); let failed = 0;
    for (const u of [...m.undo].reverse()) {
      try { if (u.kind === "created") await api.deleteTask(u.id); else await api.updateTask(u.id, u.before as never); } catch { failed += 1; }
    }
    setWorking(-1);
    setMsgs((all) => all.map((x, k) => (k === i ? { ...x, state: "undone" } : x)));
    toast(failed ? `Undone, but ${failed} change${failed === 1 ? "" : "s"} couldn’t be reverted` : "Changes undone", failed ? "error" : undefined);
    onApplied();
  };

  const last = msgs[msgs.length - 1];
  const empty = msgs.length === 0 && !busy;

  return (
    <div className="ai-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="ai-panel" role="dialog" aria-modal="true" aria-label="AI assistant" style={{ background: pal.bg, borderLeft: `1px solid ${pal.border}`, color: pal.text }}>
        <header className="ai-head" style={{ borderBottom: `1px solid ${pal.border}` }}>
          <span className="ai-avatar" style={{ background: pal.accent, color: "#fff" }} aria-hidden="true"><SparkIcon /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.2 }}>AI assistant</div>
            <div className="ai-sub" style={{ color: pal.textSecondary }}>{projectName}</div>
          </div>
          {msgs.length > 0 && <Button variant="ghost" size="sm" onClick={reset}>New chat</Button>}
          <button type="button" className="ai-x" aria-label="Close assistant" onClick={onClose} style={{ color: pal.textSecondary }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <div className="ai-scroll" aria-live="polite">
          {!enabled ? (
            <div className="ai-note" style={{ borderColor: pal.border }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Not set up yet</div>
              <Text size="sm" secondary>{isAdmin ? "Add your Anthropic API key as ANTHROPIC_API_KEY (Vercel project settings, then redeploy). To use a model on your own computer instead, install Ollama and set OLLAMA_MODEL in the .env file (README: AI assistant). It turns on automatically." : "The admin hasn’t switched the assistant on yet."}</Text>
            </div>
          ) : empty ? (
            <div className="ai-welcome">
              <h2>How can I help with <em>{projectName}</em>?</h2>
              <p style={{ color: pal.textSecondary }}>I can plan tasks, write descriptions and tidy up what’s already on the board. You review every change before it happens.</p>
              <div className="ai-starters">
                {STARTERS.map((s) => (
                  <button key={s.title} type="button" className="ai-starter" onClick={() => send(s.prompt)} style={{ borderColor: pal.border, color: pal.text }}>
                    <strong>{s.title}</strong><span style={{ color: pal.textSecondary }}>{s.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : msgs.map((m, i) => (
            <div key={i} className={`ai-row ai-row--${m.role}`}>
              {m.role === "assistant" && <span className="ai-avatar ai-avatar--sm" style={{ background: pal.bgMuted, color: pal.text }} aria-hidden="true"><SparkIcon /></span>}
              <div className="ai-bubble" style={m.role === "user" ? { background: pal.accent, color: "#fff" } : undefined}>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</p>
                {m.actions && m.actions.length > 0 && m.picked && (() => {
                  const n = m.picked.filter(Boolean).length; const locked = !!m.state;
                  return (
                    <div className="ai-props">
                      <div className="ai-props__bar" style={{ color: pal.textSecondary }}>
                        <span>{m.actions.length} proposed change{m.actions.length === 1 ? "" : "s"}</span>
                        {!locked && <button type="button" className="ai-more" onClick={() => toggle(i, "all", n !== m.actions!.length)}>{n === m.actions.length ? "Clear all" : "Select all"}</button>}
                      </div>
                      {m.actions.map((a, j) => (
                        <Proposal key={j} a={a} task={a.type === "update_task" ? tasks.find((t) => t.id === a.taskId) : undefined} picked={m.picked![j]} disabled={locked} designers={designers} onToggle={(c) => toggle(i, j, c)} />
                      ))}
                      {!locked ? (
                        <Button fullWidth loading={working === i} disabled={n === 0} onClick={() => apply(i)}>{n === 0 ? "Select changes to apply" : `Apply ${n} change${n === 1 ? "" : "s"}`}</Button>
                      ) : (
                        <div className="ai-done" style={{ background: pal.bgMuted }}>
                          <span>{m.state === "undone" ? "Changes undone." : `Applied ${m.undo?.length ?? 0} change${(m.undo?.length ?? 0) === 1 ? "" : "s"}${m.failed ? `, ${m.failed} failed` : ""}.`}</span>
                          {m.state === "applied" && !!m.undo?.length && <Button variant="ghost" size="sm" loading={working === i} onClick={() => undoApply(i)}>Undo</Button>}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}

          {busy && (
            <div className="ai-row ai-row--assistant">
              <span className="ai-avatar ai-avatar--sm ai-pulse" style={{ background: pal.bgMuted, color: pal.text }} aria-hidden="true"><SparkIcon /></span>
              <div className="ai-bubble ai-thinking" style={{ color: pal.textSecondary }}>
                <span className="ai-dots" aria-hidden="true"><i /><i /><i /></span><span key={statusIdx} className="ai-status">{STATUS_LINES[statusIdx]}</span>
                <button type="button" className="ai-more" onClick={stop}>Stop</button>
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className="ai-error" style={{ borderColor: pal.text }}>
              <span>{error.message}</span>
              <Button size="sm" variant="secondary" onClick={retry}>Try again</Button>
            </div>
          )}
          {enabled && !busy && !error && last?.role === "assistant" && (
            <div className="ai-followups">{FOLLOW_UPS.map((f) => <button key={f} type="button" className="type-chip" style={{ borderColor: pal.border, color: pal.text }} onClick={() => send(f)}>{f}</button>)}</div>
          )}
          <div ref={end} />
        </div>

        {enabled && (
          <form className="ai-composer" style={{ borderTop: `1px solid ${pal.border}` }} onSubmit={(e) => { e.preventDefault(); send(); }}>
            <div className="ai-input" style={{ borderColor: pal.border }}>
              <textarea ref={input} rows={1} value={text} placeholder="Ask for tasks, descriptions or edits…" aria-label="Ask the assistant" maxLength={2000}
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
              <button type="submit" className="ai-send" aria-label="Send" disabled={!text.trim() || busy} style={{ background: pal.accent, color: "#fff" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              </button>
            </div>
            <div className="ai-hint" style={{ color: pal.textTertiary }}>Enter to send · Shift+Enter for a new line · Nothing changes until you apply</div>
          </form>
        )}
      </aside>
    </div>
  );
}
