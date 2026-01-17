const CACHE = "haes-v2"; // incrémente la version à chaque mise à jour
const ASSETS = ["./", "./index.html", "./app.js"];

// Installer et mettre en cache les fichiers
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // force le service worker à activer immédiatement
});

// Activer et nettoyer les anciens caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE) // garder seulement le cache actuel
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim(); // prend le contrôle des pages immédiatement
});

// Stratégie "Network First" : tente le réseau avant le cache
self.addEventListener("fetch", e => {
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Met à jour le cache avec la nouvelle version
        const responseClone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, responseClone));
        return response;
      })
      .catch(() => caches.match(e.request)) // fallback vers le cache si pas de réseau
  );
});
