const CACHE_NAME = 'sb-v3';
const ASSETS = ['/', '/index.html', '/css/styles.css', '/css/spinner.css'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(res => {
            return res || fetch(e.request).then(networkRes => {
                // Cache audio files dynamically
                if (e.request.url.includes('.mp3')) {
                    const clone = networkRes.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return networkRes;
            });
        })
    );
});
