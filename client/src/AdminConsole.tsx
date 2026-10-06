import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, Checkbox, Heading, Stat, Tabs, Text } from "./halaska-kit";
import { api } from "./api";
import { Text1 } from "./fields";
import { StatusChip } from "./chips";
import { ConfirmDialog, Loading, Person, StateBlock, TypedConfirmDialog, useToast } from "./ui";
import { usePalette } from "./theme";
import { generatePassword } from "./lib/password";
import type { ClientAccount, Designer, Project } from "./types";

const MIN = 10;
type Revealed = { who: string; password: string } | null;

/** Password input with show/hide and a generator. */
function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Text1 label={label} type={show ? "text" : "password"} value={value} onChange={onChange} />
      <div style={{ display: "flex", gap: 8 }}>
        <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(generatePassword()); setShow(true); }}>Generate</Button>
        <Button type="button" size="sm" variant="ghost" aria-pressed={show} onClick={() => setShow((s) => !s)}>{show ? "Hide" : "Show"}</Button>
      </div>
    </div>
  );
}

/** Shown once after a password is created or reset, so the admin can pass it on. */
function RevealBanner({ revealed, onDismiss }: { revealed: Revealed; onDismiss: () => void }) {
  const pal = usePalette();
  const toast = useToast();
  if (!revealed) return null;
  return (
    <div role="status" style={{ border: `2px solid ${pal.text}`, borderRadius: 14, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Password for {revealed.who}</div>
      <code style={{ fontSize: 16, letterSpacing: 0.5, wordBreak: "break-all", background: pal.bgMuted, padding: "8px 12px", borderRadius: 10 }}>{revealed.password}</code>
      <Text size="sm" secondary>Share it privately. It isn’t stored anywhere readable and won’t be shown again.</Text>
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(revealed.password); toast("Password copied"); } catch { toast("Couldn’t copy. Select and copy it manually.", "error"); } }}>Copy password</Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>Done</Button>
      </div>
    </div>
  );
}

function Err({ children }: { children: ReactNode }) {
  const pal = usePalette();
  return children ? <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {children}</p> : null;
}

function useGuard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(""); try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return { busy, error, setError, run };
}

const row = (pal: ReturnType<typeof usePalette>) => ({ padding: "14px 0", borderBottom: `1px solid ${pal.borderSubtle}` });

