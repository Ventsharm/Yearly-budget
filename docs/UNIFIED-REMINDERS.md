# Unified reminders

The app has one reminder list and one form with Subscription, Payment / top-up,
and Cancel subscription. Cancellation amounts are hidden and excluded from totals.
UK calendar-month and calendar-year totals count unfinished monetary reminders by
**due date**, including overdue dates in that period. Paid/completed records stay
in chronological order; marking a payment/top-up done displays `(paid)`.

## Compatibility and existing records

- `users/{uid}/yearlyReminders` keeps the sender's `date`, `done`, `name`, `amount`
  contract. `subscription` is the only added allowed type. Owner-only rules, token
  rules, delivery claims, authentication and Firebase project remain in place.
- Original `yearlySubscriptions` documents are read in place. Nothing is bulk
  migrated or assigned an invented day. Month-only entries retain their original
  current-year budget meaning; the UI explains this and asks for an exact date.
- Saving an exact date for an old subscription atomically updates only known
  fields on the original document and creates a linked `yearlyReminders` document
  with ID `legacy-sub-{originalId}`. Unknown original fields remain intact.
  The UI shows/counts the linked entry once. Subsequent changes to its paid status,
  date or amount update both documents atomically. Explicit deletion deletes both.
- Assigning the first exact date preserves an existing paid status. Editing a paid
  item's name/amount on the same date preserves that status. Choosing a different
  exact date reopens it for the new due date; delivery claims are never reset.
- New subscriptions live directly in `yearlyReminders`; they are one-time entries,
  not automatic recurring charges. A completed entry may be reused with a new date.

The Google Apps Script timer, GitHub notification workflow, notification sender,
FCM permissions/payload, duplicate protection and invalid-token removal are
unchanged. Existing `#reminders` links still open the app's reminder screen.
No new scheduled job, index, paid service or billing change is needed. Existing
subscription reads are retained, rather than adding a new database collection.
The service-worker shell now also caches `app.js` and retains its existing push
and offline handlers.

## Verification

`npm test` covers UK date boundaries, cents-based totals, legacy merging and
chronological paid/unpaid ordering, plus existing worker/sender diagnostics.
`npm run test:rules` must run with the Firestore emulator (`demo-yearly-budget`),
never against production. It verifies owner separation, original subscription
fields, subscription reminder types, atomic linking and unchanged sender retries.
Mobile browser fixtures use mocked Firebase modules and make no live data writes
or notification sends. They cover legacy editing, completion, totals, cancellation
amount visibility, account login and both reminder dialogs.
