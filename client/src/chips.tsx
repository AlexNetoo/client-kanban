import { useTheme } from "./theme";
import { discountPercent } from "./lib/pricing";
import { PRIORITY, PROJECT_STATUS, type Priority, type ProjectStatus } from "./types";

// The only coloured elements in an otherwise grayscale UI. Each chip also carries a text label (and a
// shape for priority), so colour is never the only signal. Pairs are tuned for AA contrast.
type Pair = { bg: string; fg: string };
const PRIORITY_COLORS: Record<Priority, { light: Pair; dark: Pair }> = {
  high: { light: { bg: "#fde8e8", fg: "#a4161a" }, dark: { bg: "#3b1d1d", fg: "#ff9b9b" } },
  medium: { light: { bg: "#fff1d6", fg: "#8a5a00" }, dark: { bg: "#3a2e12", fg: "#f2c36b" } },
  low: { light: { bg: "#e3f0ff", fg: "#1d4f91" }, dark: { bg: "#16273d", fg: "#8fbdf5" } },
};
const STATUS_COLORS: Record<ProjectStatus, { light: Pair; dark: Pair }> = {
  active: { light: { bg: "#e1f5e8", fg: "#1b6b3a" }, dark: { bg: "#16301f", fg: "#7fdca0" } },
  on_hold: { light: { bg: "#fff1d6", fg: "#8a5a00" }, dark: { bg: "#3a2e12", fg: "#f2c36b" } },
  completed: { light: { bg: "#e3f0ff", fg: "#1d4f91" }, dark: { bg: "#16273d", fg: "#8fbdf5" } },
};

const base = { display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap" } as const;

// Arrow shapes double-encode the level: ▲ high, ◆ medium, ▼ low.
const PRIORITY_MARK: Record<Priority, string> = { high: "▲", medium: "◆", low: "▼" };

export function PriorityChip({ priority, suffix = " priority" }: { priority: Priority; suffix?: string }) {
  const c = PRIORITY_COLORS[priority][useTheme()];
  return <span style={{ ...base, background: c.bg, color: c.fg }}><span aria-hidden="true" style={{ fontSize: 9 }}>{PRIORITY_MARK[priority]}</span>{PRIORITY[priority]}{suffix}</span>;
}

export function StatusChip({ status }: { status: ProjectStatus }) {
  const c = STATUS_COLORS[status][useTheme()];
  return <span style={{ ...base, background: c.bg, color: c.fg }}><span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: c.fg }} />{PROJECT_STATUS[status]}</span>;
}

export const statusDotColor = (status: ProjectStatus, scheme: "light" | "dark") => STATUS_COLORS[status][scheme].fg;

/** Green chip showing how much cheaper the estimate is than paying the day rate. Renders nothing when there is no saving. */
export function DiscountChip({ total, days }: { total: number; days: number }) {
  const pct = discountPercent(total, days);
  const c = STATUS_COLORS.active[useTheme()];
  if (pct <= 0) return null;
  return <span title="Compared with paying the day rate for every day" style={{ ...base, background: c.bg, color: c.fg }}>{pct}% off day rate</span>;
}
