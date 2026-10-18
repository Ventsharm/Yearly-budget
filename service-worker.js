/* Existing scope and offline shell; FCM uses this same registration. */
importScripts("./push-state.js");
importScripts("https://www.gstatic.com/firebasejs/12.4.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.4.0/firebase-messaging-compat.js");
const CACHE_NAME = "yearly-budget-v6-compatible";
const base = self.registration.scope;
const shell = ["./", "index.html", "manifest.webmanifest", "Icon-192.png", "Icon-512.png",
  "app.js", "app.js?v=unified-2", "budget-model.js", "push-client.js", "push-config.js", "push-state.js", "reminder-utils.js"].map(p => new URL(p, base).href);
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(shell)));
});
self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("yearly-budget-") && k !== CACHE_NAME).map(k => caches.delete(k)))),
    self.clients.claim(),
  ]));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== new URL(base).origin || !url.href.startsWith(base)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok && (event.request.mode === "navigate" || shell.includes(url.href))) {
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const home = await cache.match(new URL("./", base).href);
        if (home) return home;
      }
      throw error;
    }
  })());
});
firebase.initializeApp({
  apiKey: "AIzaSyD4gZYEI2SxZCKQ32bKHV8RlPiLv-zpHrU",
  authDomain: "yearly-budget-c93fb.firebaseapp.com",
  projectId: "yearly-budget-c93fb",
  messagingSenderId: "415123329669",
  appId: "1:415123329669:web:76ab11fe58563197c9cfec",
});
function ukDay() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(Date.now()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
async function displayReminder(data) {
  if (!data?.deliveryId || !data.uid || !Number.isFinite(Number(data.expiresAt)) || Number(data.expiresAt) <= Date.now()) return;
  if (data.kind !== "created" && data.notifyDay !== ukDay()) return;
  if (!await YearlyPushState.claim(data.uid, data.deliveryId, ukDay())) return;
  await self.registration.showNotification(data.title || "Yearly Budget reminder", {
    body: data.body, icon: new URL("Icon-192.png", base).href,
    tag: "yearly-" + data.deliveryId, renotify: false,
    data: { url: new URL("./?vs_app=vs1_5d67ed0b4e1bc4bde4dd113f#reminders", base).href },
  });
}
// Data-only payloads prevent Firebase from auto-displaying a second notification.
firebase.messaging().onBackgroundMessage(payload => displayReminder(payload.data));
self.addEventListener("message", event => {
  if (event.data?.type === "YEARLY_PUSH" && event.source?.url?.startsWith(base)) {
    event.waitUntil(displayReminder(event.data.data));
  }
});
self.addEventListener("notificationclick", event => {
  if (!event.notification.tag.startsWith("yearly-")) return;
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("./?vs_app=vs1_5d67ed0b4e1bc4bde4dd113f#reminders", base).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(base));
    if (existing) { await existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  })());
});
