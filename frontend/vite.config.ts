import path from "path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

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
