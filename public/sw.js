// Minimal service worker — network-only passthrough.
// Required for Android Chrome to launch the installed PWA in standalone mode.
// Does NOT cache anything, so deploys always serve fresh content.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pure passthrough — no caching, no offline.
  return;
});
