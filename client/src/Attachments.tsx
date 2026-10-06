import { useRef, useState, type DragEvent } from "react";
import { Button, Checkbox, Text } from "./halaska-kit";
import { api, uploadFile } from "./api";
import { useToast } from "./ui";
import { useMe } from "./session";
import { usePalette } from "./theme";
import { formatBytes, formatDateTime } from "./lib/format";
import type { Attachment, Task } from "./types";

const PREVIEWABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]); // never SVG: it can carry scripts
const fileUrl = (a: Attachment) => `/api/attachments/${a.id}/file`;

type Upload = { key: number; name: string; size: number; progress: number; error?: string };

/**
 * Files on a task. Admin: any task. Designer: tasks assigned to them. Files are internal unless shared:
 * clients see (read-only) just the files marked "shared with client".
 */
export function Attachments({ task, onChange }: { task: Task; onChange: (t: Task) => void }) {
  const pal = usePalette();
  const toast = useToast();
  const me = useMe();
  const owner = me.role === "owner";
  const isClient = me.role === "client";
  const canAttach = owner || task.assigneeId === me.designer?.id;
  const max = me.maxUploadBytes ?? 25 * 1024 * 1024;
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [over, setOver] = useState(false);
  const [shareNew, setShareNew] = useState(false); // new files are internal unless this is ticked
  const counter = useRef(0);
  const items = task.attachments ?? [];

  const patch = (key: number, p: Partial<Upload>) => setUploads((s) => s.map((u) => (u.key === key ? { ...u, ...p } : u)));

  async function uploadOne(file: File) {
    const key = ++counter.current;
    setUploads((s) => [...s, { key, name: file.name, size: file.size, progress: 0 }]);
    if (file.size > max) { patch(key, { error: `Too large (limit ${formatBytes(max)})` }); return; }
    if (file.size === 0) { patch(key, { error: "That file is empty" }); return; }
    try {
      const { attachmentId, upload } = await api.requestAttachment(task.id, { name: file.name, size: file.size, type: file.type || "application/octet-stream", shared: shareNew });
      await uploadFile(upload, file, (p) => patch(key, { progress: p }));
      onChange(await api.completeAttachment(task.id, attachmentId));
      setUploads((s) => s.filter((u) => u.key !== key));
      toast(`Attached ${file.name}`);
    } catch (e) { patch(key, { error: (e as Error).message }); }
  }

  async function addFiles(list: FileList | File[]) {
    for (const f of Array.from(list)) await uploadOne(f); // one at a time keeps the order and the progress readable
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (canAttach && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); };

  const toggleShare = async (a: Attachment) => {
    const share = a.visibility !== "client";
    try { onChange(await api.updateAttachment(task.id, a.id, { shared: share })); toast(share ? `${a.name} is now shared with the client` : `${a.name} is now internal`); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const remove = async (a: Attachment) => {
    try { onChange(await api.deleteAttachment(task.id, a.id)); toast(`Removed ${a.name}`); } catch (e) { toast((e as Error).message, "error"); }
  };

  if (!canAttach && items.length === 0) return null;
  return (
    <section aria-label="Attachments">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, color: pal.textTertiary }}>Attachments ({items.length})</h3>
        {canAttach && <>
          <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>Add files</Button>
          <input ref={input} type="file" multiple aria-label="Add files to this task" className="sr-only" tabIndex={-1}
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        </>}
      </div>

      {isClient && <div style={{ marginBottom: 10 }}><Text size="sm" secondary>Files your team shared with you.</Text></div>}
      {canAttach && (
        <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
          style={{ border: `2px dashed ${over ? pal.text : pal.border}`, borderRadius: 14, padding: "14px 16px", textAlign: "center", marginBottom: items.length || uploads.length ? 12 : 0, background: over ? pal.bgMuted : "transparent" }}>
          <Text size="sm" secondary>Drop files here or use “Add files”. Up to {formatBytes(max)} each. Files are internal unless you share them with the client.</Text>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
            <Checkbox checked={shareNew} onChange={(c: boolean) => setShareNew(c)} label="Share new files with the client" aria-label="Share new files with the client" />
          </div>
        </div>
      )}

      <div aria-live="polite">
        {uploads.map((u) => (
          <div key={u.key} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 14px", border: `1px solid ${pal.border}`, borderRadius: 14, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
              <span style={{ color: u.error ? pal.text : pal.textSecondary, fontWeight: u.error ? 700 : 400, flex: "none" }}>{u.error ? `Error: ${u.error}` : `${Math.round(u.progress * 100)}%`}</span>
            </div>
            {u.error
              ? <div><Button size="sm" variant="ghost" onClick={() => setUploads((s) => s.filter((x) => x.key !== u.key))}>Dismiss</Button></div>
              : <div role="progressbar" aria-label={`Uploading ${u.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(u.progress * 100)} style={{ height: 6, borderRadius: 999, background: pal.bgMuted, overflow: "hidden" }}>
                <div style={{ width: `${u.progress * 100}%`, height: "100%", background: pal.text, transition: "width .15s" }} />
              </div>}
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <ul style={{ display: "flex", flexDirection: "column", border: `1px solid ${pal.border}`, borderRadius: 14, overflow: "hidden" }}>
          {items.map((a, i) => {
            const ext = a.name.includes(".") ? a.name.split(".").pop()!.slice(0, 4).toUpperCase() : "FILE";
            return (
              <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", flexWrap: "wrap", borderTop: i ? `1px solid ${pal.borderSubtle}` : "none" }}>
                {PREVIEWABLE.has(a.type)
                  ? <img src={fileUrl(a)} alt="" loading="lazy" width={44} height={44} style={{ objectFit: "cover", borderRadius: 10, border: `1px solid ${pal.border}`, flex: "none", background: pal.bgMuted }} />
                  : <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 10, background: pal.bgMuted, border: `1px solid ${pal.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: pal.textSecondary, flex: "none" }}>{ext}</span>}
                <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                  <a href={fileUrl(a)} download={a.name} style={{ color: pal.text, fontWeight: 600, fontSize: 14, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`Download ${a.name}`}>{a.name}</a>
                  <span style={{ fontSize: 12, color: pal.textSecondary }}>{formatBytes(a.size)} · {a.uploadedByName} · {formatDateTime(a.uploadedAt)}</span>
                  {!isClient && <br />}
                  {!isClient && <span title={a.visibility === "client" ? "The client can see and download this file" : "Only the team can see this file"} style={{ display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, border: `1px ${a.visibility === "client" ? "solid" : "dashed"} ${pal.textTertiary}`, borderRadius: 999, padding: "1px 8px", color: pal.textSecondary }}>{a.visibility === "client" ? "Shared with client" : "Internal"}</span>}
                </div>
                <a href={fileUrl(a)} download={a.name} aria-label={`Download ${a.name}`} style={{ fontSize: 13, color: pal.text, fontWeight: 600 }}>Download</a>
                {(owner || a.uploadedById === me.designer?.id) && <>
                  <Button variant="ghost" size="sm" aria-label={a.visibility === "client" ? `Make ${a.name} internal` : `Share ${a.name} with the client`} onClick={() => toggleShare(a)}>{a.visibility === "client" ? "Make internal" : "Share with client"}</Button>
                  <Button variant="ghost" size="sm" aria-label={`Remove ${a.name}`} onClick={() => remove(a)}>Remove</Button>
                </>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
