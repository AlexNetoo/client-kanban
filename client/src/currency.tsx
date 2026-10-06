import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePalette } from "./theme";

type Cur = "EUR" | "USD";
interface Fx { rate: number; date: string; approximate: boolean }
interface Money { currency: Cur; setCurrency: (c: Cur) => void; fmt: (eur: number) => string; fx: Fx | null }

const Ctx = createContext<Money>({ currency: "EUR", setCurrency: () => {}, fmt: (n) => String(n), fx: null });
export const useMoney = () => useContext(Ctx);

const nf = (cur: Cur) => new Intl.NumberFormat(cur === "USD" ? "en-US" : "en-IE", { style: "currency", currency: cur, maximumFractionDigits: 0 });
const read = (): Cur => { try { return localStorage.getItem("currency") === "USD" ? "USD" : "EUR"; } catch { return "EUR"; } };

/** Prices are always worked out in euro; this only changes how they are shown. The rate is fetched once, on first use of USD. */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, set] = useState<Cur>(read);
  const [fx, setFx] = useState<Fx | null>(null);
  useEffect(() => {
    if (currency !== "USD" || fx) return;
    fetch("/api/fx").then((r) => (r.ok ? r.json() : Promise.reject())).then(setFx).catch(() => setFx({ rate: 1.08, date: "", approximate: true }));
  }, [currency, fx]);
  const setCurrency = useCallback((c: Cur) => { set(c); try { localStorage.setItem("currency", c); } catch { /* storage unavailable */ } }, []);
  const usd = currency === "USD" && fx;
  const fmt = useCallback((eur: number) => (usd ? nf("USD").format(eur * fx!.rate) : nf("EUR").format(eur)), [usd, fx]);
  return <Ctx.Provider value={{ currency: usd ? "USD" : "EUR", setCurrency, fmt, fx }}>{children}</Ctx.Provider>;
}

/** Small € / $ switch. */
export function CurrencyToggle() {
  const { currency, setCurrency } = useMoney();
  const pal = usePalette();
  return (
    <div role="group" aria-label="Currency" style={{ display: "inline-flex", border: `1px solid ${pal.border}`, borderRadius: 999, padding: 2 }}>
      {(["EUR", "USD"] as const).map((c) => (
        <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)} aria-label={c === "EUR" ? "Show prices in euros" : "Show prices in US dollars"}
          style={{ all: "unset", cursor: "pointer", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: currency === c ? pal.text : "transparent", color: currency === c ? pal.bg : pal.textSecondary, transition: "background-color .2s, color .2s" }}>{c === "EUR" ? "€" : "$"}</button>
      ))}
    </div>
  );
}

export function FxNote() {
  const { currency, fx } = useMoney();
  const pal = usePalette();
  if (currency !== "USD" || !fx) return null;
  return <p style={{ fontSize: 11, color: pal.textTertiary, lineHeight: 1.5 }}>Shown at €1 = ${fx.rate.toFixed(4)}{fx.approximate ? " (approximate, live rate unavailable)" : ` (${fx.date})`}. Final pricing is in euro.</p>;
}
