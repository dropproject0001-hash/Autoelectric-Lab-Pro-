/*
 * Virtual ECU Lab Pro — Service Worker (src/sw.js)
 * Security-Hardened App Shell, Versioned Static Caching & Offline Fallback
 *
 * NON-NEGOTIABLE SECURITY CONSTRAINTS:
 * 1. NEVER cache Firebase Authentication tokens, IdentityToolkit, SecureToken, or OAuth endpoints.
 * 2. NEVER cache License activation, status, validation, or Administrator endpoints (/api/autoelectric/license/*).
 * 3. NEVER cache Gemini AI endpoints, Firestore endpoints, or any /api/* backend route.
 * 4. NEVER cache requests carrying Authorization headers, credentials headers, or non-GET methods.
 * 5. NEVER cache responses marked Cache-Control: no-store or private.
 * 6. NEVER cache oversized archives (.zip), source maps (.map), or unverified image dumps (> 2.5 MB).
 */

const SW_VERSION = '1.2.0';
const SHELL_CACHE_NAME = `vecl-app-shell-v${SW_VERSION}`;
const STATIC_CACHE_NAME = `vecl-static-assets-v${SW_VERSION}`;
const FONTS_CACHE_NAME = `vecl-google-fonts-v${SW_VERSION}`;
const ALLOWED_CACHES = new Set([
  SHELL_CACHE_NAME,
  STATIC_CACHE_NAME,
  FONTS_CACHE_NAME,
]);

const MAX_CACHEABLE_BYTES = 2.5 * 1024 * 1024; // 2.5 MB per static asset limit
const BRAND_ICON_PATH =
  '/assets/aistudio/file_0000000098d48211abb177ce752b7b0e_62980da7.png';

// Optional Workbox manifest injection reference (populated if bundled with injectManifest)
const INJECTED_MANIFEST = Array.isArray(self.__WB_MANIFEST)
  ? self.__WB_MANIFEST
  : [];

const CORE_APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-192x192.png',
  '/pwa-maskable-512x512.png',
  BRAND_ICON_PATH,
];

/**
 * Normalizes precache URLs from CORE_APP_SHELL_URLS and any build-time manifest entries,
 * filtering out excluded or oversized assets.
 */
function getPrecacheUrls() {
  const urlSet = new Set(CORE_APP_SHELL_URLS);
  for (const entry of INJECTED_MANIFEST) {
    const rawUrl = typeof entry === 'string' ? entry : entry && entry.url;
    if (!rawUrl || typeof rawUrl !== 'string') continue;
    const normalized = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
    if (
      normalized.endsWith('.zip') ||
      normalized.endsWith('.map') ||
      (normalized.startsWith('/assets/aistudio/') &&
        normalized !== BRAND_ICON_PATH)
    ) {
      continue;
    }
    urlSet.add(normalized);
  }
  return Array.from(urlSet);
}

/**
 * Strict security classifier: returns true if a request MUST NEVER be cached or served from SW cache.
 */
function isSecuritySensitiveOrExcludedRequest(request, url) {
  // Only GET requests are eligible for caching
  if (request.method !== 'GET') {
    return true;
  }

  // Never cache any request carrying authentication tokens or license enforcement headers
  if (
    request.headers.has('authorization') ||
    request.headers.has('x-vecl-enforce-license') ||
    request.headers.has('x-firebase-appcheck')
  ) {
    return true;
  }

  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname;

  // 1. Never cache backend API routes, License activation/validation, Admin routes, or Auth helpers
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/api/autoelectric/license') ||
    pathname.startsWith('/api/autoelectric/admin') ||
    pathname.startsWith('/api/autoelectric/analyze-schematic') ||
    pathname.startsWith('/api/autoelectric/grounded-search') ||
    pathname.startsWith('/__/auth/') ||
    pathname.startsWith('/__/firebase/')
  ) {
    return true;
  }

  // 2. Never cache Firebase Auth, IdentityToolkit, SecureToken, Firestore, OAuth, or Gemini AI endpoints
  if (
    hostname.includes('securetoken.googleapis.com') ||
    hostname.includes('identitytoolkit.googleapis.com') ||
    hostname.includes('firestore.googleapis.com') ||
    hostname.includes('firebaseio.com') ||
    hostname.includes('firebaseinstallations.googleapis.com') ||
    hostname.includes('accounts.google.com') ||
    hostname.includes('oauth2.googleapis.com') ||
    hostname.includes('generativelanguage.googleapis.com') ||
    hostname.includes('apis.google.com')
  ) {
    return true;
  }

  // 3. Never cache Vite HMR / dev client internal requests
  if (
    pathname.startsWith('/@vite/') ||
    pathname.startsWith('/@react-refresh') ||
    pathname.startsWith('/@fs/') ||
    pathname.startsWith('/node_modules/')
  ) {
    return true;
  }

  // 4. Exclude large archive dumps, source maps, and unverified diagnostic screenshot dumps
  if (pathname.endsWith('.zip') || pathname.endsWith('.map')) {
    return true;
  }
  if (
    pathname.startsWith('/assets/aistudio/') &&
    pathname !== BRAND_ICON_PATH
  ) {
    return true;
  }

  return false;
}

