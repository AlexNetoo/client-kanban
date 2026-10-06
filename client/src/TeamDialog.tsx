import { useEffect, useState } from "react";
import { Button, Text } from "./halaska-kit";
import { api } from "./api";
import { Text1 } from "./fields";
import { Modal, Person, useToast } from "./ui";
import { usePalette } from "./theme";
import type { Designer } from "./types";

/** Manage the designers tasks can be assigned to. */
export function TeamDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const pal = usePalette();
  const toast = useToast();
  const [designers, setDesigners] = useState<Designer[] | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.listDesigners().then(setDesigners).catch((e) => setError(e.message)); }, []);

  const add = async () => {
    if (!name.trim()) { setError("Enter a name."); return; }
    setBusy(true); setError("");
    try {
      const d = await api.createDesigner({ name, role });
      setDesigners((s) => [...(s ?? []), d]); setName(""); setRole(""); onChanged(); toast(`${d.name} added`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (d: Designer) => {
    try {
      await api.deleteDesigner(d.id);
      setDesigners((s) => (s ?? []).filter((x) => x.id !== d.id)); setConfirmId(null); onChanged(); toast(`${d.name} removed`);
    } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Modal open onClose={onClose} title="Team" description="Designers you can assign tasks to. Removing someone unassigns their tasks; their past comments stay."
      actions={<Button size="sm" onClick={onClose}>Done</Button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {error}</p>}
        <ul aria-label="Designers" style={{ display: "flex", flexDirection: "column" }}>
          {designers === null && <li><Text secondary>Loading…</Text></li>}
          {designers?.length === 0 && <li><Text secondary>No designers yet. Add one below.</Text></li>}
          {designers?.map((d) => (
            <li key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${pal.borderSubtle}` }}>
              <Person name={d.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                {d.role && <Text size="sm" secondary>{d.role}</Text>}
              </div>
              {confirmId === d.id
                ? <><Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Keep</Button><Button size="sm" variant="secondary" onClick={() => remove(d)} aria-label={`Confirm removing ${d.name}`}>Remove</Button></>
                : <Button size="sm" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => setConfirmId(d.id)}>Remove</Button>}
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row2"><Text1 label="Name" value={name} onChange={setName} /><Text1 label="Role (optional)" value={role} onChange={setRole} /></div>
          <div><Button type="button" size="sm" variant="secondary" loading={busy} onClick={add}>Add designer</Button></div>
        </form>
      </div>
    </Modal>
  );
}
