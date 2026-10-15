# Reminder notifications — review branch

This changes the existing app, not its Firebase project or Android binary. Nothing in this branch deploys the website, Firestore rules, IAM permissions or paid services automatically.

## Final behavior

- Keep the purple/white UI, Firebase configuration, login, subscriptions, and paid/unpaid behavior.
- Keep the custom permission popup, then request the device's actual permission after Allow.
- After a **new** reminder saves successfully, show one immediate confirmation on that saving device, if notifications are allowed. This is a local service-worker notification, not a server broadcast to the user's other devices. Editing a reminder does not repeat it.
- One GitHub workflow checks reminders at **09:17 Europe/London** each day, including UK clock changes, and sends FCM data messages for reminders **due tomorrow**. No due-date or overdue notification. No email.
- Keep overdue reminders visible and editable. A changed due date gets a new day-before delivery identity; reverting to an already-notified date cannot resend it.
- All reminder, token and server-only delivery documents are private. Subscription access rules are preserved verbatim. No existing user documents are migrated, reset or deleted.
- Notification clicks open the existing app URL at `#reminders`, including its current `vs_app` launch flag so the existing app-access overlay does not block a fresh notification window. The flag is already public in the app source; Firebase authentication remains required for all user data.

## Not yet activated

`push-config.js` deliberately has `enabled: false` and no VAPID key. The workflow requires the repository variable `YEARLY_REMINDERS_ENABLED=true` and the `main` branch. It cannot send from this review branch. The main website and live rules are unchanged.

Activation requires reviewing and applying the rules/indexes, an existing-project FCM Web Push public key, and a Google workload identity trusted **only** by this repository's reminder workflow on `main`. No Cloud Functions, Scheduler, Secret Manager, email provider, Firebase upgrade or Android rebuild is required by this design.

## Verified project and backups

Inspected existing Firebase project `yearly-budget-c93fb` (project number `415123329669`). Cloud Billing reported `billingEnabled: false`, no attached billing account; Firestore reports `eur3`, free tier. FCM and Firestore APIs were already enabled. Cloud Functions and Cloud Scheduler were not enabled, and were not enabled for this change.

Starting repository commit: `97ce87ffd123e8e1d88c2ae01e4dfc3e0659d33d`. A complete Git bundle was made before editing. `docs/firestore.rules.before-reminders` is an exact copy of the live rules read before changes. GitHub access was verified after the owner authorized the ChatGPT Codex Connector. The remote branch `backup/before-reminders-2026-10-15` preserves the starting commit; the implementation is isolated on `feature/one-time-reminder-push`. Main and the live website remain unchanged.

The supplied ZIP was compared against that commit. It replaced foreground due/overdue notifications with generic Web Push, lacked durable send claims, and proposed a billed Cloud Function. Those parts were not copied into the final design; the existing app and its data paths were retained.

## Costs and limits

- Firebase stays on **Spark**. FCM has no sending charge. Firestore stays subject to its free storage, read and write quotas; with no linked billing account it cannot silently charge overages. Exhausted quotas can interrupt this app and its existing subscriptions until they reset.
- Standard GitHub-hosted Linux Actions runners are free for public repositories under current GitHub terms. No larger runner or paid service is requested. Recheck pricing if the repository becomes private or provider terms change.
- One scheduled run/day, pages of 100, at most **1,000** due reminders/run and **20** token documents/user/run. Each distinct due user has one bounded token query. Each candidate is re-read with a private delivery claim in a transaction; a successful claim needs one document write. No frequent polling, heartbeats or successful-send log documents.
- At the configured ceiling, approximate worst case is 23,000 document reads and 1,000 claim writes/run, plus query minimums, contention retries and existing app traffic. Typical small use is much lower. Firestore charges no money on this project's current Spark plan, but quotas still matter. Claims accumulate small private documents; storage capacity must be monitored.
- No billing account exists, so a Cloud Billing budget alert cannot currently be attached. None was created. A budget alert is not a spending cap. If billing is ever enabled, review budget alerts and usage before activating anything chargeable.

## Delivery and reliability limits

GitHub schedules are best effort: a run may be delayed or dropped; public-repository schedules disable after 60 days without repository activity. Schedule away from the top of the hour reduces congestion but does not guarantee timing. A manual run can recover a missed check on the same UK day, with duplicate claims still enforced. A run created on an earlier UK day is rejected. Reminders added or moved after the check may miss that day's alert. This is not a guaranteed payment/cancellation deadline service.

A Firestore claim is committed before FCM is called; retries, overlapping runs and process restarts cannot intentionally re-send that reminder/date. IndexedDB suppresses repeated displays on each browser, including foreground/background duplication and worker restarts. Expiry and UK-day checks prevent delayed day-before messages appearing on the due date. Invalid/unregistered tokens are removed only if the stored token has not changed. Generic FCM errors do not delete tokens.

**Exactly-once delivery is not possible to guarantee with FCM.** A crash after claiming and before sending can lose an alert; a failed or ambiguous send is not retried automatically. A device/browser can also block or delay notifications, and clearing browser storage resets local duplicate history. Each registered device can receive its own copy of the day-before alert.

## Existing Android app

No Android source, Bubblewrap configuration, signing certificate, APK or AAB was supplied in this repository/ZIP. The origin's `https://ventsharm.github.io/.well-known/assetlinks.json` returned HTTP 404 when checked. That means the deployed website association could not be verified here; it does not by itself establish the installed app's capabilities or prove a rebuild is needed.

This browser service worker can use Web Push without an Android rebuild where the installed TWA and its browser already support it. A real-device check is still required: allow notifications, create a reminder, close the app, send a tomorrow reminder, and tap its notification. Verify both Chrome/site and Android app notification settings. If the TWA lacks delegation/permission support, use Chrome while evaluating the cause; explain and obtain approval before any Android changes or Play Store update.

## Production review checklist

1. Re-read live rules and indexes before deployment and merge any intervening changes; do not deploy a stale full rules/index file over newer configuration. The repository's previous subscription rule must remain exact.
2. Follow `GITHUB-SETUP.md`; confirm the workload identity accepts only this repository, workflow and main branch. Use short-lived OIDC credentials, not a service-account private key or a GitHub token in browser code.
3. Apply only the approved private reminder/token rules and the new index/index exemption. Recheck Spark billing before activation. No `firebase deploy --only functions` or API enabling is part of this implementation.
4. Add the public FCM Web Push VAPID key to `push-config.js`, enable it, and enable the repository variable only after backend access/rules are ready.
5. Review and merge the branch only with the owner's approval. Main is the existing GitHub Pages source. Allow the new service worker to activate after older app tabs close; do not force an unreviewed worker over running clients.
6. Test real existing-user login and subscription visibility with the account owner, plus one controlled real-device FCM delivery. Emulator fixtures validate behavior, but are not evidence of a production login or Android delivery test.

Sources: [GitHub schedule limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Firebase pricing](https://firebase.google.com/pricing), [FCM Web setup](https://firebase.google.com/docs/cloud-messaging/js/client).
