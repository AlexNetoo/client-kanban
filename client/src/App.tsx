import { useEffect, useRef, useState } from "react";
import { Button } from "./halaska-kit";
import { api } from "./api";
import { Board } from "./Board";
import { ClientView } from "./ClientView";
import { Dashboard } from "./Dashboard";
import { PasswordDialog } from "./PasswordDialog";
import { SessionProvider, type Me } from "./session";
import { StateBlock } from "./ui";
import { usePalette } from "./theme";

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const on = () => { setHash(location.hash); window.scrollTo(0, 0); }; window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  return hash.replace(/^#/, "") || "/";
}

export function App() {
  const pal = usePalette();
  const [me, setMe] = useState<Me | null>(null);
  const [pw, setPw] = useState(false);
  const route = useHash();
  const main = useRef<HTMLElement>(null);
  useEffect(() => { api.session().then((s) => setMe({ role: s.role, designer: s.designer })).catch(() => {}); }, []);
  if (!me) return null;
  const role = me.role;

  const [, kind, param] = route.split("/");
  let view;
  if (kind === "c" && param && role !== "designer") view = <ClientView key={param} token={decodeURIComponent(param)} role={role} />;
  else if (role === "client") view = <StateBlock title="Open your project link" description="Use the link your freelancer sent you to see your project’s progress." />;
  else if (kind === "p" && param) view = <Board key={param} id={decodeURIComponent(param)} />;
  else view = <Dashboard />;

  return (
    <SessionProvider value={me}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Skip to content</a>
      <header style={{ borderBottom: `1px solid ${pal.border}` }}>
        <div className="wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingTop: 14, paddingBottom: 14 }}>
          <a href={role === "owner" ? "#/" : "#"} style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 800, letterSpacing: "-0.02em", textDecoration: "none" }}>
            <img src="/favicon.svg" alt="" width={24} height={24} /> Project Hub
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {role === "designer" && me.designer && <span style={{ fontSize: 13, color: pal.textSecondary }}>{me.designer.name}</span>}
            {role === "designer" && <Button variant="ghost" size="sm" onClick={() => setPw(true)}>Change password</Button>}
            <Button variant="secondary" size="sm" onClick={async () => { try { await api.logout(); } finally { location.replace("/login"); } }}>Sign out</Button>
          </div>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1} className="wrap page">{view}</main>
      {pw && <PasswordDialog onClose={() => setPw(false)} />}
    </SessionProvider>
  );
}
