'use strict';

// Rates in euro: 250 per day, 1200 per week, 4500 per month, 50000 per year. A year is 365 calendar days, a month 30, a week 7.
// The cheapest combination wins: 5+ extra days cost the same as a week, 4+ weeks as a month, and 12 months (54000) are capped at a year.
const DAY = 250;
const WEEK = 1200;
const MONTH = 4500;
const YEAR = 50000; // 365 days

function estimate(days) {
  const d = Math.max(1, Math.floor(days));
  let years = Math.floor(d / 365);
  const left = d % 365;
  let months = Math.floor(left / 30);
  const rest = left % 30;
  let weeks = Math.floor(rest / 7);
  let extra = rest % 7;
  if (extra * DAY > WEEK) { weeks += 1; extra = 0; } // a full week is cheaper than 5-6 single days
  if (weeks * WEEK + extra * DAY > MONTH) { months += 1; weeks = 0; extra = 0; } // and a month is cheaper than 4 weeks
  if (months * MONTH + weeks * WEEK + extra * DAY > YEAR) { years += 1; months = 0; weeks = 0; extra = 0; } // 11+ months cost more than a year
  const lines = [];
  if (years) lines.push({ unit: 'year', qty: years, rate: YEAR, subtotal: years * YEAR });
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

module.exports = { estimate, daysBetween, RATES: { DAY, WEEK, MONTH, YEAR } };
