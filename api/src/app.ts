import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import { rateLimiterMiddleware } from "./middleware/rateLimiter.js";
import { requestLoggerMiddleware } from "./middleware/requestLogger.js";
import { getDb, schema } from "./db/index.js";
import { studioRoutes } from "./routes/studio.js";

import { authRoutes } from "./routes/auth.js";
import { accountRoutes } from "./routes/account.js";
import { userRoutes } from "./routes/users.js";
import { resumeRoutes } from "./routes/resumes.js";
import { jobRoutes } from "./routes/jobs.js";
import { videoRoutes } from "./routes/video.js";
import { companyRoutes } from "./routes/companies.js";
import { recruiterRoutes } from "./routes/recruiter.js";
import { matchRoutes } from "./routes/match.js";
import { messageRoutes } from "./routes/messages.js";
import { notificationRoutes } from "./routes/notifications.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { searchRoutes } from "./routes/search.js";
import { billingRoutes } from "./routes/billing.js";
import { affiliateRoutes } from "./routes/affiliates.js";
import { marketingRoutes } from "./routes/marketing.js";
import { settingsRoutes } from "./routes/settings.js";
import { uploadRoutes } from "./routes/upload.js";
import { aiRoutes } from "./routes/ai.js";
import { locationRoutes } from "./routes/locations.js";
import { adminRoutes } from "./routes/admin.js";
import { paymentRoutes } from "./routes/payment.js";
import { youtubeRoutes } from "./routes/youtube.js";
import { communicationRoutes } from "./routes/communication.js";
import { passwordManagementRoutes } from "./routes/password-management.js";
import { resumeScorerRoutes } from "./routes/resume-scorer.js";
import { resumeOptimizerRoutes } from "./routes/resume-optimizer.js";
import { sentimentRoutes } from "./routes/sentiment.js";
import { taskRoutes } from "./routes/task.js";
import { feedRoutes } from "./routes/feed.js";
import { salaryRoutes } from "./routes/salary.js";
import { valuePropositionRoutes } from "./routes/value-proposition.js";
import { featureFlagRoutes } from "./routes/featureflag.js";
import { hubsRoutes } from "./routes/hubs.js";
export function createApp() {
  const app = new Hono();

  if (process.env.SENTRY_DSN) {
    // Load Sentry lazily only when available; avoid compile-time dependency errors.
    (0, eval)("import('@sentry/node')")
      .then(({ init }: { init: (cfg: { dsn?: string }) => void }) =>
        init({ dsn: process.env.SENTRY_DSN }),
      )
      .catch(() => {});
  }

  app.use("*", requestLoggerMiddleware);

  // Also allow any localhost port for convenience (covers docker/VM networking)
  const isLocalhostOrigin = (origin: string) =>
    origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");

  // Compute allowed origins per-request so Cloudflare Worker env bindings
  // (which aren't available at module-load time) are picked up correctly.
  const getAllowedOrigins = (): string[] => {
    const frontendUrl =
      (globalThis as any).__ENV?.FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      "https://hired.video";
    const origins = frontendUrl
      .split(",")
      .map((o: string) => o.trim())
      .filter(Boolean);
    if (process.env.NODE_ENV !== "production") {
      origins.push(
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4003",
        "http://127.0.0.1:4003",
      );
    }
    return origins;
  };

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return "*"; // allow non-browser requests (e.g., server-side)
        const allowedOrigins = getAllowedOrigins();
        if (allowedOrigins.includes(origin) || isLocalhostOrigin(origin)) {
          return origin;
        }
        // Return a non-matching literal origin to effectively deny browser CORS.
        return "null";
      },
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );

  app.use("/api/*", async (c, next) => {
    if (c.req.path.startsWith("/api/auth")) return next();
    return rateLimiterMiddleware(c, next);
  });

  // Apply JWT auth middleware to all /api/* routes except public ones
  const PUBLIC_PREFIXES = [
    "/api/auth",
    "/api/search/public",
    "/api/users/public",
    "/api/jobs/public",
    "/api/companies/public",
    "/api/resumes/public",
    "/api/resume/public",
    "/health",
    "/api/health",
  ];
  app.use("/api/*", async (c, next) => {
    const path = c.req.path;
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return next();
    return authMiddleware(c as any, next);
  });

  // Simple health check (includes DB connectivity)
  const healthHandler = async (c: any) => {
    try {
      const db = getDb();
      // Check connectivity with a minimal query that doesn't depend on app tables.
      // This avoids failing health checks when the schema is not yet set up.
      const raw = (db as any).execute || (db as any).query || (db as any).run;
      if (typeof raw === "function") {
        await raw.call(db, "SELECT 1");
      } else {
        // Fallback to a simple table query (existing behavior).
        await db.select().from(schema.users).limit(1);
      }
      return c.json({ status: "ok", timestamp: new Date().toISOString() });
    } catch (error: any) {
      return c.json(
        {
          status: "error",
          timestamp: new Date().toISOString(),
          error: String(error?.message ?? error),
        },
        503,
      );
    }
  };

  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  // Temporary route to quiet accidental /api/collab requests from dev tools/extensions
  // (no business logic currently needed)
  app.get("/api/collab/:id", (c) => c.body(null, 204));

  app.route("/api/auth", authRoutes);
  app.route("/api/account", accountRoutes);
  app.route("/api/users", userRoutes);
  app.route("/api/resumes", resumeRoutes);
  app.route("/api/resume", resumeRoutes); // legacy resume endpoints
  app.route("/api/resumescorer", resumeScorerRoutes);
  app.route("/api/resumeoptimizer", resumeOptimizerRoutes);
  app.route("/api/jobs", jobRoutes);
  app.route("/api/job", jobRoutes); // legacy singular endpoints (e.g., /api/Job)
  app.route("/api/video", videoRoutes); // legacy singular endpoint alias
  app.route("/api/videos", videoRoutes);
  app.route("/api/companies", companyRoutes);
  app.route("/api/recruiter", recruiterRoutes);
  app.route("/api/match", matchRoutes);
  app.route("/api/messages", messageRoutes);
  app.route("/api/chat", messageRoutes); // legacy AI chat endpoint alias
  app.route("/api/feed", feedRoutes);
  app.route("/api/notifications", notificationRoutes);
  app.route("/api/dashboard", dashboardRoutes);
  app.route("/api/userdashboard", dashboardRoutes); // legacy dashboard alias
  app.route("/api/search", searchRoutes);
  app.route("/api/billing", billingRoutes);
  app.route("/api/affiliate", affiliateRoutes); // legacy singular endpoint alias
  app.route("/api/payment", paymentRoutes);
  app.route("/api/affiliates", affiliateRoutes);
  app.route("/api/marketing", marketingRoutes);
  app.route("/api/settings", settingsRoutes);
  app.route("/api/featureflag", featureFlagRoutes);
  app.route("/api/task", taskRoutes);
  app.route("/api/upload", uploadRoutes);
  app.route("/api/communication", communicationRoutes);
  app.route("/api/ai", aiRoutes);
  app.route("/api/locations", locationRoutes);
  app.route("/api/passwordmanagement", passwordManagementRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/productdashboard", adminRoutes); // legacy admin stats alias
  app.route("/api/studio", studioRoutes);
  app.route("/api/youtube", youtubeRoutes);
  app.route("/api/salaryanalyzer", salaryRoutes);
  app.route("/api/salarycalculator", salaryRoutes);
  app.route("/api/valueproposition", valuePropositionRoutes);
  app.route("/api/hubs", hubsRoutes);

  // Legacy frontend service currently requests /FeatureFlag without /api prefix.
  app.route("/featureflag", featureFlagRoutes);
  app.route("/FeatureFlag", featureFlagRoutes);

  // Some legacy frontend services still call /sentiment/* without /api prefix
  app.route("/sentiment", sentimentRoutes);

  // Wrap globalErrorHandler to ensure CORS headers are present on error responses.
  // Hono's onError creates a fresh response that bypasses middleware-set headers.
  app.onError((err, c) => {
    const origin = c.req.header("origin") ?? "";
    if (origin && (getAllowedOrigins().includes(origin) || isLocalhostOrigin(origin))) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Vary", "Origin");
    }
    return globalErrorHandler(err, c);
  });

  return app;
}

