'use strict';

// Rates in euro: 250 per day, 1200 per week, 4500 per month. A "month" is 30 calendar days, a week 7.
// The cheapest combination wins: 5+ extra days cost the same as a week, and 4+ weeks cost the same as a month.
const DAY = 250;
const WEEK = 1200;
const MONTH = 4500;

function estimate(days) {
  const d = Math.max(1, Math.floor(days));
  let months = Math.floor(d / 30);
  const rest = d % 30;
  let weeks = Math.floor(rest / 7);
  let extra = rest % 7;
  if (extra * DAY > WEEK) { weeks += 1; extra = 0; } // a full week is cheaper than 5-6 single days
  if (weeks * WEEK + extra * DAY > MONTH) { months += 1; weeks = 0; extra = 0; } // and a month is cheaper than 4 weeks
  const lines = [];
  if (months) lines.push({ unit: 'month', qty: months, rate: MONTH, subtotal: months * MONTH });
  if (weeks) lines.push({ unit: 'week', qty: weeks, rate: WEEK, subtotal: weeks * WEEK });
  if (extra) lines.push({ unit: 'day', qty: extra, rate: DAY, subtotal: extra * DAY });
  return { days: d, lines, total: lines.reduce((n, l) => n + l.subtotal, 0) };
}

/** Whole calendar days from start to due, both included. */
function daysBetween(start, due) {
  const s = Date.parse(start + 'T00:00:00Z');
  const e = Date.parse(due + 'T00:00:00Z');
  return Math.round((e - s) / 86400000) + 1;
}

module.exports = { estimate, daysBetween, RATES: { DAY, WEEK, MONTH } };
