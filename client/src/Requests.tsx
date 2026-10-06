import { useState } from "react";
import { Button, Card, Text } from "./halaska-kit";
import { api } from "./api";
import { euro, unitLabel } from "./lib/pricing";
import { CurrencyToggle, FxNote, useMoney } from "./currency";
import { formatDate } from "./lib/format";
import { DiscountChip } from "./chips";
import { ConfirmDialog, useToast } from "./ui";
import { useTheme, usePalette } from "./theme";
import type { ProjectRequest } from "./types";

const TONE = {
  new: { label: "In review", light: ["#fff1d6", "#8a5a00"], dark: ["#3a2e12", "#f2c36b"] },
  accepted: { label: "Approved", light: ["#e1f5e8", "#1b6b3a"], dark: ["#16301f", "#7fdca0"] },
  declined: { label: "Declined", light: ["#fde8e8", "#a4161a"], dark: ["#3b1d1d", "#ff9b9b"] },
} as const;

export function RequestChip({ status }: { status: ProjectRequest["status"] }) {
  const t = TONE[status]; const [bg, fg] = t[useTheme()];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", background: bg, color: fg }}>{t.label}</span>;
}

/** Submitted briefs. Clients see their own (read-only); the admin also gets Approve / Decline / Delete. */
export function RequestList({ requests, admin = false, onChange }: { requests: ProjectRequest[]; admin?: boolean; onChange?: () => void }) {
  const pal = usePalette();
  const money = useMoney();
  const fmt = admin ? euro : money.fmt; // the admin always sees euro
  const toast = useToast();
  const [deleting, setDeleting] = useState<ProjectRequest | null>(null);
  const [busy, setBusy] = useState("");
  const act = async (id: string, work: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try { await work(); toast(done); onChange?.(); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(""); }
  };
  return (
    <>
      {!admin && <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginBottom: 8 }}><FxNote /><CurrencyToggle /></div>}
      <ul style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-label="Project requests">
        {requests.map((r) => (
          <li key={r.id} className="req-card">
            <Card padding={20} style={{ borderRadius: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{r.name}</h3>
                  <Text size="sm" secondary>{admin ? `${r.clientName}${r.company ? ` · ${r.company}` : ""} · ` : ""}{r.type} · {formatDate(r.startDate)} to {formatDate(r.dueDate)} ({r.days} days)</Text>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{fmt(r.estimate.total)}</div>
                  <DiscountChip total={r.estimate.total} days={r.days} />
                  <Text size="sm" secondary>{r.estimate.lines.map(unitLabel).join(" + ")}</Text>
                </div>
              </div>
              <p style={{ fontSize: 14, color: pal.textSecondary, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.description}</p>
              <ul style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-label="Goals">
                {r.goals.map((g, i) => <li key={i} style={{ border: `1px solid ${pal.border}`, borderRadius: 999, padding: "3px 10px", fontSize: 12 }}>{g}</li>)}
              </ul>
              {admin && (r.references || r.notes) && <Text size="sm" secondary>{[r.references && `Links: ${r.references}`, r.notes && `Notes: ${r.notes}`].filter(Boolean).join(" · ")}</Text>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <RequestChip status={r.status} />
                <div style={{ display: "flex", gap: 8 }}>
                  {admin && r.status === "new" && <>
                    <Button size="sm" loading={busy === r.id} onClick={() => act(r.id, () => api.acceptRequest(r.id), "Project created from the request")}>Approve and create project</Button>
                    <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => act(r.id, () => api.declineRequest(r.id), "Request declined")}>Decline</Button>
                  </>}
                  {admin && r.status === "accepted" && r.projectId && <Button size="sm" variant="secondary" onClick={() => { location.href = `/#/p/${r.projectId}`; }}>Open project</Button>}
                  {admin && <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>Delete</Button>}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <ConfirmDialog open={!!deleting} title="Delete this request?" description="The request is removed. A project already created from it is kept." onClose={() => setDeleting(null)}
        onConfirm={async () => { if (deleting) { await api.deleteRequest(deleting.id); toast("Request deleted"); onChange?.(); } }} />
    </>
  );
}
