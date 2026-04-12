const CACHE_NAME="yearly-budget-v1";
const URLS_TO_CACHE=["/Yearly-budget/","/Yearly-budget/index.html"];

self.addEventListener("install",e=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener("fetch",e=>{
  e.respondWith(
    caches.match(e.request).then(res=>res||fetch(e.request))
  );
});
