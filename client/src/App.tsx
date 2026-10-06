import { useEffect, useRef, useState } from "react";
import { Button, IconButton, Sheet } from "./halaska-kit";
import { api, loginPath } from "./api";
import { AdminConsole } from "./AdminConsole";
import { Board } from "./Board";
import { ClientView } from "./ClientView";
import { Dashboard } from "./Dashboard";
import { ProjectsProvider } from "./nav";
import { Onboarding } from "./Onboarding";
import { Nav } from "./Sidebar";
import { Settings } from "./Settings";
import { SessionProvider, type Me } from "./session";
import { Brand } from "./ui";
import { usePalette } from "./theme";
import { isDemo } from "./demo";

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const on = () => { setHash(location.hash); window.scrollTo(0, 0); }; window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  return hash.replace(/^#/, "") || "/";
}


const signOut = async () => { try { await api.logout(); } finally { location.replace(loginPath()); } };
export const isAdminPath = () => location.pathname.replace(/\/+$/, "") === "/admin";

export function App() {
  const pal = usePalette();
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("sidebar") === "collapsed"; } catch { return false; } });
  const toggleSide = () => setCollapsed((c) => { try { localStorage.setItem("sidebar", c ? "open" : "collapsed"); } catch { /* storage unavailable */ } return !c; });
  const route = useHash();
  const main = useRef<HTMLElement>(null);
  useEffect(() => { api.session().then((s) => setMe({ role: s.role, designer: s.designer, client: s.client, expiresAt: s.expiresAt, maxUploadBytes: s.maxUploadBytes, ai: s.ai })).catch(() => {}); }, []);
  if (!me) return null;
  const role = me.role;
  const skip = <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Skip to content</a>;
  const [, kind, param, sub, subParam] = route.split("/");

  // Everyone gets the same layout; what they can do differs (admin: everything, designer: their tasks, client: read and comment).
  const admin = role === "owner" && isAdminPath();
  let view;
  if (admin) view = <AdminConsole />;
  else if (kind === "c" && param && role === "owner") view = <ClientView key={param} token={decodeURIComponent(param)} role={role} />;
  else if (kind === "new" && role === "client") view = <Onboarding />;
  else if (kind === "settings") view = <Settings />;
  else if (kind === "p" && param) view = <Board key={param} id={decodeURIComponent(param)} taskId={sub === "t" && subParam ? decodeURIComponent(subParam) : undefined} />;
  else view = <Dashboard />;

  return (
    <SessionProvider value={me}>
      <ProjectsProvider>
        {skip}
        <div className={collapsed ? "shell is-collapsed" : "shell"}>
          <aside className="sidebar" style={{ borderRight: `1px solid ${pal.border}`, background: pal.bg }}>
            <div style={{ padding: collapsed ? "2px 0 20px" : "4px 4px 22px 12px", display: "flex", alignItems: collapsed ? "center" : "flex-start", justifyContent: collapsed ? "center" : "space-between", gap: 4 }}>
              {!collapsed && <Brand href={isDemo() ? "/demo#/" : "/#/"} />}
              <button type="button" className="side-toggle" onClick={toggleSide} aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} style={{ color: pal.textSecondary }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              </button>
            </div>
            <Nav route={route} admin={admin} collapsed={collapsed} />
          </aside>
          <div className="shell-main">
            <header className="topbar" style={{ borderBottom: `1px solid ${pal.border}` }}>
              <IconButton icon={<span aria-hidden="true" style={{ fontSize: 18 }}>☰</span>} label="Open menu" onClick={() => setMenu(true)} aria-haspopup="dialog" />
              <Brand href={isDemo() ? "/demo#/" : "/#/"} />
            </header>
            <main id="main" ref={main} tabIndex={-1} className="page" style={{ maxWidth: 1280, margin: "0 auto", padding: "36px 28px 96px" }}>{view}</main>
          </div>
        </div>
        {isDemo() && <div className="demo-pill" role="status"><span>Demo: a sample project. Nothing is saved.</span><button type="button" onClick={() => { location.href = "/login"; }}>Exit demo</button></div>}
        <Sheet open={menu} onClose={() => setMenu(false)} title="Menu" side="left"><div style={{ height: "calc(100vh - 110px)", display: "flex", flexDirection: "column" }}><Nav route={route} admin={admin} onNavigate={() => setMenu(false)} /></div></Sheet>
      </ProjectsProvider>
    </SessionProvider>
  );
}
