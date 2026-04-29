import { Hono } from "hono";
import { cors } from "hono/cors";
import { TIER_NAME } from "../../shared/tier-copy.js";
import { PRO_MONTHLY_PRICE } from "../../shared/pricing.js";
import { authMiddleware, optionalAuthMiddleware } from "./middleware/auth.js";
import { emailVerifiedMiddleware } from "./middleware/emailVerified.js";
import { passwordChangeMiddleware } from "./middleware/passwordChange.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import { rateLimiterMiddleware } from "./middleware/rateLimiter.js";
import { requestLoggerMiddleware } from "./middleware/requestLogger.js";
import { errorSourceFilterMiddleware } from "./middleware/errorSourceFilter.js";
import { getDb, schema } from "./db/index.js";
import { studioRoutes } from "./routes/studio.js";
import { studioFeaturesRoutes } from "./routes/studio-features.js";
import { studioTemplatesRoutes } from "./routes/studio-templates.js";

import { authRoutes } from "./routes/auth.js";
import { errorsRoutes } from "./routes/errors.js";
import { accountRoutes } from "./routes/account.js";
import { userRoutes } from "./routes/users.js";
import { resumeRoutes, listResumesHandler, createResumeHandler } from "./routes/resumes.js";
import { jobRoutes } from "./routes/jobs.js";
import { jobPipelineRoutes } from "./routes/jobpipeline.js";
import { pipelineShareRoutes, pipelinePublicRoutes } from "./routes/pipeline-share.js";
import { bulkScoringRoutes } from "./routes/bulk-scoring.js";
import { transcriptSearchRoutes } from "./routes/transcript-search.js";
import {
  sourcingBrowseRoutes,
  sourcingBidsByJobRoutes,
  sourcingBidActionRoutes,
} from "./routes/sourcing-bids.js";
import { videoRoutes } from "./routes/video.js";
import { companyRoutes } from "./routes/companies.js";
import { reviewRoutes } from "./routes/reviews.js";
import { boostRoutes } from "./routes/boosts.js";
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
import { resumeRoastRoutes } from "./routes/resume-roast.js";
import { ogRoutes } from "./routes/og.js";
import { linkedInPostRoutes } from "./routes/linkedin-post.js";
import { locationRoutes } from "./routes/locations.js";
import { adminRoutes } from "./routes/admin.js";
import { superadminRoutes } from "./routes/superadmin/index.js";
import { paymentRoutes } from "./routes/payment.js";
import { youtubeRoutes } from "./routes/youtube.js";
import { communicationRoutes } from "./routes/communication.js";
import { passwordManagementRoutes } from "./routes/password-management.js";
import { resumeScorerRoutes } from "./routes/resume-scorer.js";
import { resumeOptimizerRoutes } from "./routes/resume-optimizer.js";
import { skillExtractorRoutes } from "./routes/skill-extractor.js";
import { toolRunsRoutes } from "./routes/tool-runs.js";
import { sentimentRoutes } from "./routes/sentiment.js";
import { taskRoutes } from "./routes/task.js";
import { feedRoutes } from "./routes/feed.js";
import { salaryRoutes } from "./routes/salary.js";
import { valuePropositionRoutes } from "./routes/value-proposition.js";
import { featureFlagRoutes } from "./routes/featureflag.js";
import { hubsRoutes } from "./routes/hubs.js";
import { interviewRoutes } from "./routes/interview.js";
import { scorecardRoutes } from "./routes/scorecards.js";
import { oauthRoutes } from "./routes/oauth.js";
import { adsRoutes } from "./routes/ads.js";
import { apiKeyRoutes } from "./routes/apikeys.js";
import { listsRoutes } from "./routes/lists.js";
import { followUpRoutes } from "./routes/followups.js";
import { hiringOnboardingRoutes } from "./routes/onboarding-hiring.js";
import { performanceRoutes } from "./routes/performance.js";
import { calendarRoutes } from "./routes/calendar.js";
import { exclusiveBoardRoutes } from "./routes/exclusive-boards.js";
import { communityRoutes } from "./routes/community.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { jobScraperAdminRoutes, jobScraperUserRoutes } from "./routes/jobscraper.js";
import { applyButtonRoutes } from "./routes/apply-button.js";
import { passkeyRoutes } from "./routes/passkeys.js";
import { atsRoutes } from "./routes/ats.js";
import { candidatesRoutes, candidateResumePublicRoutes } from "./routes/candidates.js";
import { pitchDeckRoutes, pitchDeckPublicRoutes } from "./routes/pitch-decks.js";
import { assessmentRoutes } from "./routes/assessments.js";
import { autoApplyRoutes } from "./routes/auto-apply.js";
import { autofillRoutes } from "./routes/autofill.js";
import { discoveryRoutes } from "./routes/discovery.js";
import { whitelabelRoutes } from "./routes/whitelabel.js";
import { serviceRoutes } from "./routes/services.js";
import { creatorRoutes } from "./routes/creators.js";
import { articleRoutes } from "./routes/articles.js";
import { reportRoutes, adminReportRoutes } from "./routes/reports.js";
import { courseRoutes } from "./routes/courses.js";
import { legalRoutes } from "./routes/legal.js";
import { advertisingRoutes } from "./routes/advertising.js";
import { careerRoutes } from "./routes/career.js";
import { phoneRoutes } from "./routes/phone.js";
import { pushRoutes } from "./routes/push.js";
import { openapiRoutes } from "./routes/openapi.js";
import { sitemapRoutes } from "./routes/sitemap.js";
import { moduleRoutes as publicModuleRoutes } from "./routes/modules.js";
import { moduleGateByPath } from "./middleware/moduleGate.js";
import { MODULE_ROUTE_REGISTRY } from "./lib/moduleRouteRegistry.js";
import { callLLM, getApiKey } from "./services/adapters/ai.js";
import { logger } from "./lib/logger.js";
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
  // Strip error._source from JSON error responses for non-SuperAdmin
  // viewers. Registered early so it resumes last in the unwind, after
  // authMiddleware has populated c.var.user.
  app.use("/api/*", errorSourceFilterMiddleware);

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
      allowHeaders: ["Content-Type", "Authorization", "X-Emulation-Token", "X-Requested-With"],
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
    "/api/auth/oauth",
    "/api/auth/magic-link",
    "/api/errors/report",
    "/api/chat/visitor",
    "/api/analytics/beacon",
    "/api/analytics/ads/impression",
    "/api/search/public",
    "/api/jobs/public",
    "/api/companies/public",
    "/api/resume/public",
    "/api/studio/videos/public",
    "/api/studio/videos/resume",
    "/api/studio/videos/user",
    "/api/studio/public",
    "/api/users/check-slug",
    "/api/resume/roast",
    "/api/og",
    "/api/apply-button",
    "/api/ats/webhook",
    "/api/hiring/offers/webhook",
    "/api/affiliates/click",
    "/api/assessments/users",
    "/api/calendar/connect",
    "/api/discovery/seo",
    "/api/discovery/jobs",
    "/api/discovery/talent-feed",
    "/api/discovery/creators/leaderboard",
    "/api/discovery/creators/products",
    "/api/services/public",
    "/api/services/browse",
    "/api/creators/public",
    "/api/creators/browse",
    "/api/creators/portfolio/public",
    "/api/articles/public",
    "/api/courses/public",
    "/api/legal/current",
    "/api/legal/list",
    "/api/phone/webhook",
    "/api/whitelabel/portal",
    "/api/whitelabel/demo-request",
    "/api/whitelabel/roi-calculator",
    "/api/public/candidate-resume",
    "/api/public/pitch-deck",
    "/api/openapi.json",
    "/api/docs",
    "/sitemap.xml",
    "/health",
    "/api/health",
  ];
  // Profile lookup by ID or slug — single segment, not a known protected name.
  // Also matches public sub-routes like /api/users/:id/resumes.
  // Access is visibility-conditional; the route handler applies optional auth.
  const USER_PROFILE_ROUTE = /^\/api\/users\/(?!me(?:$|\/)|profile(?:$|\/)|account(?:$|\/)|slug(?:$|\/)|public(?:$|\/))[^/]+(?:\/resumes)?$/;

  // Public GET-only listing/detail endpoints (job board, company directory, people).
  // POST/PATCH/DELETE to these paths still require auth via the route handlers.
  const PUBLIC_LISTING_ROUTE = /^\/api\/(?:job|jobs|companies|compan(?:y|ies))(?:$|\/(?!me$|me\/))/i;

  // Public listing endpoints that benefit from knowing the caller when authenticated
  // (e.g. to compute IsOwner on public resumes, or to show connection state on public
  // people). Route through optionalAuthMiddleware instead of the public bypass so
  // c.var.user?.sub is populated when a valid JWT is present but no error is thrown
  // when absent.
  const OPTIONAL_AUTH_PUBLIC_ROUTE = /^\/api\/(?:resumes\/public|resumes\/embedded|users\/public)(?:$|\/|\?)/;

  // Ad config is public (anonymous users see ads) but Pro check requires
  // optional auth so logged-in Pro users get adsEnabled: false.
  const ADS_CONFIG_ROUTE = /^\/api\/ads\/config$/;

  // Studio analytics events (view, CTA click) and embed code are public.
  // Route handlers use optional auth (c.var.user?.sub ?? null).
  const STUDIO_PUBLIC_ROUTE = /^\/api\/studio\/videos\/[^/]+(\/view|\/cta-click|\/embed)$/;

  // Public interview session share links — no auth required.
  const INTERVIEW_PUBLIC_ROUTE = /^\/api\/interview\/public\/[^/]+$/;

  // GET /api/resumes/:id (uuid or slug) — detail lookup. Route handler decides
  // access (owner OR public). Sub-routes like /export, /metadata, /diff, and
  // the POST/PUT/DELETE verbs stay behind full auth. Negative lookahead
  // excludes known sub-route names so they keep their existing auth behavior.
  const PUBLIC_RESUME_DETAIL_ROUTE =
    /^\/api\/resumes\/(?!public(?:$|\/)|embedded(?:$|\/)|getresumesownedbyauthuser(?:$|\/)|withownership(?:$|\/)|mastergroups(?:$|\/)|validateslug(?:$|\/)|save(?:$|\/)|parse(?:$|\/)|createfromfile(?:$|\/)|discover(?:$|\/)|tailor(?:$|\/)|embed(?:$|\/)|upload-file(?:$|\/)|track(?:$|\/)|clone(?:$|\/)|merge(?:$|\/)|stats(?:$|\/)|slug(?:$|\/))[^/]+\/?(?:$|\?)/;

  app.use("/api/*", async (c, next) => {
    const path = c.req.path;
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return next();
    if (STUDIO_PUBLIC_ROUTE.test(path)) return optionalAuthMiddleware(c as any, next);
    if (INTERVIEW_PUBLIC_ROUTE.test(path)) return next();
    if (OPTIONAL_AUTH_PUBLIC_ROUTE.test(path)) return optionalAuthMiddleware(c as any, next);
    if (c.req.method === "GET" && (USER_PROFILE_ROUTE.test(path) || PUBLIC_LISTING_ROUTE.test(path) || ADS_CONFIG_ROUTE.test(path) || PUBLIC_RESUME_DETAIL_ROUTE.test(path))) {
      return optionalAuthMiddleware(c as any, next);
    }
    return authMiddleware(c as any, next);
  });

  // Enforce email verification on all authenticated routes.
  // Exemptions: auth (handles unverified flows), password management, and
  // security settings (so users can still manage 2FA before verifying email).
  const EMAIL_VERIFY_EXEMPT = ["/api/auth", "/api/passwordmanagement", "/api/settings/security"];
  app.use("/api/*", async (c, next) => {
    const path = c.req.path;
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return next();
    if (EMAIL_VERIFY_EXEMPT.some((p) => path.startsWith(p))) return next();
    if (STUDIO_PUBLIC_ROUTE.test(path)) return next();
    if (OPTIONAL_AUTH_PUBLIC_ROUTE.test(path)) return next();
    // GET /api/resumes/:id is an optional-auth route — anonymous callers
    // can see public resumes, owners can see their own private resumes.
    // The handler (handleGetResume) enforces privacy itself, so this
    // gate would only block legitimate anonymous reads. Without the
    // exemption, `emailVerifiedMiddleware` rejects any request where
    // `c.var.user` is undefined (anonymous) and any authed-but-unverified
    // user, even when they're looking at their own resume. Both cases
    // produced 403 EMAIL_NOT_VERIFIED in prod on 2026-04-20.
    if (c.req.method === "GET" && (
      USER_PROFILE_ROUTE.test(path) ||
      PUBLIC_LISTING_ROUTE.test(path) ||
      ADS_CONFIG_ROUTE.test(path) ||
      PUBLIC_RESUME_DETAIL_ROUTE.test(path)
    )) return next();
    return emailVerifiedMiddleware(c as any, next);
  });

  // Block users who have mustChangePassword set from accessing anything except
  // the auth routes and the force-change endpoint itself.
  const PASSWORD_CHANGE_EXEMPT = ["/api/auth", "/api/passwordmanagement"];
  app.use("/api/*", async (c, next) => {
    const path = c.req.path;
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return next();
    if (PASSWORD_CHANGE_EXEMPT.some((p) => path.startsWith(p))) return next();
    if (STUDIO_PUBLIC_ROUTE.test(path)) return next();
    if (OPTIONAL_AUTH_PUBLIC_ROUTE.test(path)) return next();
    // Same rationale as the email-verify gate just above: the public
    // resume detail route is optional-auth so the gate must allow
    // anonymous callers through and let the handler enforce privacy.
    if (c.req.method === "GET" && (
      USER_PROFILE_ROUTE.test(path) ||
      PUBLIC_LISTING_ROUTE.test(path) ||
      ADS_CONFIG_ROUTE.test(path) ||
      PUBLIC_RESUME_DETAIL_ROUTE.test(path)
    )) return next();
    return passwordChangeMiddleware(c as any, next);
  });

  // Module enforcement gate — checks the modules table for each /api/<prefix>
  // that maps to a slug in MODULE_ROUTE_REGISTRY, and 403s when the slug is
  // disabled. Must run after auth so the admin/SA bypass can see c.var.user.
  app.use("/api/*", moduleGateByPath(MODULE_ROUTE_REGISTRY));

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
      return c.json({ status: "ok", version: "2026-03-27.3", timestamp: new Date().toISOString() });
    } catch (error: any) {
      return c.json(
        {
          status: "error",
          version: "2026-03-27.3",
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

  app.route("/api/auth/passkey", passkeyRoutes);
  app.route("/api/auth/oauth", oauthRoutes);
  app.route("/api/auth", authRoutes);
  app.route("/api/errors", errorsRoutes);
  app.route("/api/account", accountRoutes);
  app.route("/api/users", userRoutes);
  // Hono sub-router root path workaround: sub-router handlers registered at "/"
  // are never matched when mounted via app.route(prefix, router). Register explicitly.
  app.get("/api/resumes", listResumesHandler);
  app.get("/api/resumes/", listResumesHandler);
  app.post("/api/resumes", createResumeHandler);
  app.post("/api/resumes/", createResumeHandler);
  app.route("/api/resumes", resumeRoutes);
  app.route("/api/resume", resumeRoastRoutes); // roast must be before catch-all in resumeRoutes
  app.route("/api/resume", resumeRoutes); // legacy resume endpoints
  app.route("/api/resumescorer", resumeScorerRoutes);
  app.route("/api/resumeoptimizer", resumeOptimizerRoutes);
  app.route("/api/skillextractor", skillExtractorRoutes);
  app.route("/api/tool-runs", toolRunsRoutes);
  app.route("/api/jobs/:jobId/pipeline/share", pipelineShareRoutes);
  app.route("/api/jobs/:jobId/pipeline", jobPipelineRoutes);
  app.route("/api/pipeline/public", pipelinePublicRoutes);
  app.route("/api/recruiter/bulk-score", bulkScoringRoutes);
  app.route("/api/transcripts/search", transcriptSearchRoutes);
  app.route("/api/jobs/:jobId/sourcing-bids", sourcingBidsByJobRoutes);
  app.route("/api/sourcing", sourcingBrowseRoutes);
  app.route("/api/sourcing-bids", sourcingBidActionRoutes);
  app.route("/api/jobs", jobRoutes);
  app.route("/api/job", jobRoutes); // legacy singular endpoints (e.g., /api/Job)
  app.route("/api/video", videoRoutes); // legacy singular endpoint alias
  app.route("/api/videos", videoRoutes);
  app.route("/api/companies", companyRoutes);
  app.route("/api/reviews", reviewRoutes);
  app.route("/api/boosts", boostRoutes);
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
  app.route("/api/export", settingsRoutes); // legacy export alias — /api/export/csv maps to /api/settings/export/csv
  app.route("/api/featureflag", featureFlagRoutes);
  app.route("/api/task", taskRoutes);
  app.route("/api/upload", uploadRoutes);
  app.route("/api/communication", communicationRoutes);
  app.route("/api/ai", aiRoutes);
  app.route("/api/locations", locationRoutes);
  app.route("/api/passwordmanagement", passwordManagementRoutes);
  // SuperAdmin management portal — impersonation sessions, user management, modules, audit
  // Must be mounted BEFORE /api/admin to avoid the admin catch-all intercepting these routes.
  app.route("/api/admin/impersonate", superadminRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/productdashboard", adminRoutes); // legacy admin stats alias
  app.route("/api/studio", studioRoutes);
  app.route("/api/studio", studioFeaturesRoutes);
  app.route("/api/studio", studioTemplatesRoutes);
  app.route("/api/studio", linkedInPostRoutes);
  app.route("/api/og", ogRoutes);
  app.route("/api/youtube", youtubeRoutes);
  app.route("/api/salaryanalyzer", salaryRoutes);
  app.route("/api/salarycalculator", salaryRoutes);
  app.route("/api/valueproposition", valuePropositionRoutes);
  app.route("/api/hubs", hubsRoutes);
  app.route("/api/interview", interviewRoutes);
  app.route("/api/scorecards", scorecardRoutes);
  app.route("/api/apply-button", applyButtonRoutes);
  app.route("/api/ads", adsRoutes);
  app.route("/api/apikeys", apiKeyRoutes);
  app.route("/api/lists", listsRoutes);
  app.route("/api/followups", followUpRoutes);
  app.route("/api/hiring", hiringOnboardingRoutes);
  app.route("/api/performance", performanceRoutes);
  app.route("/api/calendar", calendarRoutes);
  app.route("/api/boards", exclusiveBoardRoutes);
  app.route("/api/community", communityRoutes);
  app.route("/api/analytics", analyticsRoutes);
  app.route("/api/admin/job-sources", jobScraperAdminRoutes);
  app.route("/api/job-sources", jobScraperUserRoutes);
  app.route("/api/ats", atsRoutes);
  app.route("/api/recruit", candidatesRoutes);
  app.route("/api/recruit/pitch-decks", pitchDeckRoutes);
  app.route("/api/public/candidate-resume", candidateResumePublicRoutes);
  app.route("/api/public/pitch-deck", pitchDeckPublicRoutes);
  app.route("/api/assessments", assessmentRoutes);
  app.route("/api/auto-apply", autoApplyRoutes);
  app.route("/api/autofill", autofillRoutes);
  app.route("/api/discovery", discoveryRoutes);
  app.route("/api/whitelabel", whitelabelRoutes);
  app.route("/api/services", serviceRoutes);
  app.route("/api/creators", creatorRoutes);
  app.route("/api/articles", articleRoutes);
  app.route("/api/reports", reportRoutes);
  app.route("/api/admin/reports", adminReportRoutes);
  app.route("/api/courses", courseRoutes);
  app.route("/api/legal", legalRoutes);
  app.route("/api/advertising", advertisingRoutes);
  app.route("/api/career", careerRoutes);
  app.route("/api/phone", phoneRoutes);
  app.route("/api/push", pushRoutes);
  app.route("/api/modules", publicModuleRoutes);
  app.route("/api", openapiRoutes);
  app.route("/", sitemapRoutes);

  // ---------------------------------------------------------------------------
  // POST /api/chat/visitor — AI prospect chat widget (#54)
  // Public (no auth). Answers questions about the platform, pricing, and
  // features. Optionally captures an email lead into marketingLeads.
  // ---------------------------------------------------------------------------
  app.post("/api/chat/visitor", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "message is required" } }, 400);

    const VISITOR_SYSTEM_PROMPT = `You are a helpful assistant for hired.video — an AI-powered hiring platform that lets job seekers create video resumes, get AI career coaching, and connect with recruiters, while helping recruiters source and manage talent faster.

Keep responses concise (2–4 sentences). Answer questions about features, pricing, and how the platform works. If asked about pricing, mention: ${TIER_NAME.free} tier (basic features), ${TIER_NAME.pro} for job seekers ($${PRO_MONTHLY_PRICE.toFixed(2)}/mo with 1M monthly AI tokens), and Recruiter/Employer plans. Encourage signing up to try the platform. Do not invent features that don't exist.`;

    const apiKey = getApiKey((c.env as any) ?? {});
    let reply = "Thanks for your interest in hired.video! We help job seekers land their dream role faster with AI-powered video resumes, career coaching, and direct connections to recruiters. Sign up free to get started — no credit card required.";

    if (apiKey) {
      try {
        reply = await callLLM(apiKey, {
          systemPrompt: VISITOR_SYSTEM_PROMPT,
          userMessage: message,
          temperature: 0.6,
          maxTokens: 200,
        });
      } catch { /* fall through to default reply */ }
    }

    // Capture lead if email provided
    if (typeof body.email === "string" && body.email.includes("@")) {
      const { getDb, schema } = await import("./db/index.js");
      const db = getDb();
      await db.insert(schema.marketingLeads)
        .values({ email: body.email, source: "visitor_chat", metadata: { firstMessage: message } } as any)
        .onConflictDoNothing()
        .catch(() => undefined);
    }

    return c.json({ success: true, reply }, 200);
  });

  // Legacy frontend service currently requests /FeatureFlag without /api prefix.
  app.route("/featureflag", featureFlagRoutes);
  app.route("/FeatureFlag", featureFlagRoutes);

  // Some legacy frontend services still call /sentiment/* without /api prefix
  app.route("/sentiment", sentimentRoutes);

  // Wrap globalErrorHandler to ensure CORS headers are present on error responses.
  // Hono's onError creates a fresh response that bypasses middleware-set headers.
  app.onError((err, c) => {
    logger.error("unhandled request error", {
      message: err.message,
      path: c.req.path,
      method: c.req.method,
    });
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

