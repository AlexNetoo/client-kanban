import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Button, Heading, Tabs, Text, TextInput } from "./halaska-kit";
import { api } from "./api";
import { Providers, usePalette } from "./theme";
import { val } from "./ui";

const TAB_STAFF = "Freelancer or client";
const TAB_DESIGNER = "Designer";

function Login() {
  const pal = usePalette();
  const [tab, setTab] = useState(TAB_STAFF);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(new URLSearchParams(location.search).get("expired") ? "Your session ended. Please sign in again." : "");
  const [busy, setBusy] = useState(false);
  const designer = tab === TAB_DESIGNER;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (designer && !email.trim()) { setError("Please enter your email."); return; }
    if (!password) { setError("Please enter the password."); return; }
    setBusy(true); setError("");
    try { await api.login(password, designer ? email.trim() : undefined); location.replace("/" + location.hash); } // keeps #/c/<token> for shared client links
    catch (ex) { setError((ex as Error).message); setBusy(false); }
  };

  return (
    <main className="login-wrap">
      <form onSubmit={submit} style={{ width: "min(100%, 380px)", display: "flex", flexDirection: "column", gap: 18 }} noValidate>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 18 }}>
          <img src="/favicon.svg" alt="" width={24} height={24} /> Project Hub
        </div>
        <div><Heading level={1}>Sign in</Heading><Text secondary>{designer ? "Use the email and password your freelancer set up for you." : "Enter the password you were given to view project progress."}</Text></div>
        <Tabs tabs={[TAB_STAFF, TAB_DESIGNER]} value={tab} onChange={(t: string) => { setTab(t); setError(""); }} />
        {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {error}</p>}
        {designer && <TextInput label="Email" type="email" value={email} onChange={(e: never) => setEmail(val(e))} aria-label="Email" />}
        <TextInput label="Password" type="password" value={password} onChange={(e: never) => setPassword(val(e))} aria-label="Password" />
        <Button type="submit" loading={busy} fullWidth>Sign in</Button>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Providers><Login /></Providers></StrictMode>);
