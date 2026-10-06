// Mirrors server/pricing.js (the server recomputes the estimate on submit, so this only drives the preview).
// 250 EUR per day, 1200 per week, 4500 per month (30 days); the cheapest combination wins.
export const RATES = { day: 250, week: 1200, month: 4500 } as const;
export interface EstimateLine { unit: "month" | "week" | "day"; qty: number; rate: number; subtotal: number }
export interface Estimate { days: number; lines: EstimateLine[]; total: number }

export function estimate(days: number): Estimate {
  const d = Math.max(1, Math.floor(days));
  let months = Math.floor(d / 30);
  const rest = d % 30;
  let weeks = Math.floor(rest / 7);
  let extra = rest % 7;
  if (extra * RATES.day > RATES.week) { weeks += 1; extra = 0; }
  if (weeks * RATES.week + extra * RATES.day > RATES.month) { months += 1; weeks = 0; extra = 0; }
  const lines: EstimateLine[] = [];
  if (months) lines.push({ unit: "month", qty: months, rate: RATES.month, subtotal: months * RATES.month });
  if (weeks) lines.push({ unit: "week", qty: weeks, rate: RATES.week, subtotal: weeks * RATES.week });
  if (extra) lines.push({ unit: "day", qty: extra, rate: RATES.day, subtotal: extra * RATES.day });
  return { days: d, lines, total: lines.reduce((n, l) => n + l.subtotal, 0) };
}

export function daysBetween(start: string, due: string): number {
  return Math.round((Date.parse(due + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000) + 1;
}
export const euro = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
export const unitLabel = (l: EstimateLine) => `${l.qty} ${l.unit}${l.qty === 1 ? "" : "s"}`;
