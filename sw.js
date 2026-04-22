const CACHE_NAME = 'soundboard-cache-v2'; // Bumped version to force refresh
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/css/spinner.css',
  '/img/mlg-favicon.png',
  '/loader.js',
  '/sounds.json'
];

self.addEventListener('install', function(event) {
  console.log('SW installing...');
  self.skipWaiting(); // Forces the browser to activate this new SW immediately
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

self.addEventListener('activate', function(event) {
  console.log('SW activating...');
  // Clean up old caches so we don't eat up user's storage
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      // 1. Return the cached file if we have it (instant load!)
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Otherwise, fetch it from the network
      return fetch(event.request).then(function(networkResponse) {
        // Don't cache invalid responses or third-party opaque responses
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // CRITICAL UPGRADE: Dynamically cache audio files!
        // If the fetch request was for an mp3, save it to cache so the next play is instant.
        if (event.request.url.match(/\.(mp3|wav|ogg)$/)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
        }

        return networkResponse;
      });
    })
  );
});
