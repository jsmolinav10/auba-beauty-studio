/**
 * AUBA Beauty Studio — Service Worker
 * Estrategia: Cache First para estáticos, Network First para API
 */

const CACHE_NAME = 'auba-pwa-v6';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/booking.html',
    '/mis-citas.html',
    '/manicurist.html',
    '/admin.html',
    '/css/main.css',
    '/css/layout.css',
    '/css/components.css',
    '/css/animations.css',
    '/css/admin.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/booking.js',
    '/js/my-bookings.js',
    '/js/payments.js',
    '/js/manicurist.js',
    '/js/admin.js',
    '/assets/Logo Auba.png',
    '/assets/icons/icon-192x192.png',
    '/assets/icons/icon-512x512.png',
    '/manifest.json'
];

// Página offline de fallback
const OFFLINE_PAGE = '/offline.html';

// ============================================
// INSTALL — cachear archivos estáticos
// ============================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll([...STATIC_ASSETS, OFFLINE_PAGE]);
            })
            .then(() => self.skipWaiting()) // Activar inmediatamente
    );
});

// ============================================
// ACTIVATE — limpiar caches viejos
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim()) // Tomar control inmediato
    );
});

// ============================================
// FETCH — estrategia de cache según tipo de request
// ============================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar requests que no son GET
    if (request.method !== 'GET') return;

    // Ignorar extensiones de Chrome y other-origin requests
    if (!url.origin.includes(self.location.origin)) return;

    // API calls → Network First (siempre intentar datos frescos)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // HTML pages → Network First (para que bugfixes se entreguen inmediatamente)
    if (request.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // CSS, JS, images → Cache First (rápido para assets estáticos)
    event.respondWith(cacheFirst(request));
});

// ============================================
// ESTRATEGIAS DE CACHE
// ============================================

/**
 * Cache First: busca en cache primero, si no, va a la red
 * Ideal para archivos estáticos que no cambian frecuentemente
 */
async function cacheFirst(request) {
    try {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request);

        // Solo cachear respuestas exitosas
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        // Si falla todo, mostrar página offline
        const cached = await caches.match(request);
        if (cached) return cached;

        const acceptHeader = request.headers.get('accept') || '';
        if (acceptHeader.includes('text/html')) {
            return caches.match(OFFLINE_PAGE);
        }

        return new Response('Offline', { status: 503 });
    }
}

/**
 * Network First: intenta la red primero, fallback a cache
 * Ideal para API calls donde necesitamos datos frescos
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);

        // Cachear respuestas exitosas del API
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        // Sin red → devolver cached si existe
        const cached = await caches.match(request);
        if (cached) return cached;

        return new Response(
            JSON.stringify({ success: false, error: 'Sin conexión a internet' }),
            { headers: { 'Content-Type': 'application/json' }, status: 503 }
        );
    }
}
