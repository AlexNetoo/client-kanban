import { useEffect, useRef, useState } from "react";
import { Button, Card, Heading, Text } from "./halaska-kit";
import { api } from "./api";
import { Area, DateField, Text1 } from "./fields";
import { estimate, daysBetween, euro, unitLabel, RATES } from "./lib/pricing";
import { formatDate } from "./lib/format";
import { CheckIcon, PlusIcon, useToast } from "./ui";
import { usePalette } from "./theme";
import { DiscountChip } from "./chips";
import { REQUEST_TYPES, type ProjectRequest } from "./types";

const STEPS = ["Project", "Goals", "Timeline", "Estimate"] as const;
const MAX_DAYS = 730;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const PRESETS: [string, number][] = [["2 weeks", 14], ["1 month", 30], ["2 months", 60], ["3 months", 90], ["6 months", 180], ["1 year", 365]];

/** Eases a number toward its target so the estimate feels alive when it changes. */
function useCountUp(target: number, ms = 700) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(target); from.current = target; return; }
    const start = performance.now(); const a = from.current;
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / ms); const e = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(a + (target - a) * e); setV(cur); from.current = cur;
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function EstimatePanel({ days, ready, final = false }: { days: number; ready: boolean; final?: boolean }) {
  const pal = usePalette();
  const est = ready ? estimate(days) : null;
  const total = useCountUp(est?.total ?? 0);
  const daily = ready ? days * RATES.day : 0;
  const saving = est ? Math.max(0, daily - est.total) : 0;
  return (
    <Card padding={22} style={{ borderRadius: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, color: pal.textTertiary }}>{final ? "Your estimate" : "Estimate so far"}</div>
      {!est ? <Text size="sm" secondary>Choose your start and due dates in the Timeline step and the budget appears here.</Text> : <>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div aria-live="polite" style={{ fontSize: final ? 44 : 34, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{euro(total)}</div>
            <DiscountChip total={est.total} days={est.days} />
          </div>
          <Text size="sm" secondary>for {est.days} {est.days === 1 ? "day" : "days"} of work</Text>
        </div>
        <ul style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, borderTop: `1px solid ${pal.border}`, paddingTop: 12 }}>
          {est.lines.map((l) => (
            <li key={l.unit} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: pal.textSecondary }}>
              <span>{unitLabel(l)} × {euro(l.rate)}</span><span style={{ color: pal.text, fontVariantNumeric: "tabular-nums" }}>{euro(l.subtotal)}</span>
            </li>
          ))}
        </ul>
        {saving > 0 && <p style={{ fontSize: 12, color: pal.textSecondary }}>The best rate is applied for you: {euro(saving)} less than paying by the day.</p>}
      </>}
      <p style={{ fontSize: 11, color: pal.textTertiary, lineHeight: 1.5 }}>Rates: {euro(RATES.day)} per day, {euro(RATES.week)} per week, {euro(RATES.month)} per month. An indicative estimate, confirmed after we review your brief.</p>
    </Card>
  );
}

