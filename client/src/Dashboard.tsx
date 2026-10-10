import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, DropdownMenu, Heading, Progress, Stat, Tabs, Text } from "./halaska-kit";
import { api } from "./api";
import { ProjectDialog } from "./dialogs";
import { RequestList } from "./Requests";
import { StatusChip } from "./chips";
import { useProjectsNav } from "./nav";
import { CalendarIcon, ChevronDownIcon, ConfirmDialog, RepeatIcon, Loading, PlusIcon, StateBlock, useToast } from "./ui";
import { usePalette } from "./theme";
import { useMe } from "./session";
import { formatDate, isOverdue } from "./lib/format";
import { type Project, type ProjectRequest } from "./types";

export const clientLink = (p: Project) => `${location.origin}/#/c/${p.shareToken}`;

export function DueLabel({ date, done = false, recurring = false }: { date: string; done?: boolean; recurring?: boolean }) {
  if (recurring) return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13 }}><RepeatIcon />Recurring</span>;
  if (!date) return <Text size="sm" secondary>No due date</Text>;
  const late = isOverdue(date, done);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: late ? 700 : 400, textDecoration: late ? "underline dotted" : "none", textUnderlineOffset: 3 }}>
      <CalendarIcon />{late ? "Overdue · " : "Due "}{formatDate(date)}
    </span>
  );
}

