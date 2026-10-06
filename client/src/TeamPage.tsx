import { useEffect, useState } from "react";
import { Button, Heading, Text } from "./halaska-kit";
import { api } from "./api";
import { Text1 } from "./fields";
import { Person, useToast } from "./ui";
import { usePalette } from "./theme";
import type { Designer } from "./types";

const MIN = 10;

/** Manage designers and their logins. The owner sets the first password; designers can change it themselves. */
export function TeamPage() {
  const onChanged = () => {};
  const pal = usePalette();
  const toast = useToast();
  const [designers, setDesigners] = useState<Designer[] | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [lEmail, setLEmail] = useState("");
  const [lPassword, setLPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.listDesigners().then(setDesigners).catch((e) => setError(e.message)); }, []);
  const replace = (d: Designer) => setDesigners((s) => (s ?? []).map((x) => (x.id === d.id ? d : x)));
  const guard = async (work: () => Promise<void>) => { setBusy(true); setError(""); try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };

  const add = () => guard(async () => {
    if (!name.trim()) throw new Error("Enter a name.");
    if ((email || password) && !(email && password)) throw new Error("A login needs both an email and a password.");
    if (password && password.length < MIN) throw new Error(`Password must be at least ${MIN} characters.`);
    const d = await api.createDesigner({ name, role, email: email || undefined, password: password || undefined });
    setDesigners((s) => [...(s ?? []), d]); setName(""); setRole(""); setEmail(""); setPassword(""); onChanged(); toast(`${d.name} added`);
  });
  const remove = async (d: Designer) => {
    try { await api.deleteDesigner(d.id); setDesigners((s) => (s ?? []).filter((x) => x.id !== d.id)); setConfirmId(null); onChanged(); toast(`${d.name} removed`); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const openLogin = (d: Designer) => { setLoginFor(d.id); setLEmail(d.email ?? ""); setLPassword(""); setError(""); };
  const saveLogin = (d: Designer) => guard(async () => {
    if (!lEmail.trim() || !lPassword) throw new Error("Enter an email and a new password.");
    if (lPassword.length < MIN) throw new Error(`Password must be at least ${MIN} characters.`);
    replace(await api.updateDesigner(d.id, { email: lEmail, password: lPassword }));
    setLoginFor(null); toast(`Login saved for ${d.name}. They’ve been signed out of other devices.`);
  });
  const dropLogin = (d: Designer) => guard(async () => { replace(await api.updateDesigner(d.id, { removeLogin: true })); setLoginFor(null); toast(`${d.name} can no longer sign in`); });

  useEffect(() => { document.title = "Team · Project Hub"; }, []);
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <Heading level={1}>Team</Heading>
        <Text secondary>Designers sign in on the Designer tab to see projects they’re assigned to, move their tasks and comment. They never see private notes or client links.</Text>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {error}</p>}
        <ul aria-label="Designers" style={{ display: "flex", flexDirection: "column" }}>
          {designers === null && <li><Text secondary>Loading…</Text></li>}
          {designers?.length === 0 && <li><Text secondary>No designers yet. Add one below.</Text></li>}
          {designers?.map((d) => (
            <li key={d.id} style={{ padding: "10px 0", borderBottom: `1px solid ${pal.borderSubtle}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Person name={d.name} size={32} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}{d.role ? <span style={{ fontWeight: 400, color: pal.textSecondary }}> · {d.role}</span> : null}</div>
                  <Text size="sm" secondary>{d.hasLogin ? d.email : "No login yet"}</Text>
                </div>
                <Button size="sm" variant="ghost" aria-label={`${d.hasLogin ? "Change login for" : "Set login for"} ${d.name}`} onClick={() => (loginFor === d.id ? setLoginFor(null) : openLogin(d))}>{d.hasLogin ? "Reset login" : "Set login"}</Button>
                {confirmId === d.id
                  ? <><Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Keep</Button><Button size="sm" variant="secondary" onClick={() => remove(d)} aria-label={`Confirm removing ${d.name}`}>Remove</Button></>
                  : <Button size="sm" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => setConfirmId(d.id)}>Remove</Button>}
              </div>
              {loginFor === d.id && (
                <form onSubmit={(e) => { e.preventDefault(); saveLogin(d); }} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, paddingLeft: 44 }}>
                  <Text1 label="Email" type="email" value={lEmail} onChange={setLEmail} />
                  <Text1 label={`New password (min ${MIN} characters)`} type="password" value={lPassword} onChange={setLPassword} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button type="button" size="sm" loading={busy} onClick={() => saveLogin(d)}>Save login</Button>
                    {d.hasLogin && <Button type="button" size="sm" variant="secondary" onClick={() => dropLogin(d)}>Remove login</Button>}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setLoginFor(null)}>Cancel</Button>
                  </div>
                  <Text size="sm" secondary>Saving signs them out everywhere. Share the new password with them privately.</Text>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-label="Add designer">
          <div className="row2"><Text1 label="Name" value={name} onChange={setName} /><Text1 label="Role (optional)" value={role} onChange={setRole} /></div>
          <div className="row2"><Text1 label="Login email (optional)" type="email" value={email} onChange={setEmail} /><Text1 label={`Password (min ${MIN})`} type="password" value={password} onChange={setPassword} /></div>
          <div><Button type="button" size="sm" variant="secondary" loading={busy} onClick={add}>Add designer</Button></div>
        </form>
      </div>
    </div>
  );
}
