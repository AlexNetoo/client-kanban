import { createContext, useCallback, useContext, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Button, CardDialog, EmptyState, Skeleton, Toast, tokens } from "./halaska-kit";
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
export const PlusIcon = () => svg(<path d="M12 5v14M5 12h14" />);
export const CalendarIcon = () => svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>);
export const CheckIcon = () => svg(<path d="M20 6 9 17l-5-5" />);

export const space = tokens.space;
