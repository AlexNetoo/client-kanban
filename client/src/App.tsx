import { useEffect, useRef, useState } from "react";
import { Button, IconButton, Sheet } from "./halaska-kit";
import { api } from "./api";
import { Board } from "./Board";
import { ClientView } from "./ClientView";
import { Dashboard } from "./Dashboard";
import { ProjectsProvider } from "./nav";
import { Nav } from "./Sidebar";
import { Settings } from "./Settings";
import { SessionProvider, type Me } from "./session";
import { TeamPage } from "./TeamPage";
import { StateBlock } from "./ui";
import { usePalette } from "./theme";

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const on = () => { setHash(location.hash); window.scrollTo(0, 0); }; window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  return hash.replace(/^#/, "") || "/";
}

const Brand = () => (
  <a href="#/" style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 800, letterSpacing: "-0.02em", textDecoration: "none" }}>
    <img src="/favicon.svg" alt="" width={24} height={24} /> Project Hub
  </a>
);

export function App() {
  const pal = usePalette();
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState(false);
  const route = useHash();
  const main = useRef<HTMLElement>(null);
  useEffect(() => { api.session().then((s) => setMe({ role: s.role, designer: s.designer, expiresAt: s.expiresAt, maxUploadBytes: s.maxUploadBytes })).catch(() => {}); }, []);
  if (!me) return null;
  const role = me.role;

  const [, kind, param, sub, subParam] = route.split("/");
  let view;
  if (kind === "c" && param && role !== "designer") view = <ClientView key={param} token={decodeURIComponent(param)} role={role} />;
  else if (role === "client") view = <StateBlock title="Open your project link" description="Use the link your freelancer sent you to see your project’s progress." />;
  else if (kind === "settings") view = <Settings />;
  else if (kind === "team" && role === "owner") view = <TeamPage />;
  else if (kind === "p" && param) view = <Board key={param} id={decodeURIComponent(param)} taskId={sub === "t" && subParam ? decodeURIComponent(subParam) : undefined} />;
  else view = <Dashboard />;

  const skip = <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Skip to content</a>;

  // Clients only ever see the project link they were given: no menu.
  if (role === "client") {
    return (
      <SessionProvider value={me}>
        {skip}
        <header style={{ borderBottom: `1px solid ${pal.border}` }}>
          <div className="wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingTop: 14, paddingBottom: 14 }}>
            <Brand />
            <Button variant="secondary" size="sm" onClick={async () => { try { await api.logout(); } finally { location.replace("/login"); } }}>Sign out</Button>
          </div>
        </header>
        <main id="main" ref={main} tabIndex={-1} className="wrap page">{view}</main>
      </SessionProvider>
    );
  }

  return (
    <SessionProvider value={me}>
      <ProjectsProvider>
        {skip}
        <div className="shell">
          <aside className="sidebar" style={{ borderRight: `1px solid ${pal.border}`, background: pal.bg }}>
            <div style={{ padding: "4px 12px 18px" }}><Brand /></div>
            <Nav route={route} />
          </aside>
          <div className="shell-main">
            <header className="topbar" style={{ borderBottom: `1px solid ${pal.border}` }}>
              <IconButton icon={<span aria-hidden="true" style={{ fontSize: 18 }}>☰</span>} label="Open menu" onClick={() => setMenu(true)} aria-haspopup="dialog" />
              <Brand />
            </header>
            <main id="main" ref={main} tabIndex={-1} className="page" style={{ maxWidth: 1280, margin: "0 auto", padding: "36px 28px 96px" }}>{view}</main>
          </div>
        </div>
        <Sheet open={menu} onClose={() => setMenu(false)} title="Menu" side="left"><div style={{ height: "calc(100vh - 110px)", display: "flex", flexDirection: "column" }}><Nav route={route} onNavigate={() => setMenu(false)} /></div></Sheet>
      </ProjectsProvider>
    </SessionProvider>
  );
}
