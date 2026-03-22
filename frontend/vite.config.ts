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
          name: "hired.video — AI Career & Talent Network",
          short_name: "hired.video",
          description:
            "AI-powered career copilot: match resumes, prep for interviews, track jobs, and connect with top talent.",
          theme_color: "#7c3aed",
          background_color: "#ffffff",
          display: "standalone",
          start_url: "/",
          scope: "/",
          orientation: "portrait-primary",
          categories: ["business", "productivity"],
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
              url: "/resumes",
              icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
            },
            {
              name: "Job Tracker",
              short_name: "Jobs",
              description: "Track your job applications",
              url: "/jobs",
              icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
            },
          ],
          screenshots: [],
        },
        workbox: {
          // Cache static assets with CacheFirst
          runtimeCaching: [
            {
              // API calls — NetworkFirst (never serve stale API responses)
              urlPattern: /^https:\/\/api\.hired\.video\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-cache",
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 5, // 5 minutes
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Google Fonts and external CDN assets — CacheFirst
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Static assets (images, videos in R2) — CacheFirst
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
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
      visualizer({
        filename: "dist/stats.html",
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
        "@shared": path.resolve(__dirname, "../shared"),
        "zod": path.resolve(__dirname, "./node_modules/zod"),
      },
    },
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
      exclude: ["@vitejs/plugin-react-swc"],
    },
  };
});
