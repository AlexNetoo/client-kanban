import { useEffect, useRef, useState } from "react";
import { Sheet } from "./halaska-kit";
import { api, loginPath } from "./api";
import { AdminConsole } from "./AdminConsole";
import { Board } from "./Board";
import { ClientView } from "./ClientView";
import { Dashboard } from "./Dashboard";
import { ProjectsProvider } from "./nav";
import { Nav } from "./Sidebar";
import { Settings } from "./Settings";
import { SessionProvider, type Me } from "./session";
import { Brand } from "./ui";
import { isDemo } from "./demo";

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const on = () => { setHash(location.hash); window.scrollTo(0, 0); }; window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  return hash.replace(/^#/, "") || "/";
}


const signOut = async () => { try { await api.logout(); } finally { location.replace(loginPath()); } };
export const isAdminPath = () => location.pathname.replace(/\/+$/, "") === "/admin";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState(false);
  const route = useHash();
  const main = useRef<HTMLElement>(null);
  useEffect(() => { api.session().then((s) => setMe({ role: s.role, designer: s.designer, client: s.client, expiresAt: s.expiresAt, maxUploadBytes: s.maxUploadBytes, ai: s.ai, mail: s.mail, notify: s.notify })).catch(() => {}); }, []);
  if (!me) return null;
  const role = me.role;
  const skip = <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Skip to content</a>;
  const [, kind, param, sub, subParam] = route.split("/");

  // Everyone gets the same layout; what they can do differs (admin: everything, designer: their tasks, client: read and comment).
  const admin = role === "owner" && isAdminPath();
  let view;
  if (admin) view = <AdminConsole />;
  else if (kind === "c" && param && role === "owner") view = <ClientView key={param} token={decodeURIComponent(param)} role={role} />;
  else if (kind === "settings") view = <Settings />;
  else if (kind === "p" && param) view = <Board key={param} id={decodeURIComponent(param)} taskId={sub === "t" && subParam ? decodeURIComponent(subParam) : undefined} />;
  else view = <Dashboard />;

  const home = isDemo() ? "/demo" : "/"; // the demo lives at /demo, so links must stay there
  const owner = role === "owner";
  const links: { href: string; label: string; active: boolean }[] = [
    { href: `${home}#/`, label: owner ? "Projects" : "My projects", active: !admin && (kind === undefined || kind === "" || kind === "p") },
    ...(owner ? [{ href: "/admin", label: "Admin console", active: admin }] : []),
    { href: `${home}#/settings`, label: "Settings", active: !admin && kind === "settings" },
  ];

  // The same frame as alexneto.com/admin: the name on the left, links and a black pill on the right, one centred column.
  return (
    <SessionProvider value={me}>
      <ProjectsProvider>
        {skip}
        <div className="portal">
          <header className="ptop">
            <Brand href={`${home}#/`} />
            <nav className="ptop__nav" aria-label="Main">
              {links.map((l) => <a key={l.href} href={l.href} className="ptop__link" aria-current={l.active ? "page" : undefined}>{l.label}</a>)}
              <button type="button" className="ppill" onClick={signOut}>Log out</button>
            </nav>
            <button type="button" className="ptop__menu" onClick={() => setMenu(true)} aria-haspopup="dialog">Menu</button>
          </header>
          <main id="main" ref={main} tabIndex={-1} className="ppage">{view}</main>
        </div>
        {isDemo() && <div className="demo-pill" role="status"><span>Demo: a sample project. Nothing is saved.</span><button type="button" onClick={() => { location.href = "/login"; }}>Exit demo</button></div>}
        <Sheet open={menu} onClose={() => setMenu(false)} title="Menu" side="right"><div style={{ height: "calc(100vh - 110px)", display: "flex", flexDirection: "column" }}><Nav route={route} admin={admin} onNavigate={() => setMenu(false)} /></div></Sheet>
      </ProjectsProvider>
    </SessionProvider>
  );
}
