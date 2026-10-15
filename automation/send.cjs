const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { runDaily, ukDay } = require("./reminders.cjs");
async function main() {
  if (process.env.REMINDERS_ENABLED !== "true") {
    console.log("Reminder sending is disabled; no Firebase reads or sends performed.");
    return;
  }
  if (process.env.FIREBASE_PROJECT_ID !== "yearly-budget-c93fb") throw new Error("Unexpected Firebase project");
  const now = Date.now();
  // A run queued across UK midnight must not send tomorrow's reminders for the wrong schedule.
  const run = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!run.ok) throw new Error("Could not verify scheduled run date");
  const scheduledAt = Date.parse((await run.json()).created_at);
  if (ukDay(scheduledAt) !== ukDay(now)) { console.log("Expired run skipped"); return; }
  initializeApp({ credential: applicationDefault(), projectId: "yearly-budget-c93fb" });
  const summary = await runDaily({ db: getFirestore(), messaging: getMessaging(), now, scheduledAt });
  console.log("Daily reminder counts", summary);
}
main().catch(() => { console.error("Daily reminder check failed. No automatic send retry is enabled."); process.exitCode = 1; });
