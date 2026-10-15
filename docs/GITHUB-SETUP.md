# Yearly Budget reminder notifications

Uses the existing `yearly-budget-c93fb` Firebase project on free Spark, Firebase Cloud Messaging, and a standard GitHub-hosted Linux runner in this public repository. No Cloud Functions, paid scheduler, email service or Android rebuild.

## Firebase setup

- Private per-user reminder/token rules have been applied. The original subscription rule is unchanged; its saved baseline is `docs/firestore.rules.before-reminders`.
- The collection-group index on `yearlyReminders(date, done)` is created; token values are excluded from indexing.
- Dedicated keyless sender: `yearly-reminder-sender@yearly-budget-c93fb.iam.gserviceaccount.com`.
- Workload identity provider: `projects/415123329669/locations/global/workloadIdentityPools/github-reminders/providers/github`.
- Provider trust requires repository ID `1208747233`, owner ID `94763309`, `refs/heads/main`, and workflow ref `Ventsharm/Yearly-budget/.github/workflows/reminders.yml@refs/heads/main`.
- The sender has only FCM message creation, Firestore transaction/read/query/create permissions and invalid-token deletion. It has no Owner/Editor role or private service-account key. Server IAM bypasses client rules; do not share this identity with another workflow.
- The provider and service-account identifiers in the workflow are public configuration. No GitHub Actions variables or stored credentials are needed. Google OIDC credentials are short-lived.

## FCM registration and activation

The existing project's public Web Push VAPID key is configured in `push-config.js` and background registration is enabled. The sender runs only on `main`. No private VAPID key, Firebase CLI credentials or service-account private key is stored here.

A manual run defaults to a read-only dry run. Publishing sender configuration changes on `main` also performs a read-only identity/index check. Only the daily schedule or an explicitly requested manual run with dry_run=false sends notifications. No GitHub Actions variables or additional account setup is required.

The dedicated sender's Firestore query/create/read/delete permissions and FCM authorization were verified directly. The temporary permission used for validation was removed; the service account trusts only the restricted GitHub workload identity. A temporary setup-check document outside user collections was created and removed; existing user accounts/subscriptions were not changed.

## Behavior

Users choose Enable notifications, see the custom popup, then the device's permission request where supported. A successfully saved NEW reminder shows one immediate notification on the saving device. Editing it does not repeat that confirmation. The shared service worker handles these and FCM messages; no competing messaging worker is registered.

At approximately 09:23 Europe/London daily, GitHub checks reminders due tomorrow and sends FCM to registered devices. No due-date alert or email. Overdue reminders remain editable. Clicking a notification opens Reminders and preserves the existing app launch flag, so the app-access overlay accepts a fresh window. Login remains required for private data.

The workflow's manual **dry_run** input defaults to true. This verifies Firebase identity and the reminder index without sending notifications or writing documents. Normal scheduled runs send reminders.

## Costs and reliability

Expected cost is £0 while Firebase stays on Spark and the repository uses free standard public-repository Actions runners. FCM sending has no charge. Free quotas and provider terms still apply. Billing was confirmed disabled with no attached account; no budget alert can be attached without one. A budget alert is not a spending cap.

One scheduled check per day, no frequent polling. Pages of 100, maximum 1,000 reminders/run, maximum 20 tokens/user. Existing accounts, subscription documents and collection paths are not migrated or reset. Small private delivery claims accumulate; monitor Spark storage/read/write quotas alongside existing app usage.

GitHub may delay or drop scheduled runs and disables public-repository schedules after 60 days without repository activity. Reminders created or moved after the daily check can miss their alert. This is not a guaranteed payment/cancellation deadline service.

A server claim commits before FCM sends; repeated runs cannot intentionally resend the same reminder/date. The browser also suppresses duplicate displays, rejects wrong-user/expired/wrong-day messages and closes app notifications on logout. Unregistered tokens are deleted only if unchanged. Exactly-once delivery cannot be guaranteed: a crash after the claim can lose an alert, and devices can block or delay pushes. No automatic resend after an ambiguous failure.

## Checks and maintenance

`npm test`: eight date/delivery/service-worker tests. `npm run test:rules` with the local Firestore emulator: five security/sender suites. Mobile-browser checks also passed before temporary review-only browser tooling was removed. They covered login, original subscription fixtures and paid totals, custom permission flow, creation notification, overdue editing, routing and offline shell.

Tests use only `demo-yearly-budget` in local emulators, never production user accounts. Live transport and Android device acceptance must be checked separately. The installed TWA's native configuration was not supplied; the website's root assetlinks file returned 404, so notification delegation could not be verified here. No Play Store changes are part of this update.

Before future rule/index changes, re-read the live configuration and merge newer additions. Do not overwrite newer production rules or delete unrelated indexes. Never add billing, paid services or Android changes as a workaround without the owner's approval.

## Schedule and Chrome warning check

On 15 October 2026, no morning schedule event appeared in GitHub history. Two manually started runs succeeded and delivered to the owner device. The workflow was re-enabled and the cron was re-registered at 09:23 UK time. No root cause was established and the next automatic run remains to be verified; this is not a guarantee against GitHub scheduling delays/drops. No extra daily polling or paid service was added.

Day-before messages now identify the app as “Yearly Budget reminder”. Chrome controls spam warnings and can still flag a message; wording changes cannot override its decision. For an expected notification, Chrome offers Show notification → Always show → Mark as safe to Chrome. This is a device choice, not an app setting.
