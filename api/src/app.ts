import { Hono } from "hono";
import { cors } from "hono/cors";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import { rateLimiterMiddleware } from "./middleware/rateLimiter.js";
import { requestLoggerMiddleware } from "./middleware/requestLogger.js";
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

export function createApp() {
  const app = new Hono();

  if (process.env.SENTRY_DSN) {
    import("@sentry/node")
      .then(({ init }) => init({ dsn: process.env.SENTRY_DSN }))
      .catch(() => {});
  }

  app.use("*", requestLoggerMiddleware);

  app.use(
    "*",
    cors({
      origin:
        process.env.NODE_ENV === "production"
          ? (process.env.FRONTEND_URL ?? "https://myvideoresu.me")
          : "*",
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );

  app.use("/api/*", async (c, next) => {
    if (c.req.path.startsWith("/api/auth")) return next();
    return rateLimiterMiddleware(c, next);
  });

  app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

  app.route("/api/auth", authRoutes);
  app.route("/api/account", accountRoutes);
  app.route("/api/users", userRoutes);
  app.route("/api/resumes", resumeRoutes);
  app.route("/api/jobs", jobRoutes);
  app.route("/api/videos", videoRoutes);
  app.route("/api/companies", companyRoutes);
  app.route("/api/recruiter", recruiterRoutes);
  app.route("/api/match", matchRoutes);
  app.route("/api/messages", messageRoutes);
  app.route("/api/notifications", notificationRoutes);
  app.route("/api/dashboard", dashboardRoutes);
  app.route("/api/search", searchRoutes);
  app.route("/api/billing", billingRoutes);
  app.route("/api/affiliates", affiliateRoutes);
  app.route("/api/marketing", marketingRoutes);
  app.route("/api/settings", settingsRoutes);
  app.route("/api/upload", uploadRoutes);
  app.route("/api/ai", aiRoutes);
  app.route("/api/locations", locationRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/studio", studioRoutes);

  app.onError(globalErrorHandler);

  return app;
}
