import { StrictMode, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Button, Heading, Text, TextInput } from "./halaska-kit";
import { api } from "./api";
import { Timesheet } from "./Timesheet";
import { Providers, usePalette } from "./theme";
import { ToastProvider, Loading, val } from "./ui";

/** The Emerald timesheet as its own small site (neto.design/emerald): its own password, its own session, no portal around it. */
function Mark() {
  return <span className="nav__brand" style={{ fontSize: 20 }}><span className="nav__mark" /><span className="nav__word">Emerald</span><span style={{ fontWeight: 400, opacity: 0.55 }}>timesheet</span></span>;
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
    <main className="login-wrap">
      <form onSubmit={submit} style={{ width: "min(100%, 360px)", display: "flex", flexDirection: "column", gap: 18 }} noValidate>
        <div style={{ marginBottom: 14 }}><Mark /></div>
        <div><Heading level={1}>Sign in</Heading><Text secondary>This page is private. Enter the password to open the timesheet.</Text></div>
        {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {error}</p>}
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
  return (
    <>
      <header className="emerald-top" style={{ borderBottom: `1px solid ${pal.border}` }}>
        <Mark />
        <Button variant="secondary" size="sm" onClick={async () => { try { await api.emeraldLogout(); } finally { setState("out"); } }}>Sign out</Button>
      </header>
      <main className="emerald-main"><Timesheet /></main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Providers><ToastProvider><Site /></ToastProvider></Providers></StrictMode>);