/** Per-project actions, shared by dashboard cards and the board header. */
export function ProjectMenu({ project, onChange, afterDelete }: { project: Project; onChange: () => void; afterDelete?: () => void }) {
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [reset, setReset] = useState(false);
  const [del, setDel] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(clientLink(project)); toast("Client link copied"); }
    catch { toast("Couldn’t copy automatically. Open the client view and copy the address.", "error"); }
  };
  const archive = async () => {
    try { await api.updateProject(project.id, { archived: !project.archived }); toast(project.archived ? "Project restored" : "Project archived"); onChange(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <>
      <DropdownMenu
        trigger={<Button variant="secondary" size="sm" aria-label={`Manage ${project.name}`}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Manage project<ChevronDownIcon /></span></Button>}
        items={[
          { label: "Edit project", onClick: () => setEdit(true) },
          { label: "Admin console", onClick: () => { location.href = "/admin"; } },
          { label: "Preview client view", onClick: () => { location.hash = `#/c/${project.shareToken}`; } },
          { label: "Copy client link", onClick: copy },
          { label: "Reset client link", onClick: () => setReset(true) },
          { label: project.archived ? "Restore from archive" : "Archive project", onClick: archive },
          { separator: true },
          { label: "Delete project", onClick: () => setDel(true) },
        ]} />
      {edit && <ProjectDialog project={project} onClose={() => setEdit(false)} onSaved={onChange} />}
      <ConfirmDialog open={reset} title="Reset client link?" confirmLabel="Reset link" onClose={() => setReset(false)}
        description="The current link will stop working. Share the new link with your client."
        onConfirm={async () => { await api.updateProject(project.id, { resetShareToken: true }); toast("Link reset"); onChange(); }} />
      <ConfirmDialog open={del} title="Delete this project?" onClose={() => setDel(false)}
        description={`“${project.name}” and all of its tasks will be permanently deleted. Archive it instead to keep the history.`}
        onConfirm={async () => { await api.deleteProject(project.id); toast("Project deleted"); (afterDelete ?? onChange)(); }} />
    </>
  );
}

export function Dashboard() {
  const pal = usePalette();
  const me = useMe();
  const owner = me.role === "owner";
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"Active" | "Archived">("Active");
  const [creating, setCreating] = useState(false);
  const nav = useProjectsNav();
  const [requests, setRequests] = useState<ProjectRequest[]>([]);

  const load = useCallback(async () => {
    setError("");
    try { setProjects(await api.listProjects()); nav.reload(); if (me.role === "client") api.listRequests().then(setRequests).catch(() => {}); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { document.title = "Projects · Alex Neto - Client Portal"; load(); }, [load]);

  if (error) return <StateBlock title="Couldn’t load projects" description={error} action={<Button onClick={() => { setProjects(null); load(); }}>Try again</Button>} />;
  if (!projects) return <Loading />;

  const live = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const shown = [...(owner && tab === "Archived" ? archived : live)].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const open = live.reduce((n, p) => n + p.total - p.counts.done, 0);
  const sum = (k: "in_progress" | "in_review") => live.reduce((n, p) => n + p.counts[k], 0);

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 28 }}>
        <div>
          <Heading level={1}>{owner ? "Projects" : "My projects"}</Heading>
          <Text secondary>{owner ? "Everything in flight, and how it looks to each client." : me.role === "client" ? "Projects shared with you. Open one to follow the work and leave comments." : "Projects with tasks assigned to you."}</Text>
        </div>
        {owner && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => { location.href = "/admin"; }}>Admin console</Button>
          <Button icon={<PlusIcon />} onClick={() => setCreating(true)}>New project</Button>
        </div>}
        {me.role === "client" && <Button icon={<PlusIcon />} onClick={() => { location.hash = "#/new"; }}>New project</Button>}
      </div>

      {owner && <div className="stats">
        <Stat label="Active projects" value={String(live.length)} />
        <Stat label="Open tasks" value={String(open)} />
        <Stat label="In progress" value={String(sum("in_progress"))} />
        <Stat label="Awaiting review" value={String(sum("in_review"))} />
      </div>}

      {owner && <div style={{ marginBottom: 24 }}>
        <Tabs tabs={["Active", "Archived"]} value={tab} onChange={(t: string) => setTab(t as "Active" | "Archived")} />
        <span className="sr-only">{live.length} active, {archived.length} archived</span>
      </div>}

      {shown.length === 0 ? (
        !owner ? <StateBlock title="No projects yet" action={me.role === "client" ? <Button onClick={() => { location.hash = "#/new"; }}>Start a new project</Button> : undefined} description={me.role === "client" ? "Projects appear here once they are approved. Start by telling us about your project." : "You’ll see a project here once a task is assigned to you."} />
        : tab === "Active"
          ? <StateBlock title="No projects yet" description="Create your first project to start a board and share progress with a client." action={<Button onClick={() => setCreating(true)}>New project</Button>} />
          : <StateBlock title="Nothing archived" description="Archived projects are kept here, hidden from clients." />
      ) : (
        <ul className="grid" aria-label={`${tab} projects`}>
          {shown.map((p) => (
            <li key={p.id} style={{ display: "flex" }}>
              <div className="lift"><Card padding={22} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 18, borderRadius: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}><a href={`#/p/${p.id}`} style={{ textDecoration: "none" }}>{p.name}</a></h2>
                    <Text size="sm" secondary>{p.client}</Text>
                  </div>
                  <StatusChip status={p.status} />
                </div>
                <div>
                  <Progress value={p.progress} />
                  <p style={{ marginTop: 8, fontSize: 13, color: pal.textSecondary }}>{p.progress}% · {p.counts.done} of {p.total} tasks done</p>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: "auto" }}>
                  <DueLabel date={p.dueDate} recurring={p.recurring} done={p.status === "completed"} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Button size="sm" aria-label={`Open board for ${p.name}`} onClick={() => { location.hash = `#/p/${p.id}`; }}>Open board</Button>
                    {owner && <ProjectMenu project={p} onChange={load} />}
                  </div>
                </div>
              </Card></div>
            </li>
          ))}
        </ul>
      )}
      {me.role === "client" && requests.length > 0 && (
        <section style={{ marginTop: 40 }} aria-label="Your project requests">
          <Heading level={2}>Your requests</Heading>
          <p style={{ margin: "4px 0 16px" }}><Text secondary>Briefs you’ve sent. Approved ones become projects.</Text></p>
          <RequestList requests={requests} />
        </section>
      )}
      {creating && <ProjectDialog onClose={() => setCreating(false)} onSaved={load} />}
    </>
  );
}
