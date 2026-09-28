import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  build: {
    // Rapier's compat build inlines its wasm as base64, and three.js is a
    // few hundred KB on its own, so a single-chunk PWA bundle for a game
    // this size is expected to land above Vite's default 500kB heads-up.
    chunkSizeWarningLimit: 3000,
    // Vite's default build.assetsDir ('assets') would collide with
    // public/assets (our /assets/models/*.glb drop-in convention, copied
    // verbatim into dist/assets by the public-dir copy) - move the
    // bundler's own hashed JS/CSS chunks out of the way instead of
    // renaming the public convention everywhere it's documented.
    assetsDir: 'app',
  },
  plugins: [
    VitePWA({
      // We author public/manifest.json by hand and link it ourselves in
      // index.html, so the plugin only needs to generate the service worker.
      manifest: false,
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'manifest.json'],
      devOptions: {
        enabled: true,
        type: 'module',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,glb,gltf,png,jpg,webp,ico,wasm}'],
        // Rapier's wasm binary is embedded as base64 in the compat build,
        // but keep a generous cache size limit in case real model/texture
        // assets are dropped into /assets later.
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        runtimeCaching: [
          {
            // ogg/mp3 (background music, see AudioManager) are deliberately
            // runtime-cached rather than added to globPatterns' eager
            // precache list above - they're ambience, not required for the
            // game to be playable, so they shouldn't add ~4MB to the
            // up-front "installing this PWA" download. CacheFirst means
            // each track is cached the first time it actually plays, so
            // repeat/offline listening doesn't re-fetch it.
            urlPattern: /\/assets\/.*\.(glb|gltf|png|jpg|jpeg|webp|ktx2|ogg|mp3)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dragonbound-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
});
