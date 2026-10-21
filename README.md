# Yearly Budget — Android download page

The website application is retired. This repository now hosts the native Android app's Google Play download screen in the established Budget Planner safeguard design.

- Existing website: https://ventsharm.github.io/Yearly-budget/
- Google Play: https://play.google.com/store/apps/details?id=com.ventsharm.yearlybudget
- Native source: `Ventsharm/private-android-builder`, branch `apps/yearly-budget-native`, folder `apps/yearly-budget`.

The old web application, Firebase web configuration, browser push code, reminder workflows, scheduler source, Node dependencies, web tests and obsolete icons/manifest have been removed from the current tree. Git history preserves their original source. Removing Firebase rule/index/configuration files here does not deploy changes to production. Firebase accounts, saved budgets, deployed rules/indexes, native reminders and the private native source/signing workflow are unchanged.

The separately hosted Apps Script project previously renamed **App notification template** is preserved; it is not needed to run the native app's notifications.

`service-worker.js` remains at its original address to retire installed website workers, close their old web notifications, clear only caches prefixed `yearly-budget-`, unregister and reload the download page. It contains no Firebase imports or notification sender. The page requests an update only for this app's existing worker scope and does not install a new worker. Other apps' caches and workers remain untouched. Offline installations may need an internet connection and a reopen to receive the update.

The domain-root password-manager association stays in `Ventsharm/ventsharm.github.io` at `/.well-known/assetlinks.json`.

Remaining files: `index.html`, `assets/app-icon.png` (the existing native icon), `service-worker.js`, and this README.
