# Free GitHub sender setup (not applied automatically)

Keep Firebase on Spark. No billable Cloud Functions or Cloud Scheduler. Do not link billing. This branch has no production deployment workflow.

The repository currently exposes read/push access, but this session's GitHub integration cannot read its Actions settings (`403 Resource not accessible by integration`). The owner may need to authorize Actions settings / variables access or set the three variables below through GitHub. That is separate from normal repository write access.

## Identity

Use Google Cloud Workload Identity Federation with GitHub OIDC. Create a dedicated service account in existing project `yearly-budget-c93fb` and a workload identity pool/provider. These are IAM configuration, not a new Firebase project. Check existing configuration before creating anything. No service-account keys need to be generated or stored.

Provider issuer: `https://token.actions.githubusercontent.com`.

Map `google.subject=assertion.sub`, `attribute.repository_id=assertion.repository_id` and `attribute.repository_owner_id=assertion.repository_owner_id`.

Use a provider attribute condition requiring **all** of:

```
assertion.repository_id == '1208747233' &&
assertion.repository_owner_id == '94763309' &&
assertion.ref == 'refs/heads/main' &&
assertion.workflow_ref == 'Ventsharm/Yearly-budget/.github/workflows/reminders.yml@refs/heads/main'
```

Grant that pool's principal set for repository ID `1208747233` `roles/iam.workloadIdentityUser` on the dedicated service account only. Do not grant Owner/Editor. Grant only the Firestore entity read/query/create/delete and transaction permissions required by the sender, and `cloudmessaging.messages.create` for FCM. Review the exact IAM permission set with Google before applying it. A normal backend identity bypasses Firestore client rules; do not expose it in browser code or share it with other workflows. Firestore IAM does not provide the same per-document path restrictions as client security rules.

If this project's required identity APIs are disabled, review them before enabling; do not turn on a paid service or billing as a workaround. Configure `google-github-actions/auth` as shown in the checked-in workflow. Its credentials are ephemeral and the action cleans them up after the job.

## Repository variables (public identifiers, not keys)

- `YEARLY_GCP_WORKLOAD_IDENTITY_PROVIDER`: full provider resource returned by Google, for example `projects/415123329669/locations/global/workloadIdentityPools/<actual-pool>/providers/<actual-provider>`.
- `YEARLY_GCP_SERVICE_ACCOUNT`: actual dedicated service-account email.
- `YEARLY_REMINDERS_ENABLED`: leave unset/false until production review; set to `true` only after approval and setup.

Standard GitHub-hosted `ubuntu-latest`, one schedule/day at 09:17 Europe/London, 12-minute job timeout, one concurrent run. Versions of third-party actions are pinned to commit hashes. `npm ci --omit=dev --ignore-scripts` installs the locked sender dependency without install scripts. No untrusted reminder data is inserted into shell commands.

## FCM web registration

In the **existing** Firebase project's settings, Cloud Messaging → Web configuration → Web Push certificates, obtain/generate its public VAPID key. Set `push-config.js` to that public key, and enable it only after the reviewed private token rules are active. Do not put any private VAPID key, Google credentials, Firebase CLI login token or account password in this repository.

`getToken()` uses the existing `service-worker.js` registration, so no competing root-scope messaging worker is installed. Existing users enable permission on each supported browser/device. Firebase tokens are written only under their authenticated UID. Signing out disables local delivery, closes this app's displayed notifications and attempts to remove the device token. Network failures may leave a stale server token; the worker's owner check still prevents it displaying notifications for another user.

## Tests

```
npm ci --ignore-scripts
npm test
firebase emulators:start --only firestore,auth --project demo-yearly-budget
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:rules
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run test:ui
```

Browser checks use Chromium at `/usr/bin/chromium` and the isolated demo project. Tests never sign in to production accounts or modify production data. Unit/emulator tests fake FCM sending; real FCM/TWA verification remains a separate approval-stage check.
