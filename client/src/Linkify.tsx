import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { parseFigma, splitLinks, type FigmaLinkInfo } from "./lib/figma";
import { formatDate } from "./lib/format";
import { useToast } from "./ui";
import { usePalette } from "./theme";
import { useMe } from "./session";

/** The task the text belongs to: lets the server fetch a rich Figma preview for links that really are in that task. */
export const LinkTaskContext = createContext<string | null>(null);

const FigmaMark = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size * 1.5} viewBox="0 0 38 57" aria-hidden="true" style={{ flex: "none" }}>
    <path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" /><path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
    <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" /><path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" /><path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
  </svg>
);

interface Preview { configured?: boolean; error?: boolean; name?: string; lastModified?: string; image?: string }

/** A Figma link as an inline chip. Hover or focus shows a preview card (title, picture, last update, open / copy), like Jira's smart links. */
function FigmaLink({ info }: { info: FigmaLinkInfo }) {
  const pal = usePalette();
  const toast = useToast();
  const taskId = useContext(LinkTaskContext);
  const isAdmin = useMe().role === "owner";
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [pv, setPv] = useState<Preview | null>(null);
  const chip = useRef<HTMLAnchorElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const asked = useRef(false);

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = chip.current?.getBoundingClientRect(); if (!r) return;
      const w = Math.min(360, window.innerWidth - 24);
      setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)), top: r.bottom + 8 > window.innerHeight - 330 ? Math.max(12, r.top - 330) : r.bottom + 8 });
      setOpen(true);
      if (!asked.current && taskId) { asked.current = true; api.figmaPreview(info.url, taskId).then(setPv).catch(() => setPv({ error: true })); }
    }, 180);
  };
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 160); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);

  const title = pv?.name || info.title;
  const copy = async () => { try { await navigator.clipboard.writeText(info.url); toast("Link copied"); } catch { toast("Couldn’t copy automatically.", "error"); } };

  return (
    <>
      <a ref={chip} href={info.url} target="_blank" rel="noopener noreferrer nofollow" className="figma-chip" aria-label={`${title}, Figma ${info.kind.toLowerCase()} (opens in a new tab)`}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} style={{ borderColor: pal.border, background: pal.bgMuted }}>
        <FigmaMark size={11} /><span className="figma-chip__title">{title}</span>
      </a>
      {open && createPortal(
        <div className="figma-card" role="dialog" aria-label={`Preview: ${title}`} style={{ top: pos.top, left: pos.left, background: pal.bg, borderColor: pal.border, color: pal.text }} onMouseEnter={() => window.clearTimeout(timer.current)} onMouseLeave={hide}>
          <div className="figma-card__banner" style={pv?.image ? { background: pal.bgMuted } : undefined}>
            {pv?.image ? <img src={pv.image} alt="" /> : <><span className="figma-card__kind">{info.kind}</span><strong>{title}</strong></>}
          </div>
          <div className="figma-card__body">
            <a href={info.url} target="_blank" rel="noopener noreferrer nofollow" className="figma-card__title"><FigmaMark size={12} />{title}</a>
            <div style={{ fontSize: 13, color: pal.textSecondary }}>{info.kind}{info.node ? ` · frame ${info.node.replace("-", ":")}` : ""}{pv?.lastModified ? ` · Updated ${formatDate(pv.lastModified.slice(0, 10))}` : ""}</div>
            <div className="figma-card__actions">
              <a href={info.url} target="_blank" rel="noopener noreferrer nofollow">Open in Figma</a>
              <button type="button" onClick={copy}>Copy link</button>
            </div>
            {isAdmin && pv?.configured === false && <div style={{ fontSize: 11, color: pal.textTertiary }}>Add FIGMA_ACCESS_TOKEN on the server to show thumbnails and update dates.</div>}
          </div>
        </div>, document.body)}
    </>
  );
}

/** Turns URLs in user text into links; Figma URLs become preview chips. Text is rendered as text, never as HTML. */
export function Linkify({ text }: { text: string }): ReactNode {
  return <>{splitLinks(text).map((part, i) => {
    if (typeof part === "string") return part;
    const fig = parseFigma(part.url);
    if (fig) return <FigmaLink key={i} info={fig} />;
    return <a key={i} href={part.url} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: "underline", textUnderlineOffset: 3, overflowWrap: "anywhere" }}>{part.url}</a>;
  })}</>;
}
