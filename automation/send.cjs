const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { runDaily, ukDay } = require("./reminders.cjs");
const { appendFileSync } = require("node:fs");
let stage = "configuration";
function report(details) {
  const entry = { stage, ...details };
  console.log("Reminder diagnostic", JSON.stringify(entry));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `\n### Reminder diagnostic\n\n\`\`\`json\n${JSON.stringify(entry, null, 2)}\n\`\`\`\n`);
}
function safeError(error) {
  const allowed = ["permission-denied", "unauthenticated", "failed-precondition", "unavailable", "deadline-exceeded",
    "resource-exhausted", "app/invalid-credential", "app/invalid-app-options", "ECONNRESET", "ETIMEDOUT", "AbortError", "TimeoutError"];
  const code = Number.isInteger(error?.code) && error.code >= 0 && error.code <= 16 ? error.code :
    allowed.includes(error?.code) ? error.code : allowed.includes(error?.name) ? error.name : "unclassified";
  return { code }; // Never log raw errors, stack traces, user documents or tokens.
}
async function main() {
  if (process.env.REMINDERS_ENABLED !== "true") {
    console.log("Reminder sending is disabled; no Firebase reads or sends performed.");
    return;
  }
  if (process.env.FIREBASE_PROJECT_ID !== "yearly-budget-c93fb") throw new Error("Unexpected Firebase project");
  const now = Date.now();
  stage = "github_run_metadata";
  // A run queued across UK midnight must not send tomorrow's reminders for the wrong schedule.
  const run = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!run.ok) { report({ result: "failed", httpStatus: run.status }); throw new Error("Could not verify scheduled run date"); }
  const scheduledAt = Date.parse((await run.json()).created_at);
  if (!Number.isFinite(scheduledAt)) throw new Error("Invalid run date");
  report({ result: "verified", event: process.env.GITHUB_EVENT_NAME, createdAt: new Date(scheduledAt).toISOString(),
    checkedAt: new Date(now).toISOString(), ukDate: ukDay(now), dryRun: process.env.REMINDERS_DRY_RUN === "true" });
  if (ukDay(scheduledAt) !== ukDay(now)) { console.log("Expired run skipped"); return; }
  stage = "firebase_initialization";
  initializeApp({ credential: applicationDefault(), projectId: "yearly-budget-c93fb" });
  if (process.env.REMINDERS_DRY_RUN === "true") {
    const { nextDay } = require("./reminders.cjs");
    stage = "firestore_dry_run_query";
    await getFirestore().collectionGroup("yearlyReminders")
      .where("date", "==", nextDay(ukDay(now))).where("done", "==", false).limit(1).get();
    console.log("Firebase identity and reminder index verified. No notifications sent or documents written.");
    report({ result: "passed", notificationsSent: 0, documentsWritten: 0 });
    return;
  }
  stage = "reminder_query_claim_and_send";
  const summary = await runDaily({ db: getFirestore(), messaging: getMessaging(), now, scheduledAt });
  console.log("Daily reminder counts", summary);
  report({ result: summary.failed ? "completed_with_send_failures" : "completed", ...summary,
    note: "Sent counts are FCM acceptances, not confirmed displays on phones." });
  if (summary.failed) process.exitCode = 1;
}
if (require.main === module) main().catch(error => {
  report({ result: "failed", ...safeError(error) });
  console.error("Daily reminder check failed at the recorded stage. No automatic send retry is enabled.");
  process.exitCode = 1;
});
module.exports = { safeError };
