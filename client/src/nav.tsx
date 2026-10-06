import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { useMe } from "./session";
import type { Project } from "./types";

type Nav = { projects: Project[]; reload: () => void };
const Ctx = createContext<Nav>({ projects: [], reload: () => {} });
export const useProjectsNav = () => useContext(Ctx);

/** Project list shared by the side menu and the screens, so both stay in sync after changes. */
export function ProjectsProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const [projects, setProjects] = useState<Project[]>([]);
  const reload = useCallback(() => {
    api.listProjects().then((p) => setProjects(p.filter((x) => !x.archived))).catch(() => {});
  }, [me.role]);
  useEffect(() => { reload(); }, [reload]);
  return <Ctx.Provider value={{ projects, reload }}>{children}</Ctx.Provider>;
}
