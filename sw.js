const CACHE_NAME = 'solaris-swahili-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './manifest.json',
    // تخزين الخطوط مسبقاً لتسريع التحميل
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Tajawal:wght@300;400;500;700;800&display=swap'
];

// 1. التثبيت (Install): حفظ الملفات الأساسية في الكاش
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Service Worker] Caching Core Assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting(); // تفعيل النسخة الجديدة فوراً
});

// 2. التفعيل (Activate): تنظيف الكاش القديم إن وُجد
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Clearing Old Cache');
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. الاستجابة للطلبات (Fetch): استراتيجية الاسترداد
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // استراتيجية Network First (الشبكة أولاً ثم الكاش) لطلبات API الخاصة بالشمس والصلاة
    if (url.hostname.includes('api.sunrisesunset.io') || url.hostname.includes('api.aladhan.com')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(event.request);
            })
        );
        return;
    }

    // استراتيجية Cache First (الكاش أولاً لتسريع التطبيق) لباقي الملفات
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request).then(networkResponse => {
                // تخزين الملفات الجديدة في الكاش (مثل الخطوط)
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            });
        }).catch(() => {
            // في حال فشل كل شيء وعدم وجود إنترنت، ارجع للصفحة الرئيسية
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});
