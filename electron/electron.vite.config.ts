import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// sync-core는 별도 빌드 없이 소스를 직접 번들에 포함한다 (tsconfig paths와 동일한 별칭)
const syncCore = resolve(__dirname, '../shared/sync-core/src/index.ts');
const alias = { '@calendar/sync-core': syncCore };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [
      react(),
      // dev 서버(HMR)는 인라인 스크립트가 필요하므로 개발 시에만 CSP 메타를 제거한다
      {
        name: 'dev-no-csp',
        apply: 'serve',
        transformIndexHtml: (html: string) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
      },
    ],
    server: { fs: { allow: [resolve(__dirname, '..')] } },
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
});
