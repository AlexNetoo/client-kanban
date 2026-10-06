import { useState } from "react";
import { Button } from "./halaska-kit";
import { api } from "./api";
import { Text1 } from "./fields";
import { Modal, useToast } from "./ui";
import { usePalette } from "./theme";

export function PasswordDialog({ onClose }: { onClose: () => void }) {
  const pal = usePalette();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setError("");
    if (next.length < 10) { setError("New password must be at least 10 characters."); return; }
    if (next !== again) { setError("The new passwords don’t match."); return; }
    setBusy(true);
    try { await api.changePassword(current, next); toast("Password changed. Other devices were signed out."); onClose(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Change password" description="You’ll stay signed in here; other devices are signed out."
      actions={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>Change password</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <p role="alert" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Error: {error}</p>}
        <Text1 label="Current password" type="password" value={current} onChange={setCurrent} />
        <Text1 label="New password (min 10 characters)" type="password" value={next} onChange={setNext} />
        <Text1 label="Repeat new password" type="password" value={again} onChange={setAgain} />
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
