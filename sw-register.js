// sw-register.js
// Registers the service worker on every page. Silently does nothing if the
// browser doesn't support service workers (older Safari versions).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Non-fatal — the site still works fully without a service worker,
      // it just won't be installable / won't have the offline fallback.
    });
  });
}
