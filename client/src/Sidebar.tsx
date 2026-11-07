import { useId, useState, type ReactNode } from "react";
import { isDemo } from "./demo";
import { api, loginPath } from "./api";
import { statusDotColor } from "./chips";
import { useProjectsNav } from "./nav";
import { useMe } from "./session";
import { usePalette, useTheme } from "./theme";

/** One navigation row: a link, or a button when it has no destination (the Projects drawer toggle and Log out). */
function Item({ href, active = false, icon, label, onClick, trailing, expanded, small = false }: {
  href?: string; active?: boolean; icon?: ReactNode; label: string; onClick?: () => void; trailing?: ReactNode; expanded?: boolean; small?: boolean;
}) {
  const pal = usePalette();
  const style = {
    display: "flex", alignItems: "center", gap: small ? 8 : 10, width: "100%", padding: small ? "5px 10px" : "6px 10px", borderRadius: 6, textDecoration: "none", textAlign: "left" as const,
    fontSize: small ? 12 : 13, lineHeight: small ? "16px" : "20px", fontWeight: 400, color: small && !active ? pal.textSecondary : pal.text, minWidth: 0,
  };
  const inner = <>{icon}<span className="nav-label">{label}</span>{trailing}</>;
  return href !== undefined
    ? <a href={href} aria-current={active ? "page" : undefined} className="nav-item" title={label} style={style}>{inner}</a>
    : <button type="button" className="nav-item" title={label} aria-expanded={expanded} onClick={onClick} style={style}>{inner}</button>;
}

/** Lucide icons (https://lucide.dev), drawn at 16px with a 2px stroke. */
const Icon = ({ d, size = 16 }: { d: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>{d}</svg>
);
const FolderIcon = () => <Icon d={<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />} />;
const ClockIcon = () => <Icon d={<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>} />;
const ShieldIcon = () => <Icon d={<><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>} />;
const GearIcon = () => <Icon d={<><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>} />;
const PlusIcon = () => <Icon d={<><path d="M5 12h14" /><path d="M12 5v14" /></>} />;
const LogOutIcon = () => <Icon d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></>} />;
const Chevron = ({ open }: { open: boolean }) => <span className="nav-chev" aria-hidden="true" style={{ marginLeft: "auto", display: "inline-flex", transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.25s var(--ease)" }}><Icon size={14} d={<path d="m6 9 6 6 6-6" />} /></span>;

/** Primary navigation: a Projects drawer, then team (owner) and settings, with Log out at the bottom. Sidebar on desktop, a sheet on phones. */
export function Nav({ route, admin = false, collapsed = false, onNavigate }: { route: string; admin?: boolean; collapsed?: boolean; onNavigate?: () => void }) {
  const scheme = useTheme();
  const me = useMe();
  const { projects } = useProjectsNav();
  const drawerId = useId();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("projects-drawer") !== "closed"; } catch { return true; } });
  const toggle = () => setOpen((o) => { try { localStorage.setItem("projects-drawer", o ? "closed" : "open"); } catch { /* storage unavailable */ } return !o; });
  const home = isDemo() ? "/demo" : "/"; // the demo lives at /demo, so menu links must stay there
  const owner = me.role === "owner";
  const [, kind, param] = route.split("/");

  return (
    <nav aria-label="Main" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) onNavigate?.(); }} style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, overflowY: "auto" }}>
      {collapsed ? (
        <Item href={`${home}#/`} active={!admin && (route === "/" || route === "")} label={owner ? "All projects" : "My projects"} icon={<FolderIcon />} />
      ) : (
        <>
          <Item label="Projects" icon={<FolderIcon />} onClick={toggle} expanded={open} trailing={<Chevron open={open} />} />
          <div id={drawerId} className="drawer" data-open={open} style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.3s var(--ease)" }}>
            <ul style={{ overflow: "hidden", display: "flex", flexDirection: "column", gap: 2, minHeight: 0, paddingLeft: 14, maxHeight: "40vh", overflowY: open ? "auto" : "hidden" }}>
              <li><Item small href={`${home}#/`} active={!admin && (route === "/" || route === "")} label={owner ? "All projects" : "My projects"} icon={<span aria-hidden="true" style={{ width: 6, height: 6, flex: "none" }} />} /></li>
              {projects.map((p) => (
                <li key={p.id}>
                  <Item small href={`${home}#/p/${p.id}`} active={!admin && kind === "p" && param === p.id} label={p.name}
                    icon={<span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: statusDotColor(p.status, scheme), flex: "none" }} />} />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {me.role === "client" && <Item href={`${home}#/new`} active={kind === "new"} label="New project" icon={<PlusIcon />} />}
      {owner && <Item href="/emerald" label="Timesheet" icon={<ClockIcon />} />}
      {owner && <Item href="/admin" active={admin} label="Admin console" icon={<ShieldIcon />} />}
      <Item href={`${home}#/settings`} active={!admin && kind === "settings"} label="Settings" icon={<GearIcon />} />

      <div style={{ marginTop: "auto", paddingTop: 12 }}>
        <Item label="Log out" icon={<LogOutIcon />} onClick={async () => { try { await api.logout(); } finally { location.replace(loginPath()); } }} />
      </div>
    </nav>
  );
}
