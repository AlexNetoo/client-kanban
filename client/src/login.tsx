import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { runIntro } from "./intro";
import { HeroBackground } from "./HeroBackground";
runIntro();
import { Button, Heading, Tabs, Text, TextInput } from "./halaska-kit";
import { api } from "./api";
import { Providers, usePalette } from "./theme";
import { val } from "./ui";

const TAB_CLIENT = "Client"; // the main way in, so it comes first
const TAB_DESIGNER = "Designer";
const COPY: Record<string, string> = {
  [TAB_DESIGNER]: "Sign in with the email and password you were given to see the tasks assigned to you.",
  [TAB_CLIENT]: "Sign in with your email and password to follow the progress of your projects.",
};
// /admin shows the admin sign-in (password only); everything else is the designer / client sign-in.
const ADMIN = location.pathname.replace(/\/+$/, "") === "/admin";

function Login() {
  const pal = usePalette();
  const [tab, setTab] = useState(TAB_CLIENT);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(new URLSearchParams(location.search).get("expired") ? "Your session ended. Please sign in again." : "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ADMIN && !email.trim()) { setError("Please enter your email."); return; }
    if (!password) { setError("Please enter your password."); return; }
    setBusy(true); setError("");
    try {
      if (ADMIN) await api.login(password);
      else await api.login(password, { email: email.trim(), as: tab === TAB_CLIENT ? "client" : "designer" });
      location.replace(ADMIN ? "/admin" : "/" + location.hash); // the hash keeps #/c/<token> links working
    } catch (ex) { setError((ex as Error).message); setPassword(""); setBusy(false); }
  };

  return (
    <main className="login-wrap hero">
      <HeroBackground />
      <form onSubmit={submit} style={{ width: "min(100%, 380px)", display: "flex", flexDirection: "column", gap: 18 }} noValidate>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 18 }}>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="currentColor" /></svg> NetoDesign
        </div>
        <div>
          <Heading level={1}>{ADMIN ? "Admin sign in" : "Sign in"}</Heading>
          <Text secondary>{ADMIN ? "Enter the admin password to manage accounts and projects." : COPY[tab]}</Text>
        </div>
        {!ADMIN && <Tabs tabs={[TAB_CLIENT, TAB_DESIGNER]} value={tab} onChange={(t: string) => { setTab(t); setError(""); setPassword(""); }} />}
        {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {error}</p>}
        {!ADMIN && <TextInput label="Email" type="email" value={email} onChange={(e: never) => setEmail(val(e))} aria-label="Email" />}
        <TextInput label="Password" type="password" value={password} onChange={(e: never) => setPassword(val(e))} aria-label="Password" />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Button type="submit" loading={busy} fullWidth>Sign in</Button></div>
          {!ADMIN && <Button type="button" variant="secondary" onClick={() => { location.href = "/demo"; }} aria-label="Try the demo project, no account needed">Demo</Button>}
        </div>
        {!ADMIN && <Text size="sm" secondary>New here? Try the demo: a sample website project, no account needed.</Text>}
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Providers><Login /></Providers></StrictMode>);
