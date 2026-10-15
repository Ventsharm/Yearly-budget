const { createHash } = require("node:crypto");
const PAGE_SIZE = 100;
const MAX_REMINDERS = 1000;
const MAX_TOKENS = 20;
const APP_URL = "https://ventsharm.github.io/Yearly-budget/?vs_app=vs1_5d67ed0b4e1bc4bde4dd113f#reminders";
function ukDay(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function nextDay(day) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// Resolve UK midnight including both daylight-saving transitions, with no extra service.
function nextMidnight(now) {
  const tomorrow = nextDay(ukDay(now));
  const utcMidnight = Date.parse(tomorrow + "T00:00:00Z");
  return ukDay(utcMidnight - 3600000) === tomorrow ? utcMidnight - 3600000 : utcMidnight;
}
function deliveryId(path, date) {
  return createHash("sha256").update(path + "|" + date).digest("hex");
}
function content(reminder) {
  return {
    title: "Yearly Budget reminder",
    body: `${reminder.name}${typeof reminder.amount === "number" ? " · £" + reminder.amount.toFixed(2) : ""} is due tomorrow.`,
  };
}
async function runDaily({ db, messaging, clock = Date.now, now = clock(), scheduledAt = now, logger = console, afterClaim }) {
  const today = ukDay(now), tomorrow = nextDay(today);
  // A delayed Scheduler retry must not reinterpret yesterday's run as today's run.
  if (ukDay(scheduledAt) !== today) return { skipped: "expired schedule" };
  const expiresAt = nextMidnight(now);
  const stats = { checked: 0, claimed: 0, sent: 0, failed: 0, invalidTokens: 0 };
  const users = new Map();
  let cursor;
  while (stats.checked < MAX_REMINDERS) {
    let q = db.collectionGroup("yearlyReminders").where("date", "==", tomorrow).where("done", "==", false)
      .orderBy("__name__").limit(Math.min(PAGE_SIZE, MAX_REMINDERS - stats.checked));
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    if (page.empty) break;
    for (const snapshot of page.docs) {
      if (clock() >= expiresAt) return stats;
      stats.checked++;
      const segments = snapshot.ref.path.split("/");
      if (segments.length !== 4 || segments[0] !== "users" || segments[2] !== "yearlyReminders") continue;
      const uid = segments[1];
      if (!users.has(uid)) {
        const tokens = await db.collection("users").doc(uid).collection("yearlyPushTokens").limit(MAX_TOKENS).get();
        users.set(uid, tokens.docs.filter(d => typeof d.data().token === "string" && d.data().token.length > 20));
      }
      const devices = users.get(uid);
      if (!devices.length) continue;
      const id = deliveryId(snapshot.ref.path, tomorrow);
      const claimRef = db.doc(`users/${uid}/yearlyReminderDeliveries/${id}`);
      const reminder = await db.runTransaction(async tx => {
        const [fresh, claim] = await Promise.all([tx.get(snapshot.ref), tx.get(claimRef)]);
        const r = fresh.data();
        if (!fresh.exists || claim.exists || r.date !== tomorrow || r.done || typeof r.name !== "string") return null;
        tx.create(claimRef, { reminderId: snapshot.id, date: tomorrow, claimedAt: now });
        return r;
      });
      if (!reminder) continue;
      stats.claimed++;
      // Claim is committed BEFORE FCM. Never retry an ambiguous send on function restart.
      // A crash here can lose this alert: exactly-once delivery is not provided by FCM.
      if (afterClaim) await afterClaim();
      if (clock() >= expiresAt) continue;
      try {
        const result = await messaging.sendEachForMulticast({
          tokens: devices.map(d => d.data().token),
          data: { ...content(reminder), uid, deliveryId: id, dueDate: tomorrow,
            notifyDay: today, expiresAt: String(expiresAt), url: APP_URL },
          webpush: { headers: { TTL: String(Math.max(0, Math.floor((expiresAt - clock()) / 1000))), Urgency: "normal" } },
        });
        for (let i = 0; i < result.responses.length; i++) {
          const response = result.responses[i];
          if (response.success) { stats.sent++; continue; }
          stats.failed++;
          if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(response.error?.code)) {
            const device = devices[i];
            // Token may have been refreshed while this send was in flight.
            await db.runTransaction(async tx => {
              const current = await tx.get(device.ref);
              if (current.exists && current.data().token === device.data().token) tx.delete(device.ref);
            });
            users.set(uid, users.get(uid).filter(d => d.id !== device.id));
            stats.invalidTokens++;
          }
        }
      } catch (error) {
        stats.failed += devices.length;
        // No message bodies, user IDs or tokens in logs. Claim remains consumed.
        logger.warn("FCM send attempt failed; delivery claim retained", { code: error.code || "unknown" });
      }
    }
    cursor = page.docs.at(-1);
    if (page.size < PAGE_SIZE) break;
  }
  if (stats.checked === MAX_REMINDERS) logger.warn("Daily reminder safety limit reached", { limit: MAX_REMINDERS });
  if (stats.failed) logger.warn("Daily reminder failures", { failed: stats.failed });
  return stats;
}
module.exports = { runDaily, ukDay, nextDay, nextMidnight, deliveryId, content, PAGE_SIZE, MAX_REMINDERS, MAX_TOKENS, APP_URL };