function Goals({ goals, setGoals }: { goals: string[]; setGoals: (g: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const pal = usePalette();
  const add = () => { const g = draft.trim(); if (g && goals.length < 8) { setGoals([...goals, g.slice(0, 200)]); setDraft(""); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}><Text1 label="Add a goal" value={draft} onChange={setDraft} caption="For example: Double enquiries from the website. Press Enter to add." /></div>
        <Button type="button" variant="secondary" icon={<PlusIcon />} onClick={add} disabled={!draft.trim() || goals.length >= 8}>Add</Button>
      </div>
      {goals.length === 0 ? <Text size="sm" secondary>Add at least one goal. They become the first tasks on your project board.</Text> : (
        <ol className="goal-list" aria-label="Important goals">
          {goals.map((g, i) => (
            <li key={g + i} className="goal-item" style={{ border: `1px solid ${pal.border}`, borderRadius: 12 }}>
              <span aria-hidden="true" className="goal-num" style={{ background: pal.bgMuted }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{g}</span>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove goal: ${g}`} onClick={() => setGoals(goals.filter((_, j) => j !== i))}>Remove</Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function Onboarding() {
  const pal = usePalette();
  const toast = useToast();
  const today = iso(new Date());
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ProjectRequest | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(REQUEST_TYPES[0]);
  const [description, setDescription] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [references, setReferences] = useState("");
  const [notes, setNotes] = useState("");
  const [startDate, setStart] = useState(today);
  const [dueDate, setDue] = useState("");
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { document.title = "New project · Alex Neto - Client Portal"; }, []);
  useEffect(() => { head.current?.focus({ preventScroll: true }); }, [step, done]);

  const days = startDate && dueDate ? daysBetween(startDate, dueDate) : 0;
  const datesOk = days >= 1 && days <= MAX_DAYS;

  const check = (s: number): string => {
    if (s === 0) { if (!name.trim()) return "Give your project a name."; if (!description.trim()) return "Describe what you need in a sentence or two."; }
    if (s === 1 && goals.length === 0) return "Add at least one important goal.";
    if (s === 2) {
      if (!startDate || !dueDate) return "Choose both a start date and a due date.";
      if (days < 1) return "The due date must be on or after the start date.";
      if (days > MAX_DAYS) return "That’s longer than two years. Please shorten the dates, or contact us for a custom plan.";
    }
    return "";
  };
  const go = (to: number) => { setDir(to > step ? 1 : -1); setError(""); setStep(to); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const next = () => { const e = check(step); if (e) return setError(e); go(step + 1); };
  const submit = async () => {
    const e = [0, 1, 2].map(check).find(Boolean); if (e) return setError(e);
    setBusy(true); setError("");
    try { setDone(await api.createRequest({ name: name.trim(), type, description: description.trim(), goals, references: references.trim(), notes: notes.trim(), startDate, dueDate })); toast("Project request sent"); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="onb-done" style={{ maxWidth: 640, margin: "24px auto 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <span className="onb-check" aria-hidden="true" style={{ background: pal.text, color: pal.bg }}><CheckIcon /></span>
        <Heading level={1}>Thanks, your brief is in</Heading>
        <Text secondary>We’ll review “{done.name}” and get back to you. You’ll see it in your projects once it’s approved.</Text>
        <div style={{ width: "100%", textAlign: "left" }}><EstimatePanel days={done.days} ready final /></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <Button onClick={() => { location.hash = "#/"; }}>Back to projects</Button>
          <Button variant="secondary" onClick={() => { setDone(null); setStep(0); setName(""); setDescription(""); setGoals([]); setReferences(""); setNotes(""); setDue(""); setStart(today); }}>Start another</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1040 }}>
      <div style={{ marginBottom: 22 }}>
        <Heading level={1}>Start a new project</Heading>
        <Text secondary>Tell us about it in four short steps. You’ll see a budget estimate at the end.</Text>
      </div>

      <ol className="stepper" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
            <button type="button" disabled={i > step} onClick={() => go(i)} style={{ color: i <= step ? pal.text : pal.textTertiary }}>
              <span className="stepper__dot" style={{ background: i <= step ? pal.text : "transparent", color: i <= step ? pal.bg : pal.textTertiary, borderColor: i <= step ? pal.text : pal.border }}>{i < step ? <CheckIcon /> : i + 1}</span>
              <span className="stepper__label">{s}</span>
            </button>
            <span className="stepper__bar" style={{ background: pal.border }}><span style={{ background: pal.text, transform: `scaleX(${i < step ? 1 : 0})` }} /></span>
          </li>
        ))}
      </ol>

      <div className="onb-layout">
        <Card padding={26} style={{ borderRadius: 16 }}>
          <form onSubmit={(e) => { e.preventDefault(); if (step < 3) next(); else submit(); }} noValidate>
            <div key={step} className={dir === 1 ? "step-in" : "step-in step-in--back"} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <h2 ref={head} tabIndex={-1} style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", outline: "none" }}>
                {["What are we building?", "What matters most?", "When do you need it?", "Review and your estimate"][step]}
              </h2>

              {step === 0 && <>
                <Text1 label="Project name" required value={name} onChange={setName} />
                <fieldset className="type-grid">
                  <legend style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Type of project</legend>
                  {REQUEST_TYPES.map((t) => (
                    <button key={t} type="button" aria-pressed={type === t} className="type-chip" onClick={() => setType(t)} style={{ borderColor: type === t ? pal.text : pal.border, background: type === t ? pal.bgMuted : "transparent", color: pal.text }}>{t}</button>
                  ))}
                </fieldset>
                <Area label="Describe the project *" rows={5} value={description} onChange={setDescription} caption="What is it, who is it for, and what should it achieve?" />
              </>}

              {step === 1 && <>
                <Goals goals={goals} setGoals={setGoals} />
                <Area label="Inspiration or links (optional)" rows={2} value={references} onChange={setReferences} caption="Sites, brands or files you like." />
              </>}

              {step === 2 && <>
                <div className="row2">
                  <DateField label="Start date" required value={startDate} onChange={(v) => { setStart(v); if (dueDate && v > dueDate) setDue(""); }} />
                  <DateField label="Due date" required value={dueDate} onChange={setDue} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Or pick a duration</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {PRESETS.map(([label, n]) => {
                      const target = addDays(startDate || today, n - 1);
                      return <button key={label} type="button" className="type-chip" aria-pressed={dueDate === target} onClick={() => { if (!startDate) setStart(today); setDue(target); setError(""); }} style={{ borderColor: dueDate === target ? pal.text : pal.border, background: dueDate === target ? pal.bgMuted : "transparent", color: pal.text }}>{label}</button>;
                    })}
                  </div>
                </div>
                {datesOk && <Text size="sm" secondary>{days} {days === 1 ? "day" : "days"} · {formatDate(startDate)} to {formatDate(dueDate)}</Text>}
                <Area label="Anything else we should know? (optional)" rows={3} value={notes} onChange={setNotes} caption="Budget limits, must-have dates, stakeholders…" />
              </>}

              {step === 3 && <>
                <dl className="review">
                  {([["Project", name], ["Type", type], ["Description", description], ["Dates", `${formatDate(startDate)} to ${formatDate(dueDate)} (${days} days)`], ["Links", references], ["Notes", notes]] as [string, string][]).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}><dt style={{ color: pal.textTertiary }}>{k}</dt><dd style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{v}</dd></div>
                  ))}
                  <div><dt style={{ color: pal.textTertiary }}>Goals</dt><dd><ol style={{ paddingLeft: 18 }}>{goals.map((g, i) => <li key={i} style={{ listStyle: "decimal" }}>{g}</li>)}</ol></dd></div>
                </dl>
                <div className="onb-est-inline"><EstimatePanel days={days} ready={datesOk} final /></div>
              </>}

              {error && <p role="alert" className="shake" style={{ border: `1px solid ${pal.text}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>{error}</p>}

              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                <Button type="button" variant="ghost" onClick={() => (step === 0 ? (location.hash = "#/") : go(step - 1))}>{step === 0 ? "Cancel" : "Back"}</Button>
                {step < 3 ? <Button type="button" onClick={next}>Continue</Button> : <Button type="button" loading={busy} onClick={submit}>Submit project</Button>}
              </div>
            </div>
          </form>
        </Card>

        <aside className={step === 3 ? "onb-aside onb-aside--hide-sm" : "onb-aside"} aria-label="Budget estimate"><EstimatePanel days={datesOk ? days : 0} ready={datesOk} final={step === 3} /></aside>
      </div>
    </div>
  );
}
