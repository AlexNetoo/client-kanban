import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Heading, Progress, Text } from "./halaska-kit";
import { api } from "./api";
import { DueLabel } from "./Dashboard";
import { CheckIcon, EyeIcon, Loading, StateBlock } from "./ui";
import { usePalette } from "./theme";
import { formatDate, shortDate } from "./lib/format";
import { PROJECT_STATUS, type ClientProject, type ClientTask, type Column } from "./types";

const STAGES: { id: Column; label: string }[] = [
  { id: "in_progress", label: "In progress now" }, { id: "in_review", label: "Ready for review" },
  { id: "todo", label: "Up next" }, { id: "backlog", label: "Planned" }, { id: "done", label: "Completed" },
];

export function ClientView({ token, role }: { token: string; role: "owner" | "client" }) {
  const pal = usePalette();
  const [data, setData] = useState<{ project: ClientProject; tasks: ClientTask[] } | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { const d = await api.clientView(token); setData(d); document.title = `${d.project.name} · Project progress`; }
    catch (e) { setError({ status: (e as { status?: number }).status ?? 0, message: (e as Error).message }); }
  }, [token]);
  useEffect(() => { setData(null); load(); }, [load]);

  if (error) return (
    <StateBlock title={error.status === 404 ? "We couldn’t find that project" : "Couldn’t load this project"}
      description={error.status === 404 ? "The link may be out of date. Ask your freelancer for a fresh one." : error.message}
      action={error.status === 404 ? undefined : <Button onClick={load}>Try again</Button>} />
  );
  if (!data) return <Loading rows={1} />;

  const { project: p, tasks } = data;
  const updates = tasks.filter((t) => t.clientUpdate).sort((a, b) => (b.clientUpdateAt || "").localeCompare(a.clientUpdateAt || "")).slice(0, 8);

  return (
    <>
      {role === "owner" && (
        <div style={{ border: `1px solid ${pal.text}`, borderRadius: 12, padding: "10px 16px", marginBottom: 28, display: "flex", gap: "8px 16px", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", fontSize: 14, fontWeight: 500 }}>
          <span><EyeIcon /> Client preview — this is exactly what your client sees. Private notes are never included.</span>
          <Button variant="secondary" size="sm" onClick={() => { location.hash = "#/"; }}>← Back to dashboard</Button>
        </div>
      )}
      <section aria-labelledby="proj-title" style={{ padding: "8px 0 32px", marginBottom: 32, borderBottom: `1px solid ${pal.border}`, display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <Text secondary>{p.client}</Text>
          <h1 id="proj-title" style={{ margin: "4px 0 0", fontSize: "clamp(1.8rem, 4vw, 2.4rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.15 }}>{p.name}</h1>
          {p.summary && <p style={{ marginTop: 8, color: pal.textSecondary }}>{p.summary}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: "clamp(2.6rem, 7vw, 3.6rem)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>{p.progress}%</span>
          <span style={{ color: pal.textSecondary }}>complete · {p.counts.done} of {p.total} tasks finished</span>
        </div>
        <Progress value={p.progress} height={10} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center", fontSize: 14 }}>
          <Badge>{PROJECT_STATUS[p.status]}</Badge>
          <DueLabel date={p.dueDate} done={p.status === "completed"} />
          <span style={{ color: pal.textSecondary }}>Last updated {formatDate(p.updatedAt.slice(0, 10))}</span>
        </div>
      </section>

      {tasks.length === 0 ? (
        <StateBlock title="Work is about to begin" description="Tasks will appear here as soon as they are planned." />
      ) : (
        <div className="client-layout">
          <div>
            {STAGES.map((s) => {
              const items = tasks.filter((t) => t.status === s.id);
              if (!items.length) return null;
              return (
                <section key={s.id} aria-labelledby={`st-${s.id}`} style={{ marginBottom: 32 }}>
                  <h2 id={`st-${s.id}`} style={{ margin: "0 0 4px", paddingBottom: 8, borderBottom: `1px solid ${pal.text}`, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, display: "flex", gap: 8, alignItems: "center" }}>
                    {s.id === "done" && <CheckIcon />}{s.label} <span style={{ color: pal.textTertiary }}>({items.length})</span>
                  </h2>
                  <ul>
                    {items.map((t) => (
                      <li key={t.id} style={{ padding: "14px 0", borderBottom: `1px solid ${pal.borderSubtle}` }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          {t.title}{t.dueDate && s.id !== "done" && <DueLabel date={t.dueDate} />}
                        </h3>
                        {t.description && <p style={{ marginTop: 4, fontSize: 14, color: pal.textSecondary }}>{t.description}</p>}
                        {t.clientUpdate && <p style={{ marginTop: 10, borderLeft: `2px solid ${pal.text}`, padding: "2px 0 2px 12px", fontSize: 14 }}><strong>Update: </strong>{t.clientUpdate}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <aside aria-labelledby="latest">
            <h2 id="latest" style={{ margin: "0 0 4px", paddingBottom: 8, borderBottom: `1px solid ${pal.text}`, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700 }}>Latest updates</h2>
            {updates.length ? (
              <ul>
                {updates.map((t) => (
                  <li key={t.id} style={{ padding: "14px 0", borderBottom: `1px solid ${pal.borderSubtle}` }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t.title}</h3>
                    <p style={{ marginTop: 8, borderLeft: `2px solid ${pal.text}`, padding: "2px 0 2px 12px", fontSize: 14 }}>
                      {t.clientUpdate}
                      {t.clientUpdateAt && <time dateTime={t.clientUpdateAt} style={{ display: "block", fontSize: 12, color: pal.textTertiary }}>{shortDate(t.clientUpdateAt)}</time>}
                    </p>
                  </li>
                ))}
              </ul>
            ) : <p style={{ marginTop: 12, color: pal.textSecondary }}>No updates yet. Check back soon.</p>}
          </aside>
        </div>
      )}
    </>
  );
}
