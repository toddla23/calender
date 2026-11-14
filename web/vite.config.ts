import { defineConfig, type Plugin } from 'vite';
import crypto from 'node:crypto';

/** 빌드 결과물 목록으로 서비스워커(sw.js)를 만든다 */
function serviceWorker(): Plugin {
  return {
    name: 'deskcal-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const assets = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', ...files.filter((f) => f !== 'index.html').map((f) => '/' + f)];
      const version = crypto.createHash('sha256').update(files.sort().join('|')).digest('hex').slice(0, 10);
      const sw = `// 자동 생성됨
const CACHE = 'deskcal-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname === '/healthz') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

export default defineConfig({
  plugins: [serviceWorker()],
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', ws: true },
      '/auth': 'http://127.0.0.1:3000',
      '/healthz': 'http://127.0.0.1:3000',
    },
  },
});
