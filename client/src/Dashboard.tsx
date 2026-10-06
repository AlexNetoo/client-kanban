import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, DropdownMenu, Heading, Progress, Stat, Tabs, Text } from "./halaska-kit";
import { api } from "./api";
import { ProjectDialog } from "./dialogs";
import { TeamDialog } from "./TeamDialog";
import { CalendarIcon, ConfirmDialog, Loading, PlusIcon, StateBlock, useToast } from "./ui";
import { usePalette } from "./theme";
import { formatDate, isOverdue } from "./lib/format";
import { PROJECT_STATUS, type Project } from "./types";

export const clientLink = (p: Project) => `${location.origin}/#/c/${p.shareToken}`;

export function DueLabel({ date, done = false }: { date: string; done?: boolean }) {
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
        trigger={<Button variant="secondary" size="sm" aria-label={`More actions for ${project.name}`}>More</Button>}
        items={[
          { label: "Edit project", onClick: () => setEdit(true) },
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
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"Active" | "Archived">("Active");
  const [creating, setCreating] = useState(false);
  const [team, setTeam] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try { setProjects(await api.listProjects()); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { document.title = "Projects · Project Hub"; load(); }, [load]);

  if (error) return <StateBlock title="Couldn’t load projects" description={error} action={<Button onClick={() => { setProjects(null); load(); }}>Try again</Button>} />;
  if (!projects) return <Loading />;

  const live = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const shown = [...(tab === "Active" ? live : archived)].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const open = live.reduce((n, p) => n + p.total - p.counts.done, 0);
  const sum = (k: "in_progress" | "in_review") => live.reduce((n, p) => n + p.counts[k], 0);

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 28 }}>
        <div>
          <Heading level={1}>Projects</Heading>
          <Text secondary>Everything in flight, and how it looks to each client.</Text>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => setTeam(true)}>Team</Button>
          <Button icon={<PlusIcon />} onClick={() => setCreating(true)}>New project</Button>
        </div>
      </div>

      <div className="stats">
        <Stat label="Active projects" value={String(live.length)} />
        <Stat label="Open tasks" value={String(open)} />
        <Stat label="In progress" value={String(sum("in_progress"))} />
        <Stat label="Awaiting review" value={String(sum("in_review"))} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <Tabs tabs={["Active", "Archived"]} value={tab} onChange={(t: string) => setTab(t as "Active" | "Archived")} />
        <span className="sr-only">{live.length} active, {archived.length} archived</span>
      </div>

      {shown.length === 0 ? (
        tab === "Active"
          ? <StateBlock title="No projects yet" description="Create your first project to start a board and share progress with a client." action={<Button onClick={() => setCreating(true)}>New project</Button>} />
          : <StateBlock title="Nothing archived" description="Archived projects are kept here, hidden from clients." />
      ) : (
        <ul className="grid" aria-label={`${tab} projects`}>
          {shown.map((p) => (
            <li key={p.id} style={{ display: "flex" }}>
              <Card padding={22} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 18, borderRadius: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}><a href={`#/p/${p.id}`} style={{ textDecoration: "none" }}>{p.name}</a></h2>
                    <Text size="sm" secondary>{p.client}</Text>
                  </div>
                  <Badge>{PROJECT_STATUS[p.status]}</Badge>
                </div>
                <div>
                  <Progress value={p.progress} />
                  <p style={{ marginTop: 8, fontSize: 13, color: pal.textSecondary }}>{p.progress}% · {p.counts.done} of {p.total} tasks done</p>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: "auto" }}>
                  <DueLabel date={p.dueDate} done={p.status === "completed"} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Button size="sm" aria-label={`Open board for ${p.name}`} onClick={() => { location.hash = `#/p/${p.id}`; }}>Open board</Button>
                    <ProjectMenu project={p} onChange={load} />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {team && <TeamDialog onClose={() => setTeam(false)} onChanged={() => {}} />}
      {creating && <ProjectDialog onClose={() => setCreating(false)} onSaved={load} />}
    </>
  );
}