// ============================== Designers ==============================
function DesignersPanel({ designers, reload, setRevealed }: { designers: Designer[]; reload: () => void; setRevealed: (r: Revealed) => void }) {
  const pal = usePalette();
  const toast = useToast();
  const g = useGuard();
  const [name, setName] = useState(""); const [role, setRole] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [eEmail, setEEmail] = useState(""); const [ePassword, setEPassword] = useState("");
  const [deleting, setDeleting] = useState<Designer | null>(null);

  const add = () => g.run(async () => {
    if (!name.trim()) throw new Error("Enter a name.");
    if ((email || password) && !(email && password)) throw new Error("A login needs both an email and a password.");
    if (password && password.length < MIN) throw new Error(`Password must be at least ${MIN} characters.`);
    const d = await api.createDesigner({ name, role, email: email || undefined, password: password || undefined });
    if (password) setRevealed({ who: `${d.name} (${email})`, password });
    setName(""); setRole(""); setEmail(""); setPassword(""); reload(); toast(`${d.name} added`);
  });
  const saveLogin = (d: Designer) => g.run(async () => {
    if (!eEmail.trim() || !ePassword) throw new Error("Enter an email and a password.");
    if (ePassword.length < MIN) throw new Error(`Password must be at least ${MIN} characters.`);
    await api.updateDesigner(d.id, { email: eEmail, password: ePassword });
    setRevealed({ who: `${d.name} (${eEmail})`, password: ePassword }); setEditing(null); reload(); toast(`Password set for ${d.name}. They were signed out everywhere.`);
  });

  return (
    <div>
      <ul aria-label="Designers">
        {designers.length === 0 && <li style={row(pal)}><Text secondary>No designers yet.</Text></li>}
        {designers.map((d) => (
          <li key={d.id} style={row(pal)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Person name={d.name} size={34} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600 }}>{d.name}{d.role && <span style={{ fontWeight: 400, color: pal.textSecondary }}> · {d.role}</span>}</div>
                <Text size="sm" secondary>{d.hasLogin ? d.email : "No login yet"}</Text>
              </div>
              <Button size="sm" variant="secondary" aria-label={`${d.hasLogin ? "Reset password for" : "Set login for"} ${d.name}`}
                onClick={() => { if (editing === d.id) setEditing(null); else { setEditing(d.id); setEEmail(d.email ?? ""); setEPassword(""); g.setError(""); } }}>{d.hasLogin ? "Reset password" : "Set login"}</Button>
              <Button size="sm" variant="ghost" aria-label={`Delete ${d.name}`} onClick={() => setDeleting(d)}>Delete</Button>
            </div>
            {editing === d.id && (
              <form onSubmit={(e) => { e.preventDefault(); saveLogin(d); }} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, paddingLeft: 46, maxWidth: 520 }}>
                <Err>{g.error}</Err>
                <Text1 label="Email" type="email" value={eEmail} onChange={setEEmail} />
                <PasswordField label={`New password (min ${MIN} characters)`} value={ePassword} onChange={setEPassword} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button type="button" size="sm" loading={g.busy} onClick={() => saveLogin(d)}>Save</Button>
                  {d.hasLogin && <Button type="button" size="sm" variant="secondary" onClick={() => g.run(async () => { await api.updateDesigner(d.id, { removeLogin: true }); setEditing(null); reload(); toast(`${d.name} can no longer sign in`); })}>Remove login</Button>}
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
                <Text size="sm" secondary>Saving signs them out of every device immediately.</Text>
              </form>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={(e) => { e.preventDefault(); add(); }} aria-label="Add designer" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24, maxWidth: 620 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Add a designer</h3>
        {editing === null && <Err>{g.error}</Err>}
        <div className="row2"><Text1 label="Name" value={name} onChange={setName} /><Text1 label="Role (optional)" value={role} onChange={setRole} /></div>
        <div className="row2"><Text1 label="Login email (optional)" type="email" value={email} onChange={setEmail} /><PasswordField label={`Password (min ${MIN})`} value={password} onChange={setPassword} /></div>
        <div><Button type="button" loading={g.busy} onClick={add}>Add designer</Button></div>
      </form>

      <ConfirmDialog open={!!deleting} title={`Delete ${deleting?.name ?? ""}?`} confirmLabel="Delete designer" onClose={() => setDeleting(null)}
        description="Their login stops working immediately and their tasks become unassigned. Their past comments stay."
        onConfirm={async () => { if (deleting) { await api.deleteDesigner(deleting.id); toast(`${deleting.name} deleted`); reload(); } }} />
    </div>
  );
}

// ============================== Clients ==============================
function ProjectPicker({ projects, value, onChange }: { projects: Project[]; value: string[]; onChange: (v: string[]) => void }) {
  const pal = usePalette();
  return (
    <fieldset style={{ border: `1px solid ${pal.border}`, borderRadius: 14, padding: "10px 14px", margin: 0 }}>
      <legend style={{ fontSize: 13, color: pal.textSecondary, padding: "0 6px" }}>Projects this client can see</legend>
      {projects.length === 0 && <Text size="sm" secondary>No projects yet.</Text>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
        {projects.map((p) => (
          <Checkbox key={p.id} checked={value.includes(p.id)} label={`${p.name} · ${p.client}${p.archived ? " (archived)" : ""}`} aria-label={p.name}
            onChange={(c: boolean) => onChange(c ? [...value, p.id] : value.filter((x) => x !== p.id))} />
        ))}
      </div>
    </fieldset>
  );
}

function ClientsPanel({ clients, projects, reload, setRevealed }: { clients: ClientAccount[]; projects: Project[]; reload: () => void; setRevealed: (r: Revealed) => void }) {
  const pal = usePalette();
  const toast = useToast();
  const g = useGuard();
  const [name, setName] = useState(""); const [company, setCompany] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [ids, setIds] = useState<string[]>([]);
  const [open, setOpen] = useState<{ id: string; mode: "edit" | "password" } | null>(null);
  const [eName, setEName] = useState(""); const [eCompany, setECompany] = useState(""); const [eEmail, setEEmail] = useState(""); const [eIds, setEIds] = useState<string[]>([]); const [ePassword, setEPassword] = useState("");
  const [deleting, setDeleting] = useState<ClientAccount | null>(null);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "(deleted)";

  const add = () => g.run(async () => {
    if (!name.trim()) throw new Error("Enter a name.");
    if (!email.trim() || !password) throw new Error("A client needs an email and a password.");
    if (password.length < MIN) throw new Error(`Password must be at least ${MIN} characters.`);
    const c = await api.createClient({ name, company, email, password, projectIds: ids });
    setRevealed({ who: `${c.name} (${c.email})`, password });
    setName(""); setCompany(""); setEmail(""); setPassword(""); setIds([]); reload(); toast(`${c.name} added`);
  });
  const openEdit = (c: ClientAccount, mode: "edit" | "password") => {
    if (open?.id === c.id && open.mode === mode) { setOpen(null); return; }
    setOpen({ id: c.id, mode }); g.setError(""); setEName(c.name); setECompany(c.company); setEEmail(c.email); setEIds(c.projectIds); setEPassword("");
  };
  const saveEdit = (c: ClientAccount) => g.run(async () => {
    if (!eName.trim() || !eEmail.trim()) throw new Error("Name and email are required.");
    await api.updateClient(c.id, { name: eName, company: eCompany, email: eEmail, projectIds: eIds });
    setOpen(null); reload(); toast(`${eName} updated`);
  });
  const savePassword = (c: ClientAccount) => g.run(async () => {
    if (ePassword.length < MIN) throw new Error(`Password must be at least ${MIN} characters.`);
    await api.updateClient(c.id, { password: ePassword });
    setRevealed({ who: `${c.name} (${c.email})`, password: ePassword }); setOpen(null); reload(); toast(`Password reset for ${c.name}. They were signed out everywhere.`);
  });

  return (
    <div>
      <ul aria-label="Clients">
        {clients.length === 0 && <li style={row(pal)}><Text secondary>No client accounts yet. Add one below.</Text></li>}
        {clients.map((c) => (
          <li key={c.id} style={row(pal)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Person name={c.name} size={34} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 600 }}>{c.name}{c.company && <span style={{ fontWeight: 400, color: pal.textSecondary }}> · {c.company}</span>}</div>
                <Text size="sm" secondary>{c.email}</Text>
                <div style={{ fontSize: 12, color: pal.textSecondary, marginTop: 2 }}>{c.projectIds.length ? `Projects: ${c.projectIds.map(projectName).join(", ")}` : "No projects assigned"}</div>
              </div>
              <Button size="sm" variant="secondary" aria-label={`Edit ${c.name}`} onClick={() => openEdit(c, "edit")}>Edit</Button>
              <Button size="sm" variant="secondary" aria-label={`Reset password for ${c.name}`} onClick={() => openEdit(c, "password")}>Reset password</Button>
              <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>Delete</Button>
            </div>
            {open?.id === c.id && open.mode === "edit" && (
              <form onSubmit={(e) => { e.preventDefault(); saveEdit(c); }} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, paddingLeft: 46, maxWidth: 560 }}>
                <Err>{g.error}</Err>
                <div className="row2"><Text1 label="Name" value={eName} onChange={setEName} /><Text1 label="Company" value={eCompany} onChange={setECompany} /></div>
                <Text1 label="Email" type="email" value={eEmail} onChange={setEEmail} />
                <ProjectPicker projects={projects} value={eIds} onChange={setEIds} />
                <Text size="sm" secondary>Changing the email signs them out. Access to projects changes immediately.</Text>
                <div style={{ display: "flex", gap: 8 }}><Button type="button" size="sm" loading={g.busy} onClick={() => saveEdit(c)}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button></div>
              </form>
            )}
            {open?.id === c.id && open.mode === "password" && (
              <form onSubmit={(e) => { e.preventDefault(); savePassword(c); }} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, paddingLeft: 46, maxWidth: 520 }}>
                <Err>{g.error}</Err>
                <PasswordField label={`New password (min ${MIN} characters)`} value={ePassword} onChange={setEPassword} />
                <Text size="sm" secondary>Saving signs them out of every device immediately.</Text>
                <div style={{ display: "flex", gap: 8 }}><Button type="button" size="sm" loading={g.busy} onClick={() => savePassword(c)}>Reset password</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button></div>
              </form>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={(e) => { e.preventDefault(); add(); }} aria-label="Add client" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24, maxWidth: 620 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Add a client account</h3>
        {open === null && <Err>{g.error}</Err>}
        <div className="row2"><Text1 label="Name" value={name} onChange={setName} /><Text1 label="Company (optional)" value={company} onChange={setCompany} /></div>
        <div className="row2"><Text1 label="Login email" type="email" value={email} onChange={setEmail} /><PasswordField label={`Password (min ${MIN})`} value={password} onChange={setPassword} /></div>
        <ProjectPicker projects={projects} value={ids} onChange={setIds} />
        <div><Button type="button" loading={g.busy} onClick={add}>Add client</Button></div>
      </form>

      <ConfirmDialog open={!!deleting} title={`Delete ${deleting?.name ?? ""}?`} confirmLabel="Delete client" onClose={() => setDeleting(null)}
        description="Their login stops working immediately. The projects themselves are not affected."
        onConfirm={async () => { if (deleting) { await api.deleteClient(deleting.id); toast(`${deleting.name} deleted`); reload(); } }} />
    </div>
  );
}

// ============================== Projects ==============================
function ProjectsPanel({ projects, reload }: { projects: Project[]; reload: () => void }) {
  const pal = usePalette();
  const toast = useToast();
  const [deleting, setDeleting] = useState<Project | null>(null);
  const sorted = [...projects].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  return (
    <div>
      <ul aria-label="All projects">
        {sorted.length === 0 && <li style={row(pal)}><Text secondary>No projects.</Text></li>}
        {sorted.map((p) => (
          <li key={p.id} style={{ ...row(pal), display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600 }}>{p.name}{p.archived && <span style={{ fontWeight: 400, color: pal.textSecondary }}> · archived</span>}</div>
              <Text size="sm" secondary>{p.client} · {p.total} {p.total === 1 ? "task" : "tasks"}</Text>
            </div>
            <StatusChip status={p.status} />
            <a href={`/#/p/${p.id}`} style={{ fontSize: 13, fontWeight: 600, color: pal.text }} aria-label={`Open ${p.name}`}>Open</a>
            <Button size="sm" variant="ghost" aria-label={`${p.archived ? "Restore" : "Archive"} ${p.name}`}
              onClick={async () => { try { await api.updateProject(p.id, { archived: !p.archived }); toast(p.archived ? "Project restored" : "Project archived"); reload(); } catch (e) { toast((e as Error).message, "error"); } }}>{p.archived ? "Restore" : "Archive"}</Button>
            <Button size="sm" variant="secondary" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>Delete</Button>
          </li>
        ))}
      </ul>
      <TypedConfirmDialog open={!!deleting} expected={deleting?.name ?? ""} title="Delete this project?" confirmLabel="Delete project" onClose={() => setDeleting(null)}
        description={deleting ? `“${deleting.name}” and its ${deleting.total} tasks, comments, links and attachments will be permanently deleted. Clients lose access to it. This can’t be undone.` : ""}
        onConfirm={async () => { if (deleting) { await api.deleteProject(deleting.id); toast("Project deleted"); reload(); } }} />
    </div>
  );
}

// ============================== Console ==============================
const TABS = ["Designers", "Clients", "Projects"];

export function AdminConsole() {
  const [tab, setTab] = useState(TABS[0]);
  const [data, setData] = useState<{ designers: Designer[]; clients: ClientAccount[]; projects: Project[] } | null>(null);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Revealed>(null);

  const load = useCallback(async () => {
    try {
      const [designers, clients, projects] = await Promise.all([api.listDesigners(), api.listClients(), api.listProjects()]);
      setData({ designers, clients, projects }); setError("");
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { document.title = "Admin console · NetoDesign"; load(); }, [load]);

  if (error) return <StateBlock title="Couldn’t load the admin console" description={error} action={<Button onClick={load}>Try again</Button>} />;
  if (!data) return <Loading rows={2} />;
  const openTasks = data.projects.filter((p) => !p.archived).reduce((n, p) => n + p.total - p.counts.done, 0);

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 24 }}>
        <Heading level={1}>Admin console</Heading>
        <Text secondary>Create and manage accounts, reset passwords, and remove projects.</Text>
      </div>
      <div className="stats">
        <Stat label="Designers" value={String(data.designers.length)} />
        <Stat label="Clients" value={String(data.clients.length)} />
        <Stat label="Projects" value={String(data.projects.length)} />
        <Stat label="Open tasks" value={String(openTasks)} />
      </div>
      <div style={{ marginBottom: 20 }}><Tabs tabs={TABS} value={tab} onChange={(t: string) => { setTab(t); setRevealed(null); }} /></div>
      <RevealBanner revealed={revealed} onDismiss={() => setRevealed(null)} />
      {tab === "Designers" && <DesignersPanel designers={data.designers} reload={load} setRevealed={setRevealed} />}
      {tab === "Clients" && <ClientsPanel clients={data.clients} projects={data.projects} reload={load} setRevealed={setRevealed} />}
      {tab === "Projects" && <ProjectsPanel projects={data.projects} reload={load} />}
    </div>
  );
}
