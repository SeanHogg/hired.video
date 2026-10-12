import path from "path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const sourceMapsEnabled =
    String(
      env.VITE_BUILD_SOURCEMAPS ?? env.BUILD_SOURCEMAPS ?? "",
    ).toLowerCase() === "true";

  return {
    root: path.resolve(__dirname),
    server: {
      host: "::",
      port: 4003,
      hmr: {
        overlay: true,
      },
      watch: {
        usePolling: false,
        interval: 100,
      },
      fs: {
        allow: ["./", "../shared"],
        deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**"],
      },
      // No COOP/COEP: site-wide cross-origin isolation blocked every
      // third-party iframe (Turnstile, YouTube embeds) that doesn't send its
      // own COEP. ffmpeg.wasm falls back to its single-thread core when the
      // page isn't isolated (lib/timeline/ffmpeg/ffmpeg-loader.ts).
      headers: {
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    },
    build: {
      outDir: "dist",
      sourcemap: sourceMapsEnabled,
      target: "es2019",
      cssMinify: "lightningcss",
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks
            "react-vendor": ["react", "react-dom"],
            router: ["react-router-dom"],
            "ui-vendor": [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-select",
              "@radix-ui/react-tabs",
            ],
            icons: ["lucide-react"],
            charts: ["recharts"],
            utils: ["clsx", "tailwind-merge", "date-fns"],
            query: ["@tanstack/react-query"],
            forms: ["react-hook-form", "@hookform/resolvers", "zod"],
            // 3D world studio bundle (gap #1636). Splitting Three.js +
            // R3F + drei + Rapier into a named chunk so:
            //   (a) 2D mini-game projects + every non-game route never
            //       load these ~600KB gzipped of code (the chunk is
            //       lazy-loaded via the `GameStage.tsx` dispatcher);
            //   (b) the chunk URL is content-hashed independently —
            //       the PWA precache caches it once and re-uses across
            //       sessions until the bundle actually changes;
            //   (c) routine app updates (UI tweaks) don't invalidate
            //       the 3D cache.
            "three-d": [
              "three",
              "@react-three/fiber",
              "@react-three/drei",
              "@react-three/rapier",
            ],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        // Service worker is generated at build; in dev mode a no-op SW is used
        devOptions: {
          enabled: false,
        },
        // Inject the SW registration script automatically
        injectRegister: "auto",
        manifest: {
          name: "hired.video — AI Video Resumes, Hiring & Studio",
          short_name: "hired.video",
          description:
            "All-in-one video-first hiring platform: AI video resumes, ATS, sourcing CRM, AI Studio with WebGPU presenter avatars + multi-language dubbing, agency back-office (timesheets / placements / invoicing), learning pathways, and gamification — installable on iOS and Android.",
          theme_color: "#2563eb",
          background_color: "#0a0a0a",
          display: "standalone",
          // window-controls-overlay opts the standalone window into the
          // titlebar-overlay UI on Chromium desktop; falls back to standalone
          // on browsers / OSes that don't support it.
          display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
          start_url: "/?source=pwa",
          scope: "/",
          // `any` instead of `portrait-primary` so the recruiter pipeline and
          // Studio editor (both heavily-tabular) can rotate to landscape on
          // tablets without forcing a redraw.
          orientation: "any",
          categories: ["business", "productivity", "education", "social"],
          icons: [
            {
              src: "pwa-64x64.png",
              sizes: "64x64",
              type: "image/png",
            },
            {
              src: "pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          shortcuts: [
            {
              name: "My Resumes",
              short_name: "Resumes",
              description: "View and manage your resumes",
              url: "/resumes?source=pwa_shortcut",
              icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
            },
            {
              name: "Job Tracker",
              short_name: "Jobs",
              description: "Track your job applications",
              url: "/jobs?source=pwa_shortcut",
              icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
            },
            {
              name: "AI Studio",
              short_name: "Studio",
              description: "Open the AI Studio editor",
              url: "/studio?source=pwa_shortcut",
              icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
            },
            {
              name: "Recruiter Pipeline",
              short_name: "Pipeline",
              description: "Kanban hiring pipeline",
              url: "/hiring-manager?source=pwa_shortcut",
              icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
            },
          ],
          screenshots: [
            {
              src: "/og-image.svg",
              sizes: "1200x630",
              type: "image/svg+xml",
              form_factor: "wide",
              label: "hired.video — all-in-one video-first hiring",
            },
          ],
        },
        workbox: {
          // Default precache file-size limit is 2 MiB; the main app chunk
          // is ~2.1 MiB once eagerly-imported content (BLOG_POSTS, Pricing
          // copy, kind-marketing, etc.) lands. Raising to 5 MiB so the SW
          // can precache the shell; the underlying bundle bloat is tracked
          // in the gap register. (The Index.tsx → LatestGuides → BLOG_POSTS
          // path was removed in the 2026-10-03 landing redesign; re-measure
          // the main chunk before lowering this ceiling.)
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Inject our own `push` + `notificationclick` handlers
          // (public/push-sw.js) into the auto-generated SW. Browsers
          // subscribe via lib/push/web-push-client.ts → /api/push.
          importScripts: ["/push-sw.js"],
          // Cache static assets with CacheFirst
          runtimeCaching: [
            // NOTE: no `api.hired.video` rule. The API is authenticated and
            // per-user; a SW cache keyed by URL alone served one account's
            // responses to another (guest → real sign-in on the same
            // browser), and routing every API call through the SW turned
            // any SW-side fetch failure into a status-0 "Failed to fetch"
            // on the page. API requests go straight to the network; the
            // server-side edge cache (getOrSetCached) is the API cache.
            // push-sw.js deletes the legacy "api-cache" on activate.
            //
            // NOTE: no `fonts.googleapis.com` / `fonts.gstatic.com` rule.
            // Studio fonts are self-hosted (`@fontsource/*`, bundled via
            // lib/studio/font-catalog.ts) so they're same-origin and fall
            // under the static-asset woff2 rule below. A cross-origin
            // CacheFirst rule here previously made the SW throw
            // `Failed to execute 'match' on 'CacheStorage'` on the opaque
            // response under the (since removed) COEP `credentialless` header,
            // failing every studio font load with `net::ERR_FAILED`.
            {
              // Static assets (images, videos in R2, self-hosted fonts) — CacheFirst
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|otf)$/i,
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets-cache",
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
          // Pre-cache the shell (SPA entry point + all Vite chunks)
          globPatterns: ["**/*.{js,css,html,ico,svg}"],
          // Exclude stats and config files from precache
          globIgnores: ["**/stats.html", "**/config*.js"],
          // Navigation fallback for SPA routing
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//, /^\/config\.js/],
          // Clean up old caches on activation
          cleanupOutdatedCaches: true,
          // NOTE: do NOT set skipWaiting/clientsClaim here. With
          // registerType: "prompt" (above) the new SW must stay in the
          // `waiting` state so `useRegisterSW` fires onNeedRefresh and the
          // PWAUpdatePrompt toast ("New Version Available!") can render.
          // skipWaiting:true activates the new SW immediately, so it never
          // waits, needRefresh never flips true, the toast never shows, and
          // the tab keeps running stale assets until a manual hard-reload.
          // The prompt's "Update Now" → updateServiceWorker(true) posts the
          // SKIP_WAITING message that workbox-build's generated SW listens
          // for (auto-injected when skipWaiting is unset), then reloads on
          // controllerchange. That is the correct skip-on-demand path.
        },
      }),
      // Bundle analyzer — opt-in only. gzip+brotli-sizing every chunk and
      // retaining per-module metadata is memory- and CPU-heavy, and on a
      // 6.4k-module bundle it contributed to the CI build's heap pressure
      // (the OOM that raised NODE_OPTIONS in ci.yml). The stats.html it
      // emits is excluded from precache and unused by deploys, so run it
      // only when explicitly analyzing: `ANALYZE=true npm run build`.
      ...(process.env.ANALYZE === "true"
        ? [
            visualizer({
              filename: "dist/stats.html",
              open: false,
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
        "@shared": path.resolve(__dirname, "../shared"),
        "zod": path.resolve(__dirname, "./node_modules/zod"),
      },
    },
    // Emit bundled workers as ES modules (Vite's default is iife). The
    // @ffmpeg/ffmpeg worker dynamic-imports the ESM core-mt build, which an
    // iife worker can't do; the app's own workers (workers/*.worker.ts) are
    // already spawned with `{ type: "module" }`, so es is their native format.
    worker: { format: "es" },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "@tanstack/react-query",
        "lucide-react",
        "clsx",
        "tailwind-merge",
        "date-fns",
        "framer-motion",
      ],
      // @ffmpeg/* spawn their worker via `new URL("./worker.js", import.meta.url)`;
      // pre-bundling would break that relative URL (lib/timeline/ffmpeg).
      exclude: ["@vitejs/plugin-react-swc", "@ffmpeg/ffmpeg", "@ffmpeg/util"],
    },
  };
});
