const test = require('node:test');
const assert = require('node:assert/strict');
const { assess } = require('../automation/schedule-diagnostic.cjs');
const { safeError } = require('../automation/send.cjs');
test('manual runs cannot pass the automatic scheduler diagnostic', () => {
  const now = Date.parse('2026-10-15T14:10:00Z');
  const common = { id: 123, display_title: 'Reminders — 47 13 15 10 *', created_at: '2026-10-15T13:48:00Z', status: 'completed', conclusion: 'success' };
  assert.equal(assess([{ ...common, event: 'workflow_dispatch' }], now).result, 'no_matching_schedule_event_recorded');
  assert.equal(assess([{ ...common, event: 'schedule' }], now).result, 'scheduled_run_created');
  assert.equal(assess([], Date.parse('2026-10-15T13:40:00Z')).result, 'not_due_yet');
  assert.equal(assess([{ ...common, event: 'schedule', created_at: '2026-10-14T13:48:00Z' }], now).result, 'no_matching_schedule_event_recorded');
});
test('error diagnostics retain useful codes without exposing payloads', () => {
  const secret = 'private-user-token';
  assert.deepEqual(safeError({ code: 7, message: secret }), { code: 7 });
  assert.deepEqual(safeError({ code: 'permission-denied', stack: secret }), { code: 'permission-denied' });
  assert.deepEqual(safeError({ code: secret, name: secret, message: secret }), { code: 'unclassified' });
});
