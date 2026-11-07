import { StrictMode, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Button, Heading, Text, TextInput } from "./halaska-kit";
import { api } from "./api";
import { Timesheet } from "./Timesheet";
import { markReady } from "./intro";
import { Providers, usePalette } from "./theme";
import { ToastProvider, Loading, val, Brand } from "./ui";
import { Item, ClockIcon, FolderIcon, ShieldIcon, LogOutIcon } from "./Sidebar";

markReady(); // there is no intro on this site

/** The Emerald timesheet as its own small site (neto.design/emerald): its own password, its own session, no portal around it. */
function Mark() {
  return <Brand href="/emerald" label="Emerald" />;
}

function SignIn({ onDone }: { onDone: () => void }) {
  const pal = usePalette();
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { document.title = "Emerald timesheet · Sign in"; }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) { setError("Please enter the password."); return; }
    setBusy(true); setError("");
    try { await api.emeraldLogin(password); onDone(); } catch (ex) { setError((ex as Error).message); setPassword(""); setBusy(false); }
  };
  return (
    <main className="login-wrap hero">
      <form onSubmit={submit} style={{ width: "min(100%, 360px)", display: "flex", flexDirection: "column", gap: 18 }} noValidate>
        <div style={{ marginBottom: 14 }}><Mark /></div>
        <div><Heading level={1}>Sign in</Heading><Text secondary>This page is private. Enter the password to open the timesheet.</Text></div>
        {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 5, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {error}</p>}
        <TextInput label="Password" type="password" value={password} onChange={(e: never) => setPassword(val(e))} aria-label="Password" autoComplete="current-password" />
        <Button type="submit" loading={busy} fullWidth>Open timesheet</Button>
      </form>
    </main>
  );
}

function Site() {
  const pal = usePalette();
  const [state, setState] = useState<"checking" | "in" | "out">("checking");
  useEffect(() => { api.emeraldSession().then(() => setState("in")).catch(() => setState("out")); }, []);
  if (state === "checking") return <div style={{ padding: 32 }}><Loading rows={1} /></div>;
  if (state === "out") return <SignIn onDone={() => setState("in")} />;
  const signOut = async () => { try { await api.emeraldLogout(); } finally { setState("out"); } };
  return (
    <div className="shell emerald-shell">
      <aside className="sidebar" style={{ borderRight: `1px solid ${pal.border}`, background: pal.bg }}>
        <div style={{ padding: "2px 2px 16px 10px" }}><Mark /></div>
        <nav aria-label="Main" style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0 }}>
          <Item href="/emerald" active label="Timesheet" icon={<ClockIcon />} />
          <Item href="/" label="Projects" icon={<FolderIcon />} />
          <Item href="/admin" label="Admin console" icon={<ShieldIcon />} />
          <div style={{ marginTop: "auto", paddingTop: 12 }}><Item label="Log out" icon={<LogOutIcon />} onClick={signOut} /></div>
        </nav>
      </aside>
      <div className="shell-main">
        <header className="topbar" style={{ borderBottom: `1px solid ${pal.border}`, justifyContent: "space-between" }}>
          <Mark />
          <Button variant="secondary" size="sm" onClick={signOut}>Log out</Button>
        </header>
        <main className="emerald-main"><Timesheet /></main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Providers><ToastProvider><Site /></ToastProvider></Providers></StrictMode>);
