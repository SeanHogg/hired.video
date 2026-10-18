import { runtimeConfig } from "@/lib/runtime-config";
import { logger } from "@/lib/logger";
import { performanceMonitor } from "@/lib/performance";
import { initializeErrorTracking, reportError } from "@/lib/error-tracking";
import { installPaidMediaPixels } from "@/lib/paid-media-pixels";

/**
 * One-time, module-level app bootstrap side effects (error tracking, paid
 * media pixels, config logging, perf monitoring, global error listeners).
 * Called exactly once by the entry module (App.tsx) before first render.
 */
export function bootstrapApp(): void {
  // Initialize error tracking (GlitchTip/Sentry compatible)
  initializeErrorTracking();

  // Install paid-media pixels (Meta/Google/LinkedIn/TikTok/Bing) for the
  // hired.video house workspace. Captures landing-page click IDs into
  // cookies, then injects platform pixels based on the public config.
  // Fire-and-forget — safe even if /api/paid-media/pixels/public 404s.
  installPaidMediaPixels().catch((err) => {
    if (runtimeConfig.isDevelopment) console.warn("[paid-media] pixel install failed", err);
  });

  // Log current configuration in development
  if (runtimeConfig.isDevelopment) {
    runtimeConfig.logConfig();
  }

  // Initialize performance monitoring
  if (runtimeConfig.performance.MONITORING) {
    performanceMonitor.recordMemoryUsage();

    // Record memory usage periodically
    setInterval(() => {
      performanceMonitor.recordMemoryUsage();
    }, 60000); // Every minute
  }

  // Global error handler for unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const error = new Error(`Unhandled promise rejection: ${event.reason}`);
    logger.error("Unhandled promise rejection", {
      reason: event.reason,
      promise: event.promise,
    });

    // Report to error tracking
    reportError(error, {
      type: "unhandledrejection",
      reason: event.reason,
    });

    // Prevent the default browser behavior
    event.preventDefault();
  });

  // Global error handler for uncaught errors
  window.addEventListener("error", (event) => {
    logger.error("Uncaught error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });

    // Report to error tracking
    if (event.error) {
      reportError(event.error, {
        type: "uncaughterror",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    }
  });
}
