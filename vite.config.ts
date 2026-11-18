import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { createHash } from 'node:crypto';
import {defineConfig} from 'vite';

export default defineConfig(({ mode }) => {
  const local = mode === 'pages';
  const base = process.env.VITE_BASE_PATH || (local ? '/Sistema-De-gestao/' : '/');
  return {
    base,
    build: { target: 'es2022' },
    optimizeDeps: { exclude: local ? ['@electric-sql/pglite'] : [] },
    worker: { format: 'es' },
    plugins: [
      {
        name: 'patriti-browser-storage',
        enforce: 'pre',
        resolveId(source, importer) {
          if (!importer || !source.startsWith('.')) return;
          const target = path.resolve(path.dirname(importer.split('?')[0]), source);
          if (mode !== 'firebase' && ['src/firebase/api.ts', 'src/firebase/socket.ts'].some(file => target === path.resolve(import.meta.dirname, file))) return path.resolve(import.meta.dirname, 'src/firebase/disabled.ts');
          if (!local) {
            if (target === path.resolve(import.meta.dirname, 'src/browser/runtime.ts')) return path.resolve(import.meta.dirname, 'src/browser/disabled.ts');
            return;
          }
          if (target === path.resolve(import.meta.dirname, 'src/db/index.ts')) return path.resolve(import.meta.dirname, 'src/browser/db.ts');
          if (target === path.resolve(import.meta.dirname, 'src/server/services/passwordService.ts')) return path.resolve(import.meta.dirname, 'src/browser/passwordService.ts');
        },
      },
      react(),
      tailwindcss(),
      {
        name: 'patriti-pwa',
        apply: 'build',
        generateBundle(_options, bundle) {
          const assets = [base, ...['offline.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'].map((file) => base + file), ...Object.keys(bundle).filter((file) => !file.endsWith('.map')).map((file) => base + file)];
          const manifest = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'public/manifest.webmanifest'), 'utf8'));
          manifest.id = base; manifest.start_url = base; manifest.scope = base;
          manifest.icons = manifest.icons.map((icon: { src: string }) => ({ ...icon, src: base + icon.src.replace(/^\//, '') }));
          this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 2) });
          const template = fs.readFileSync(path.join(import.meta.dirname, 'pwa/service-worker.js'), 'utf8');
          const version = createHash('sha256').update(JSON.stringify(assets)).update(template).digest('hex').slice(0, 16);
          this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('__BUILD_VERSION__', version).replace('__PRECACHE_ASSETS__', JSON.stringify(assets)) });
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          if (local && fs.existsSync(path.join(distDir, 'index.html'))) {
            fs.copyFileSync(path.join(distDir, 'index.html'), path.join(distDir, '404.html'));
            fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        ...(local || mode === 'firebase' ? { pdfkit: path.resolve(import.meta.dirname, 'node_modules/pdfkit/js/pdfkit.standalone.js') } : {}),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
