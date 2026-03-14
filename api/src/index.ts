import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types";
import { authMiddleware } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { resumeRoutes } from "./routes/resumes";
import { userRoutes } from "./routes/users";
import { jobRoutes } from "./routes/jobs";
import { videoRoutes } from "./routes/video";
import { studioRoutes } from "./routes/studio";
import { uploadRoutes } from "./routes/upload";
import { youtubeRoutes } from "./routes/youtube";
import { error } from "./types";

const app = new Hono<AppEnv>();

// ============================================================================
// CORS
// ============================================================================

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const isProd = c.env.DATABASE_URL?.includes("neon.tech");
      if (!isProd) return origin; // allow all in dev
      return origin === "https://myvideoresu.me" ? origin : "https://myvideoresu.me";
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400,
  }),
);

// ============================================================================
// AUTH MIDDLEWARE — applied to all /api/* except /api/auth/*
// ============================================================================

app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth/")) {
    return next();
  }
  return authMiddleware(c, next);
});

// ============================================================================
// ROUTES
// ============================================================================

app.route("/api/auth", authRoutes);
app.route("/api/resumes", resumeRoutes);
app.route("/api/users", userRoutes);
app.route("/api/jobs", jobRoutes);
app.route("/api/video", videoRoutes);
app.route("/api/studio", studioRoutes);
app.route("/api/upload", uploadRoutes);
app.route("/api/youtube", youtubeRoutes);

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get("/", (c) => {
  return c.json({
    name: "myvideoresume-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// 404 CATCH-ALL
// ============================================================================

app.notFound((c) => {
  return c.json(error("NOT_FOUND", `Route ${c.req.path} not found`), 404);
});

app.onError((err, c) => {
  console.error("[unhandled error]", err);
  return c.json(error("INTERNAL_SERVER_ERROR", "An unexpected error occurred"), 500);
});

export default app;
