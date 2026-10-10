import { createContext, useCallback, useContext, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from "react";
import { Button, CardDialog, EmptyState, IconButton, Skeleton, TextInput, Toast, tokens, useModalFocus } from "./halaska-kit";
import { usePalette } from "./theme";

/** Halaska inputs call onChange with a value or an event depending on the control; normalise to a string. */
export const val = (e: string | ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => (typeof e === "string" ? e : e.target.value);

// ---- toasts ----
type Notify = (message: string, kind?: "ok" | "error") => void;
const ToastCtx = createContext<Notify>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string }[]>([]);
  const id = useRef(0);
  const notify = useCallback<Notify>((message, kind = "ok") => {
    const n = ++id.current;
    setItems((s) => [...s, { id: n, message: kind === "error" ? `Error: ${message}` : message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== n)), kind === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={notify}>
      {children}
      <div aria-live="polite" role="status" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 20000, display: "flex", flexDirection: "column", gap: 8, width: "min(92vw, 420px)", pointerEvents: "none" }}>
        {items.map((t) => <Toast key={t.id} message={t.message} />)}
      </div>
    </ToastCtx.Provider>
  );
}

// ---- dialogs ----
export function Modal({ open, onClose, title, description, children, actions }: {
  open: boolean; onClose: () => void; title: string; description?: string; children?: ReactNode; actions?: ReactNode;
}) {
  return (
    <CardDialog open={open} onClose={onClose} title={title} description={description} actions={actions}>
      {children && <div style={{ maxHeight: "60vh", overflowY: "auto", padding: 2, margin: -2 }}>{children}</div>}
    </CardDialog>
  );
}

/** Large scrollable modal (Jira-style). Focus trap, Esc to close and focus restore come from the kit's useModalFocus. */
export function WideModal({ open, onClose, label, header, children }: { open: boolean; onClose: () => void; label: string; header?: ReactNode; children: ReactNode }) {
  const pal = usePalette();
  const ref = (useModalFocus as unknown as (o: boolean, c: () => void) => RefObject<HTMLDivElement>)(open, onClose);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "min(4vh, 32px) min(3vw, 24px)" }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ background: pal.bgElevated, color: pal.text, width: "min(1120px, 100%)", maxHeight: "100%", borderRadius: 16, border: `1px solid ${pal.borderSubtle}`, boxShadow: `0 24px 64px ${pal.shadowLg}`, display: "flex", flexDirection: "column", overflow: "hidden", outline: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${pal.border}`, flex: "none" }}>
          <div style={{ minWidth: 0, fontSize: 13, color: pal.textSecondary }}>{header}</div>
          <IconButton icon={<span aria-hidden="true" style={{ fontSize: 16 }}>✕</span>} label="Close" onClick={onClose} />
        </div>
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, description, confirmLabel = "Delete", onConfirm, onClose }: {
  open: boolean; title: string; description: string; confirmLabel?: string; onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pal = usePalette();
  const run = async () => {
    setBusy(true); setError("");
    try { await onConfirm(); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}
      actions={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="secondary" size="sm" loading={busy} onClick={run}>{confirmLabel}</Button></>}>
      {error && <p role="alert" style={{ color: pal.text, fontWeight: 600, fontSize: 13 }}>Error: {error}</p>}
    </Modal>
  );
}

/** Deleting something big: the admin must type its name before the button enables. */
export function TypedConfirmDialog({ open, title, description, expected, confirmLabel = "Delete", onConfirm, onClose }: {
  open: boolean; title: string; description: string; expected: string; confirmLabel?: string; onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pal = usePalette();
  const ok = typed.trim() === expected;
  const run = async () => {
    setBusy(true); setError("");
    try { await onConfirm(); setTyped(""); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={() => { setTyped(""); onClose(); }} title={title} description={description}
      actions={<><Button variant="ghost" size="sm" onClick={() => { setTyped(""); onClose(); }}>Cancel</Button><Button variant="secondary" size="sm" disabled={!ok} loading={busy} onClick={run}>{confirmLabel}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) run(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <p role="alert" style={{ color: pal.text, fontWeight: 600, fontSize: 13 }}>Error: {error}</p>}
        <TextInput label={`Type “${expected}” to confirm`} value={typed} onChange={(e: never) => setTyped(val(e))} aria-label={`Type ${expected} to confirm`} />
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

// ---- states ----
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} width="100%" height={168} rounded />)}
    </div>
  );
}
export function StateBlock({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <EmptyState title={title} description={description} action={action} />;
}

// ---- small icons (inline, grayscale via currentColor) ----
const svg = (d: ReactNode) => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ flex: "none", verticalAlign: "-0.125em" }}>{d}</svg>
);
export const LockIcon = () => svg(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>);
export const EyeIcon = () => svg(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const SparkIcon = () => svg(<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />);
export const PlusIcon = () => svg(<path d="M12 5v14M5 12h14" />);
export const CalendarIcon = () => svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>);
export const RepeatIcon = () => svg(<><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>);
export const ChevronDownIcon = () => svg(<path d="m6 9 6 6 6-6" />);
export const CheckIcon = () => svg(<path d="M20 6 9 17l-5-5" />);

/** Grayscale initials avatar (the kit's Avatar picks a hue per name). */
export function Person({ name, size = 28 }: { name: string; size?: number }) {
  const pal = usePalette();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: pal.bgMuted, color: pal.text, border: `1px solid ${pal.border}`,
      display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.4), fontWeight: 700, flex: "none", letterSpacing: 0 }}>{initials}</span>
  );
}

/** The alexneto.com logo (circle + name) with "Client Portal" as a quiet label underneath. */
/** `portalOnly` shows just "Client Portal" next to the mark (used on the sign-in page). */
export function Brand({ href = "#/", portalOnly = false }: { href?: string; portalOnly?: boolean }) {
  const pal = usePalette();
  return (
    <div>
      <a href={href} className="nav__brand" aria-label="Alex Neto - Client Portal, home"><span className="nav__mark" /><span className="nav__word">{portalOnly ? "Client Portal" : "Alex Neto"}</span></a>
      {!portalOnly && <span className="brand-sub" style={{ color: pal.textTertiary }}>Client Portal</span>}
    </div>
  );
}

export const space = tokens.space;
