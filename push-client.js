import { getMessaging, getToken, deleteToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-messaging.js";
import { doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { pushConfig } from "./push-config.js";
import "./push-state.js";

let context, messaging, registration, activeUser, removeForegroundListener;
let tokenRecord;
let queue = Promise.resolve();
const enqueue = task => (queue = queue.catch(() => {}).then(task));
export function configurePush(app, db, auth, status) {
  context = { app, db, auth, status };
}
export async function supportsPush() {
  return window.isSecureContext && "Notification" in window &&
    "serviceWorker" in navigator && "PushManager" in window && await isSupported();
}
async function prepare() {
  registration = await navigator.serviceWorker.register("./service-worker.js");
  await navigator.serviceWorker.ready;
  messaging ||= getMessaging(context.app);
  if (!removeForegroundListener) removeForegroundListener = onMessage(messaging, payload => {
    // All displays use the same worker's durable duplicate check, including foreground messages.
    registration.active?.postMessage({ type: "YEARLY_PUSH", data: payload.data });
  });
}
export function setPushUser(user) {
  activeUser = user;
  // Serialize ownership and token operations across sign-in/sign-out races.
  return enqueue(async () => {
    await YearlyPushState.setOwner(user?.uid || null);
    if (!user || !(await supportsPush()) || Notification.permission !== "granted") return;
    await prepare();
    if (pushConfig.enabled) await registerToken(user);
  }).catch(() => { context.status.textContent = "Could not refresh background notifications. Try Enable notifications."; });
}
async function registerToken(user) {
  await prepare();
  if (!pushConfig.enabled || !pushConfig.vapidKey) {
    context.status.textContent = "Creation notifications are enabled. Day-before delivery is awaiting the reviewed GitHub setup.";
    return;
  }
  const token = await getToken(messaging, { vapidKey: pushConfig.vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("No notification token was returned.");
  if (context.auth.currentUser?.uid !== user.uid || activeUser?.uid !== user.uid) return;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const id = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
  const ref = doc(context.db, "users", user.uid, "yearlyPushTokens", id);
  // At most one write per sign-in / explicit enable; no polling or heartbeat writes.
  await setDoc(ref, { token, updatedAt: Date.now() });
  if (tokenRecord && tokenRecord.uid === user.uid && tokenRecord.id !== id) await deleteDoc(tokenRecord.ref).catch(() => {});
  tokenRecord = { uid: user.uid, id, ref };
  await YearlyPushState.setOwner(user.uid);
  context.status.textContent = "Background reminders enabled for this device.";
}
export function enablePush() {
  const user = context.auth.currentUser;
  return enqueue(async () => {
    if (!user || activeUser?.uid !== user.uid) return;
    await YearlyPushState.setOwner(user.uid);
    await registerToken(user);
  });
}
export function notifyCreated(reminder, user) {
  return enqueue(async () => {
    if (!user || activeUser?.uid !== user.uid || context.auth.currentUser?.uid !== user.uid ||
        !(await supportsPush()) || Notification.permission !== "granted") return;
    await prepare();
    registration.active?.postMessage({ type: "YEARLY_PUSH", data: {
      kind: "created", uid: user.uid, deliveryId: "created-" + user.uid + "-" + reminder.id,
      title: "Reminder saved", body: `${reminder.name} · Due ${reminder.date}`,
      expiresAt: String(Date.now() + 300000),
    }});
  });
}
export async function detachPushToken() {
  activeUser = null;
  // Suppress queued notifications locally even if a network token deletion fails.
  await enqueue(async () => {
    await YearlyPushState.setOwner(null);
    if (tokenRecord) await deleteDoc(tokenRecord.ref).catch(() => {});
    tokenRecord = null;
    if (messaging) await deleteToken(messaging).catch(() => {});
    if (registration) {
      const notices = await registration.getNotifications();
      notices.forEach(n => n.close());
    }
  }).catch(() => {}); // Notification cleanup must never prevent the existing logout flow.
}
