import { useState } from "react";
import { Button, Text, TextInput } from "./halaska-kit";
import { api } from "./api";
import { useToast, val } from "./ui";
import { useMe } from "./session";
import { usePalette } from "./theme";
import type { Task, WebLink } from "./types";

const host = (url: string) => { try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; } };

/**
 * Web links on a task: a Figma file, a staging page, a reference. Anyone who can open the task can add one;
 * the admin removes any, designers and clients remove their own.
 */
export function WebLinks({ task, onChange }: { task: Task; onChange: (t: Task) => void }) {
  const pal = usePalette();
  const toast = useToast();
  const me = useMe();
  const myId = me.designer?.id ?? me.client?.id;
  const items: WebLink[] = task.refs ?? [];
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try { onChange(await api.addRef(task.id, { url, title })); setUrl(""); setTitle(""); setAdding(false); toast("Link added"); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const remove = async (r: WebLink) => {
    try { onChange(await api.deleteRef(task.id, r.id)); toast("Link removed"); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <section aria-label="Links">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <h3 className="sec-h">Links <span className="sec-n">{items.length}</span></h3>
        {!adding && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Add link</Button>}
      </div>

      {adding && (
        <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: "flex", flexDirection: "column", gap: 10, border: `1px solid ${pal.border}`, borderRadius: 12, padding: 14, marginBottom: items.length ? 12 : 0 }}>
          <TextInput label="Web address" placeholder="https://" value={url} onChange={(e: never) => setUrl(val(e))} aria-label="Web address" autoFocus />
          <TextInput label="Title (optional)" placeholder="e.g., Homepage in Figma" value={title} onChange={(e: never) => setTitle(val(e))} aria-label="Link title" />
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="submit" size="sm" loading={busy} disabled={!url.trim()}>Add link</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setUrl(""); setTitle(""); }}>Cancel</Button>
          </div>
        </form>
      )}

      {items.length === 0 && !adding && <Text size="sm" secondary>No links yet. Add a Figma file, a page or a reference.</Text>}
      {items.length > 0 && (
        <ul style={{ display: "flex", flexDirection: "column", border: `1px solid ${pal.border}`, borderRadius: 12, overflow: "hidden" }}>
          {items.map((r, i) => (
            <li key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", flexWrap: "wrap", borderTop: i ? `1px solid ${pal.borderSubtle}` : "none" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: pal.text, fontWeight: 600, fontSize: 14, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.url}>
                  {r.title || host(r.url)} <span aria-hidden="true">↗</span>
                </a>
                <span style={{ fontSize: 12, color: pal.textSecondary }}>{host(r.url)} · {r.addedByName}</span>
              </div>
              {(me.role === "owner" || r.addedById === myId) && <Button variant="ghost" size="sm" aria-label={`Remove link ${r.title || host(r.url)}`} onClick={() => remove(r)}>Remove</Button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
