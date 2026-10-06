import { useEffect, useState } from "react";
import { Button, Card, Heading, Progress, Text } from "./halaska-kit";
import { api } from "./api";
import { DueLabel } from "./Dashboard";
import { StatusChip } from "./chips";
import { Loading, StateBlock } from "./ui";
import { usePalette } from "./theme";
import type { MyProject } from "./types";

/** A client's home: the projects the admin assigned to this account. */
export function ClientHome() {
  const pal = usePalette();
  const [projects, setProjects] = useState<MyProject[] | null>(null);
  const [error, setError] = useState("");
  const load = () => { setError(""); api.myProjects().then(setProjects).catch((e) => setError(e.message)); };
  useEffect(() => { document.title = "Your projects · Project Hub"; load(); }, []);

  if (error) return <StateBlock title="Couldn’t load your projects" description={error} action={<Button onClick={load}>Try again</Button>} />;
  if (!projects) return <Loading />;
  return (
    <>
      <div style={{ marginBottom: 28 }}><Heading level={1}>Your projects</Heading><Text secondary>Open a project to see its progress and the latest updates.</Text></div>
      {projects.length === 0
        ? <StateBlock title="No projects yet" description="Projects will appear here as soon as they are shared with you." />
        : (
          <ul className="grid" aria-label="Your projects">
            {projects.map((p) => (
              <li key={p.token} style={{ display: "flex" }}>
                <Card padding={22} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 18, borderRadius: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}><a href={`#/c/${p.token}`} style={{ textDecoration: "none" }}>{p.name}</a></h2>
                      <Text size="sm" secondary>{p.client}</Text>
                    </div>
                    <StatusChip status={p.status} />
                  </div>
                  <div><Progress value={p.progress} /><p style={{ marginTop: 8, fontSize: 13, color: pal.textSecondary }}>{p.progress}% · {p.counts.done} of {p.total} tasks done</p></div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: "auto" }}>
                    <DueLabel date={p.dueDate} recurring={p.recurring} />
                    <Button size="sm" onClick={() => { location.hash = `#/c/${p.token}`; }} aria-label={`View progress of ${p.name}`}>View progress</Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
