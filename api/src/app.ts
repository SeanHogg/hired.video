import { Hono } from "hono";
import { cors } from "hono/cors";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import { rateLimiterMiddleware } from "./middleware/rateLimiter.js";
import { requestLoggerMiddleware } from "./middleware/requestLogger.js";
import { studioRoutes } from "./routes/studio";

import { authRoutes } from "./routes/auth.js";
import { accountRoutes } from "./routes/account.js";
import { userRoutes } from "./routes/users.js";
import { resumeRoutes } from "./routes/resumes";
import { jobRoutes } from "./routes/jobs.js";
import { videoRoutes } from "./routes/video";
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
import { youtubeRoutes } from "./routes/youtube";
import { communicationRoutes } from "./routes/communication.js";
import { passwordManagementRoutes } from "./routes/password-management.js";
import { resumeScorerRoutes } from "./routes/resume-scorer.js";
import { resumeOptimizerRoutes } from "./routes/resume-optimizer.js";
import { sentimentRoutes } from "./routes/sentiment.js";
import { taskRoutes } from "./routes/task";
import { feedRoutes } from "./routes/feed";
import { salaryRoutes } from "./routes/salary";
import { valuePropositionRoutes } from "./routes/value-proposition";
import { featureFlagRoutes } from "./routes/feature-flag";
import { hubsRoutes } from "./routes/hubs";

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

  const allowedOrigins = (process.env.FRONTEND_URL ?? "https://hired.video,https://myvideoresu.me")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Allow local dev origin(s) when running locally
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.push(
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4003",
      "http://127.0.0.1:4003",
    );
  }

  // Also allow any localhost port for convenience (covers docker/VM networking)
  const isLocalhostOrigin = (origin: string) =>
    origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return "*"; // allow non-browser requests (e.g., server-side)
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

  // Simple health check
  app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

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
  app.route("/api/featureflag", featureFlagRoutes);
  app.route("/api/hubs", hubsRoutes);

  // Legacy frontend service currently requests /FeatureFlag without /api prefix.
  app.route("/featureflag", featureFlagRoutes);
  app.route("/FeatureFlag", featureFlagRoutes);

  // Some legacy frontend services still call /sentiment/* without /api prefix
  app.route("/sentiment", sentimentRoutes);

  app.onError(globalErrorHandler);

  return app;
}
