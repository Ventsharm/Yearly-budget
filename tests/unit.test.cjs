const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ukDay, nextDay, nextMidnight, deliveryId, content } = require('../automation/reminders.cjs');
test('UK calendar calculations span BST and both daylight-saving changes', () => {
  assert.equal(ukDay(Date.parse('2026-06-01T23:30:00Z')), '2026-06-02');
  assert.equal(nextDay('2028-02-28'), '2028-02-29');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
  for (const [instant, midnight] of [
    ['2026-03-28T09:00:00Z','2026-03-29T00:00:00Z'],
    ['2026-03-29T08:00:00Z','2026-03-29T23:00:00Z'],
    ['2026-10-24T08:00:00Z','2026-10-24T23:00:00Z'],
    ['2026-10-25T09:00:00Z','2026-10-26T00:00:00Z'],
  ]) assert.equal(new Date(nextMidnight(Date.parse(instant))).toISOString(), new Date(midnight).toISOString());
});
test('delivery IDs separate users and dates, and content says tomorrow', () => {
  const a = deliveryId('users/a/yearlyReminders/r','2026-10-16');
  assert.equal(a,deliveryId('users/a/yearlyReminders/r','2026-10-16'));
  assert.notEqual(a,deliveryId('users/b/yearlyReminders/r','2026-10-16'));
  assert.notEqual(a,deliveryId('users/a/yearlyReminders/r','2026-10-17'));
  assert.deepEqual(content({type:'payment',name:'O2',amount:5}), {
    title:'Payment / top-up due tomorrow', body:'O2 · £5.00 is due tomorrow.',
  });
});
test('frontend date validation rejects impossible dates', async () => {
  const { validDate, ukDay: frontendDay } = await import('../reminder-utils.js');
  assert.equal(validDate('2026-02-30'),false);
  assert.equal(validDate('2028-02-29'),true);
  assert.equal(validDate('not-a-date'),false);
  assert.equal(frontendDay(Date.parse('2026-06-01T23:30:00Z')), '2026-06-02');
});
