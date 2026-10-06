import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Button, Heading, Text, TextInput } from "./halaska-kit";
import { api } from "./api";
import { Providers, usePalette } from "./theme";
import { val } from "./ui";

function Login() {
  const pal = usePalette();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(new URLSearchParams(location.search).get("expired") ? "Your session ended. Please sign in again." : "");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) { setError("Please enter the password."); return; }
    setBusy(true); setError("");
    try { await api.login(password); location.replace("/" + location.hash); } // keeps #/c/<token> for shared client links
    catch (ex) { setError((ex as Error).message); setBusy(false); }
  };
  return (
    <main className="login-wrap">
      <form onSubmit={submit} style={{ width: "min(100%, 380px)", display: "flex", flexDirection: "column", gap: 18 }} noValidate>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 18 }}>
          <img src="/favicon.svg" alt="" width={24} height={24} /> Project Hub
        </div>
        <div><Heading level={1}>Sign in</Heading><Text secondary>Enter the password you were given to view project progress.</Text></div>
        {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {error}</p>}
        <TextInput label="Password" type="password" value={password} onChange={(e: never) => setPassword(val(e))} aria-label="Password" />
        <Button type="submit" loading={busy} fullWidth>Sign in</Button>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Providers><Login /></Providers></StrictMode>);