/**
 * Validates whether an HTTP response is safe to store in Cache Storage.
 */
function isResponseSafeToCache(response) {
  if (!response || !response.ok) {
    return false;
  }

  const cacheControl = (
    response.headers.get('cache-control') || ''
  ).toLowerCase();
  if (
    cacheControl.includes('no-store') ||
    cacheControl.includes('private')
  ) {
    return false;
  }

  const contentLength = Number(response.headers.get('content-length') || '0');
  if (contentLength > MAX_CACHEABLE_BYTES) {
    return false;
  }

  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then(async (cache) => {
      const precacheUrls = getPrecacheUrls();
      // Precache shell assets individually so a single transient miss never aborts SW installation
      await Promise.allSettled(
        precacheUrls.map(async (assetUrl) => {
          try {
            const response = await fetch(assetUrl, { cache: 'reload' });
            if (response && response.ok) {
              await cache.put(assetUrl, response.clone());
            }
          } catch {
            // Ignore transient offline errors during install
          }
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => {
          if (!ALLOWED_CACHES.has(name)) {
            return caches.delete(name);
          }
          return Promise.resolve(false);
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'CLEAR_ALL_CACHES') {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      })()
    );
  } else if (data.type === 'GET_SW_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({
      version: SW_VERSION,
      caches: Array.from(ALLOWED_CACHES),
    });
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only handle standard http/https requests
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Strict Network-Only bypass for Auth, License, Admin, Firestore, Gemini API, and excluded assets
  if (isSecuritySensitiveOrExcludedRequest(request, url)) {
    return;
  }

  // 1. Document Navigation Requests (Network-First -> Cached App Shell -> Branded Offline Fallback)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (
            networkResponse &&
            networkResponse.ok &&
            url.origin === self.location.origin &&
            url.pathname !== '/offline.html'
          ) {
            const shellCache = await caches.open(SHELL_CACHE_NAME);
            shellCache.put('/index.html', networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const shellCache = await caches.open(SHELL_CACHE_NAME);

          // If explicitly requesting /offline.html, serve the branded offline page directly
          if (url.pathname === '/offline.html') {
            const offlineDirect = await shellCache.match('/offline.html');
            if (offlineDirect) return offlineDirect;
          }

          // Serve cached application shell so offline bench tools & local IndexedDB sessions work
          const cachedIndex =
            (await shellCache.match('/index.html')) ||
            (await shellCache.match('/'));
          if (cachedIndex) {
            return cachedIndex;
          }

          // Fallback to branded offline page when app shell is not yet cached
          const cachedOffline = await shellCache.match('/offline.html');
          if (cachedOffline) {
            return cachedOffline;
          }

          return new Response('Virtual ECU Lab Pro is currently offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  // 2. Google Fonts Stylesheets & Webfonts (Cache-First)
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      (async () => {
        const fontCache = await caches.open(FONTS_CACHE_NAME);
        const cached = await fontCache.match(request);
        if (cached) {
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response && (response.ok || response.type === 'opaque')) {
            fontCache.put(request, response.clone());
          }
          return response;
        } catch {
          return new Response('', { status: 504 });
        }
      })()
    );
    return;
  }

  // 3. Same-Origin Static Application Shell & Bundled Assets (Stale-While-Revalidate)
  if (url.origin === self.location.origin) {
    const isCoreShellAsset = CORE_APP_SHELL_URLS.includes(url.pathname);
    const isBundledStaticAsset =
      url.pathname.startsWith('/assets/') ||
      /\.(js|css|woff2?|png|svg|ico|webmanifest|json)$/i.test(url.pathname);

    if (isCoreShellAsset || isBundledStaticAsset) {
      event.respondWith(
        (async () => {
          const targetCacheName = isCoreShellAsset
            ? SHELL_CACHE_NAME
            : STATIC_CACHE_NAME;
          const cache = await caches.open(targetCacheName);
          const cached = await cache.match(request);

          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (isResponseSafeToCache(networkResponse)) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => null);

          if (cached) {
            return cached;
          }
          const networkResult = await fetchPromise;
          if (networkResult) {
            return networkResult;
          }

          // If navigation/HTML fallback was requested, try offline.html
          if (request.headers.get('accept')?.includes('text/html')) {
            const shellCache = await caches.open(SHELL_CACHE_NAME);
            const offlineFallback = await shellCache.match('/offline.html');
            if (offlineFallback) return offlineFallback;
          }

          return new Response('Offline asset unavailable', { status: 504 });
        })()
      );
    }
  }
});
