import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { runIntro } from "./intro";
import { HeroBackground } from "./HeroBackground";
runIntro();
import { Button, Heading, Text, TextInput } from "./halaska-kit";
import { api } from "./api";
import { Providers, usePalette } from "./theme";
import { Brand, val } from "./ui";

// Three separate pages: /login is for clients, /designer for designers (not linked from anywhere), /admin for the admin (password only).
const PATH = location.pathname.replace(/\/+$/, "");
const ADMIN = PATH === "/admin";
const DESIGNER = PATH === "/designer";
const COPY = DESIGNER
  ? "Sign in with the email and password you were given to see the tasks assigned to you."
  : "Sign in with your email and password to follow the progress of your projects.";

function Login() {
  const pal = usePalette();
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
      else await api.login(password, { email: email.trim(), as: DESIGNER ? "designer" : "client" });
      try { localStorage.setItem("loginPath", DESIGNER ? "/designer" : "/login"); } catch { /* storage unavailable */ }
      location.replace(ADMIN ? "/admin" : "/" + location.hash); // the hash keeps #/c/<token> links working
    } catch (ex) { setError((ex as Error).message); setPassword(""); setBusy(false); }
  };

  return (
    <main className="login-wrap hero">
      <HeroBackground />
      <form onSubmit={submit} style={{ width: "min(100%, 380px)", display: "flex", flexDirection: "column", gap: 18 }} noValidate>
        <div style={{ marginBottom: 18 }}><Brand href="/login" portalOnly /></div>
        <div>
          <Heading level={1}>{ADMIN ? "Admin sign in" : DESIGNER ? "Designer sign in" : "Sign in"}</Heading>
          <Text secondary>{ADMIN ? "Enter the admin password to manage accounts and projects." : COPY}</Text>
        </div>
        {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {error}</p>}
        {!ADMIN && <TextInput label="Email" type="email" value={email} onChange={(e: never) => setEmail(val(e))} aria-label="Email" />}
        <TextInput label="Password" type="password" value={password} onChange={(e: never) => setPassword(val(e))} aria-label="Password" />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Button type="submit" loading={busy} fullWidth>Sign in</Button></div>
          {!ADMIN && !DESIGNER && <Button type="button" variant="secondary" onClick={() => { location.href = "/demo"; }} aria-label="Try the demo project, no account needed">Demo</Button>}
        </div>
        {!ADMIN && !DESIGNER && <Text size="sm" secondary>New here? Try the demo: a sample website project, no account needed.</Text>}
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Providers><Login /></Providers></StrictMode>);
