# Review validation

Executed locally on 2026-10-15. Firebase production user data was not read or changed by tests; all test accounts/documents use `demo-yearly-budget` in local Auth/Firestore emulators. The production configuration, billing state and live rules were inspected read-only separately.

## Passing automated checks

`npm test`: **8/8 pass**.

- UK dates and next-midnight expiry across both daylight-saving transitions and leap/year boundaries.
- Stable, distinct delivery identities and clear tomorrow wording.
- Invalid frontend dates rejected.
- Duplicate FCM messages display once, including service-worker restart.
- Expired, wrong-day, wrong-user and signed-out messages suppressed.
- Separate creation/day-before notifications with duplicate suppression.
- Offline shell survives a worker upgrade, without deleting other apps' caches or intercepting Firebase API requests.
- Notification links focus an existing app window or open a fresh one at Reminders with the existing launch flag.

`npm run test:rules` against the Firestore emulator: **5/5 suites pass**.

- Owner reminder CRUD, overdue rescheduling and completion work; anonymous/cross-user access and invalid edits fail.
- Token privacy and validation work; clients cannot read/write delivery claims.
- Original subscription fields and paid status keep their previous access behavior.
- Concurrent daily runs and subsequent retries send once for tomorrow; skip today/overdue/done; a new date can send once; expired tokens are deleted safely.
- Simulated restart after claim and ambiguous FCM failure cannot trigger a second send.

`npm run test:ui` against Auth/Firestore emulators using Chromium at a 390px mobile viewport: **pass**.

- Verified-email login loads existing subscription fixtures; paid/unpaid totals still update.
- Custom permission dialog opens first. Not now makes no device-permission request; Allow calls it. Device permission responses are simulated in the browser test; real Android prompts are not verified here.
- Saving a new payment reminder calls the real service-worker notification API exactly once after permission; changing an overdue reminder's date does not repeat creation notification.
- Reminders deep link, mobile layout, and offline shell reload work.

Syntax checks, `git diff --check`, and a disabled sender run also pass. Disabled sending performs no Firebase reads/sends. FCM transport is stubbed in the automated sender tests.

## Not yet verified / blockers

- **GitHub publication:** owner authorization resolved the earlier 403 responses. The backup and implementation are published as separate branches for review; main remains unchanged. This verifies repository writes, not sender activation.
- **Actual GitHub workflow execution:** not run; no workload identity or repository variables were configured, and the workflow remains gated off.
- **Production Firestore rules/indexes:** prepared and tested, not deployed. The production reminder permissions error remains until the reviewed rules are applied.
- **Live FCM delivery:** not tested. Existing-project VAPID key and secure GitHub OIDC access must be configured first. No notification credentials were put in the repository.
- **Existing users' real accounts/subscriptions:** no production credentials were requested; tested with emulator fixtures. Owner acceptance test is still required.
- **Existing Android TWA with app closed:** cannot verify without a real device and the installed build. No rebuild/Play Store change was performed. Origin assetlinks returned 404; see `REMINDERS-REVIEW.md`.

Estimated running cost under current setup: **£0**, using Spark/FCM and standard public-repository GitHub runners within free quotas. This is not a timing guarantee, a promise that free-plan terms never change, or a reason to enable billing. No paid service or billing upgrade was performed.
