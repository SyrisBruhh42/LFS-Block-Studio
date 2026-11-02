// The production build replaces this file with a complete, hash-bound offline worker.
// Development previews must not install an incomplete copy or take over an existing one.
self.addEventListener('install', event => {
  event.waitUntil(Promise.reject(new Error('Use a generated production build for the Studio offline copy.')));
});
