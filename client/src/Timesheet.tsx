import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Heading, Select, Stat, Text } from "./halaska-kit";
import { api } from "./api";
import { StateBlock, useToast } from "./ui";
import { usePalette } from "./theme";

type Entry = { hours: number; note: string };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const money = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
const hoursText = (n: number) => String(Math.round(n * 100) / 100);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d: Date) => `${d.getDate()}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;

/** Weeks (Monday to Sunday) that touch the month; days outside the month are shown greyed out and can't be edited. */
function weeksOf(year: number, month: number) {
  const first = new Date(year, month, 1); const last = new Date(year, month + 1, 0);
  const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const weeks: Date[][] = [];
  for (let d = new Date(start); d <= last; d.setDate(d.getDate() + 7)) weeks.push(Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)));
  return weeks;
}

/** The Emerald timesheet (/emerald): hours and a note per day, weekly and monthly totals, and the amount earned at the hourly rate. */
export function Timesheet() {
  const pal = usePalette();
  const toast = useToast();
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [rate, setRate] = useState(30);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [draft, setDraft] = useState<Record<string, { hours: string; note: string }>>({});
  const [saved, setSaved] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timers = useRef<Record<string, number>>({});
  const month = monthKey(cursor);
  const today = iso(now);

  useEffect(() => { document.title = "Emerald timesheet · Alex Neto - Client Portal"; }, []);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await api.getTimesheet(month); setRate(r.rate); setEntries(r.entries); setDraft({}); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); return () => { Object.values(timers.current).forEach(window.clearTimeout); timers.current = {}; }; }, [load]);

  const valueOf = (date: string) => draft[date] ?? { hours: entries[date] && entries[date].hours ? hoursText(entries[date].hours) : "", note: entries[date]?.note ?? "" };
  const hoursNum = (date: string) => { const v = draft[date]?.hours; if (v === undefined) return entries[date]?.hours ?? 0; const n = Number(v.replace(",", ".")); return Number.isFinite(n) && n >= 0 && n <= 24 ? n : entries[date]?.hours ?? 0; };

  const persist = async (date: string) => {
    window.clearTimeout(timers.current[date]);
    const d = draft[date]; if (!d) return;
    const hours = d.hours.trim() === "" ? 0 : Number(d.hours.replace(",", "."));
    if (!Number.isFinite(hours) || hours < 0 || hours > 24 || Math.abs(hours * 4 - Math.round(hours * 4)) > 1e-9) { setSaved((s) => ({ ...s, [date]: "error" })); toast("Hours must be between 0 and 24, in steps of 0.25 (for example 1.5)", "error"); return; }
    setSaved((s) => ({ ...s, [date]: "saving" }));
    try {
      const r = await api.saveTimesheetDay(date, { hours, note: d.note });
      setEntries((e) => { const n = { ...e }; if (r.hours === 0 && r.note === "") delete n[date]; else n[date] = { hours: r.hours, note: r.note }; return n; });
      setDraft((x) => { const n = { ...x }; delete n[date]; return n; });
      setSaved((s) => ({ ...s, [date]: "saved" }));
      window.setTimeout(() => setSaved((s) => (s[date] === "saved" ? { ...s, [date]: undefined as never } : s)), 1600);
    } catch (e) { setSaved((s) => ({ ...s, [date]: "error" })); toast((e as Error).message, "error"); }
  };
  const edit = (date: string, patch: Partial<{ hours: string; note: string }>) => {
    setDraft((x) => ({ ...x, [date]: { ...valueOf(date), ...x[date], ...patch } }));
    window.clearTimeout(timers.current[date]);
    timers.current[date] = window.setTimeout(() => persistRef.current(date), 900);
  };
  const persistRef = useRef(persist); persistRef.current = persist;

  const weeks = useMemo(() => weeksOf(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const inMonth = (d: Date) => d.getMonth() === cursor.getMonth();
  const dayHours = (d: Date) => (inMonth(d) ? hoursNum(iso(d)) : 0);
  const weekHours = (w: Date[]) => w.reduce((n, d) => n + dayHours(d), 0);
  const total = weeks.reduce((n, w) => n + weekHours(w), 0);
  const daysWorked = weeks.flat().filter((d) => inMonth(d) && dayHours(d) > 0).length;

  const monthOptions = useMemo(() => {
    const base = new Date(now.getFullYear(), now.getMonth(), 1);
    return Array.from({ length: 30 }, (_, i) => new Date(base.getFullYear(), base.getMonth() - 18 + i, 1)).map((d) => ({ value: monthKey(d), label: d.toLocaleString("en-GB", { month: "long", year: "numeric" }) }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const focusNext = (from: HTMLElement) => { const all = [...document.querySelectorAll<HTMLInputElement>(".ts-hours:not(:disabled)")]; all[all.indexOf(from as HTMLInputElement) + 1]?.focus(); };

  return (
    <div className="ts">
      <div className="ts-head">
        <div>
          <Heading level={1}>Emerald timesheet</Heading>
          <Text secondary>Log the hours you worked each day and what you did. Totals and the amount are calculated for you.</Text>
        </div>
        <div className="ts-nav" role="group" aria-label="Choose month">
          <Button variant="secondary" size="sm" aria-label="Previous month" onClick={() => go(-1)}>‹</Button>
          <div style={{ minWidth: 190 }}><Select label="" aria-label="Month" value={month} options={monthOptions} onChange={(v: string) => { const [y, m] = v.split("-").map(Number); setCursor(new Date(y, m - 1, 1)); }} /></div>
          <Button variant="secondary" size="sm" aria-label="Next month" onClick={() => go(1)}>›</Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))} disabled={month === monthKey(now)}>This month</Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <div className="stats ts-stats">
        <Stat label="Hours this month" value={hoursText(total)} />
        <Stat label={`Amount at ${money(rate)}/hour`} value={money(total * rate)} />
        <Stat label="Days worked" value={String(daysWorked)} />
        <Stat label="Hourly rate" value={money(rate)} />
      </div>

      {error ? <StateBlock title="Couldn’t load the timesheet" description={error} action={<Button onClick={load}>Try again</Button>} /> : (
        <div className="ts-weeks" aria-busy={loading}>
          {weeks.map((w, wi) => (
            <section key={wi} className="ts-week" style={{ borderColor: pal.border }} aria-label={`Week ${wi + 1}`}>
              <header className="ts-week__head" style={{ background: pal.bgMuted, borderColor: pal.border }}>
                <strong>Week {wi + 1}</strong>
                <span style={{ color: pal.textSecondary }}>{shortDate(w[0])} – {shortDate(w[6])}</span>
                <span className="ts-week__total"><strong>{hoursText(weekHours(w))} h</strong><span style={{ color: pal.textSecondary }}> · {money(weekHours(w) * rate)}</span></span>
              </header>
              <div className="ts-cols" style={{ color: pal.textTertiary, borderColor: pal.border }} aria-hidden="true"><span>Day</span><span>Date</span><span>Hours</span><span>What was done</span></div>
              {w.map((d, di) => {
                const date = iso(d); const weekend = di >= 5; const out = !inMonth(d); const v = valueOf(date); const st = saved[date];
                return (
                  <div key={date} className={`ts-row${weekend ? " is-weekend" : ""}${out ? " is-out" : ""}${date === today ? " is-today" : ""}`} style={{ borderColor: pal.border, background: out || weekend ? pal.bgMuted : undefined }}>
                    <span className="ts-day">{DAYS[di]}</span>
                    <span className="ts-date" style={{ color: pal.textSecondary }}>{shortDate(d)}</span>
                    <input className="ts-hours" inputMode="decimal" aria-label={`Hours on ${DAYS[di]} ${shortDate(d)}`} placeholder={out ? "" : "0"} disabled={out || loading} value={out ? "" : v.hours}
                      onChange={(e) => edit(date, { hours: e.target.value })} onBlur={() => draft[date] && persist(date)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); persist(date); focusNext(e.currentTarget); } }} />
                    <input className="ts-note" aria-label={`What was done on ${DAYS[di]} ${shortDate(d)}`} placeholder={out ? "" : weekend ? "Weekend" : "What did you work on?"} maxLength={500} disabled={out || loading} value={out ? "" : v.note}
                      onChange={(e) => edit(date, { note: e.target.value })} onBlur={() => draft[date] && persist(date)} />
                    <span className={`ts-state${st ? ` is-${st}` : ""}`} role="status" aria-live="polite">{st === "saving" ? "Saving…" : st === "saved" ? "Saved" : st === "error" ? "Not saved" : ""}</span>
                  </div>
                );
              })}
            </section>
          ))}
          <section className="ts-total" style={{ borderColor: pal.text }} aria-label="Month total">
            <div><div style={{ color: pal.textSecondary, fontSize: 13 }}>Total hours worked</div><div className="ts-total__big">{hoursText(total)} h</div></div>
            <div><div style={{ color: pal.textSecondary, fontSize: 13 }}>Amount ({money(rate)} × {hoursText(total)} h)</div><div className="ts-total__big">{money(total * rate)}</div></div>
          </section>
        </div>
      )}
    </div>
  );
}
