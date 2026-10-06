import { useId, type ReactNode } from "react";
import { Button } from "./halaska-kit";
import { api } from "./api";
import { statusDotColor } from "./chips";
import { useProjectsNav } from "./nav";
import { useMe } from "./session";
import { usePalette, useTheme } from "./theme";

function Item({ href, active, children, indent = false }: { href: string; active: boolean; children: ReactNode; indent?: boolean }) {
  const pal = usePalette();
  return (
    <a href={href} aria-current={active ? "page" : undefined} className="nav-item"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: indent ? "7px 12px 7px 14px" : "9px 12px", borderRadius: 12, textDecoration: "none", fontSize: indent ? 13 : 14, fontWeight: active ? 700 : 500,
        color: active ? pal.text : pal.textSecondary, background: active ? pal.bgMuted : "transparent", minWidth: 0 }}>{children}</a>
  );
}

const Icon = ({ d }: { d: ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>{d}</svg>
);

/** Primary navigation: projects, team (owner) and settings. Shown as a sidebar on desktop and inside a drawer on phones. */
export function Nav({ route, admin = false, onNavigate }: { route: string; admin?: boolean; onNavigate?: () => void }) {
  const pal = usePalette();
  const scheme = useTheme();
  const me = useMe();
  const { projects } = useProjectsNav();
  const listId = useId();
  const owner = me.role === "owner";
  const [, kind, param] = route.split("/");
  const onProjects = kind === undefined || kind === "" || kind === "p" || kind === "c";

  return (
    <nav aria-label="Main" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) onNavigate?.(); }} style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minHeight: 0, overflowY: "auto" }}>
      <Item href="/#/" active={!admin && (route === "/" || route === "")}><Icon d={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>} />{owner ? "All projects" : "My projects"}</Item>

      {projects.length > 0 && (
        <div style={{ margin: "10px 0 4px" }}>
          <div id={listId} style={{ padding: "0 12px 6px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, color: pal.textTertiary }}>Projects</div>
          <ul aria-labelledby={listId} style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: "40vh", overflowY: "auto" }}>
            {projects.map((p) => (
              <li key={p.id}>
                <Item href={`/#/p/${p.id}`} active={!admin && kind === "p" && param === p.id} indent>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: statusDotColor(p.status, scheme), flex: "none" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                </Item>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ height: 1, background: pal.border, margin: "8px 4px" }} />
      {owner && <Item href="/admin" active={admin}><Icon d={<><path d="M12 3 4 6v6c0 4.5 3.2 8.2 8 9 4.8-.8 8-4.5 8-9V6l-8-3z" /><path d="m9 12 2 2 4-4" /></>} />Admin console</Item>}
      <Item href="/#/settings" active={!admin && kind === "settings"}><Icon d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>} />Settings</Item>

      <div style={{ marginTop: "auto", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ padding: "0 12px", fontSize: 13, color: pal.textSecondary }}>
          <div style={{ fontWeight: 600, color: pal.text }}>{me.designer?.name ?? (owner ? "Admin" : "Client")}</div>
          <div>{owner ? "Admin account" : "Designer account"}</div>
        </div>
        <Button variant="secondary" size="sm" fullWidth onClick={async () => { try { await api.logout(); } finally { location.replace("/login"); } }}>Sign out</Button>
      </div>
    </nav>
  );
}
