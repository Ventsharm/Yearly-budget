import { ukDay, validDate } from './reminder-utils.js';
export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const LEGACY_PREFIX = 'legacy-sub-';
export const isMoneyReminder = r => r.type === 'subscription' || r.type === 'payment';
export function combineReminders(reminders, subscriptions, today = ukDay()) {
  const legacyIds = new Set(subscriptions.map(s => s.id));
  const linked = new Set(reminders.filter(r => r.id.startsWith(LEGACY_PREFIX)).map(r => r.id.slice(LEGACY_PREFIX.length)));
  const rows = reminders.map(r => ({ ...r, source: 'reminder', key: 'reminder:' + r.id,
    legacyId: r.id.startsWith(LEGACY_PREFIX) && legacyIds.has(r.id.slice(LEGACY_PREFIX.length)) ? r.id.slice(LEGACY_PREFIX.length) : null }));
  for (const s of subscriptions) {
    if (linked.has(s.id)) continue;
    rows.push({ ...s, source: 'legacy', key: 'legacy:' + s.id, legacyId: s.id,
      type: 'subscription', done: !!s.paid, date: validDate(s.date) ? s.date : null });
  }
  const dateKey = r => validDate(r.date) ? r.date :
    MONTHS.includes(r.month) ? today.slice(0,4) + '-' + String(MONTHS.indexOf(r.month)+1).padStart(2,'0') + '-99' : '9999-99-99';
  return rows.sort((a,b) => dateKey(a).localeCompare(dateKey(b)) || String(a.name || '').localeCompare(String(b.name || '')) || a.key.localeCompare(b.key));
}
export function savingsTotals(rows, today = ukDay()) {
  let month = 0, year = 0;
  for (const r of rows) {
    if (r.done || !isMoneyReminder(r) || typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount < 0) continue;
    const cents = Math.round(r.amount * 100);
    if (validDate(r.date)) {
      if (r.date.slice(0,4) === today.slice(0,4)) year += cents;
      if (r.date.slice(0,7) === today.slice(0,7)) month += cents;
    } else if (r.source === 'legacy' && MONTHS.includes(r.month)) {
      // Original subscriptions had only a month. Retain their annual-budget meaning
      // until the owner supplies an exact date; never invent a notification date.
      year += cents;
      if (MONTHS.indexOf(r.month) + 1 === Number(today.slice(5,7))) month += cents;
    }
  }
  return { month: month / 100, year: year / 100 };
}
export function reminderAmount(type, raw) {
  if (type === 'cancel') return null;
  if (String(raw).trim() === '') {
    if (type === 'subscription') throw new Error('Enter the subscription amount.');
    return null;
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000) throw new Error('Enter a valid amount.');
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
