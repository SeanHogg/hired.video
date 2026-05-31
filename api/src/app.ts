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
import { gamesRoutes } from "./routes/games.js";
import { gameAgentRoutes } from "./routes/game-agent.js";
import { studioTemplatesRoutes } from "./routes/studio-templates.js";
import { studioDubbingRoutes } from "./routes/studio-dubbing.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { nleRoutes } from "./routes/nle.js";

import { authRoutes } from "./routes/auth.js";
import { errorsRoutes } from "./routes/errors.js";
import { metaRoutes } from "./routes/meta.js";
import { extensionRoutes } from "./routes/extension.js";
import { accountRoutes } from "./routes/account.js";
import { workforceRoutes } from "./routes/workforce.js";
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
import { companyRoutes } from "./routes/companies.js";
import { companyEmbedRoutes } from "./routes/company-embed.js";
import { embedApiRoutes, embedAssetRoutes } from "./routes/embed-runtime.js";
import { reviewRoutes } from "./routes/reviews.js";
import { boostRoutes } from "./routes/boosts.js";
import { taxonomyRoutes } from "./routes/taxonomies.js";
import { recruiterRoutes } from "./routes/recruiter.js";
import {
  liveScreenRecruiterRoutes,
  liveScreenPublicRoutes,
} from "./routes/live-screen.js";
import { matchRoutes } from "./routes/match.js";
import { messageRoutes } from "./routes/messages.js";
import { notificationRoutes } from "./routes/notifications.js";
import { inboxRoutes } from "./routes/inbox.js";
import { emailIntegrationRoutes } from "./routes/email-integration.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { searchRoutes } from "./routes/search.js";
import { billingRoutes } from "./routes/billing.js";
import { affiliateRoutes } from "./routes/affiliates.js";
import { marketingRoutes } from "./routes/marketing.js";
import { settingsRoutes } from "./routes/settings.js";
import { uploadRoutes } from "./routes/upload.js";
import { aiRoutes } from "./routes/ai.js";
import { mcpRoutes } from "./routes/mcp.js";
import { profileAuditRoutes } from "./routes/profile-audit.js";
import { career360Routes } from "./routes/career360.js";
import { profileRoutes } from "./routes/profile.js";
import { channelRoutes } from "./routes/channels.js";
import { resumeRoastRoutes } from "./routes/resume-roast.js";
import { ogRoutes } from "./routes/og.js";
import { linkedInPostRoutes } from "./routes/linkedin-post.js";
import { vendorSyncRoutes } from "./routes/vendor-sync.js";
import { locationRoutes } from "./routes/locations.js";
import { contentAudienceRoutes } from "./routes/content-audiences.js";
import { retainedSearchRoutes } from "./routes/retained-search.js";
import { referenceRoutes } from "./routes/references.js";
import { networkRoutes } from "./routes/network.js";
import { adminRoutes } from "./routes/admin.js";
import { adminR2Routes } from "./routes/admin-r2.js";
import { adminWorkerRoutes } from "./routes/admin-workers.js";
import { adminCourseRoutes } from "./routes/admin-courses.js";
import { lmsOauthRoutes } from "./routes/lms-oauth.js";
import { superadminRoutes } from "./routes/superadmin/index.js";
import { paymentRoutes } from "./routes/payment.js";
import { payoutRoutes } from "./routes/payouts.js";
import { outplacementRoutes } from "./routes/outplacement.js";
import { boostCheckoutRoutes } from "./routes/boost-checkout.js";
import { courseCheckoutRoutes } from "./routes/course-checkout.js";
import { taxReportingRoutes } from "./routes/tax-reporting.js";
import { recruiterBdRoutes } from "./routes/recruiter-bd.js";
import { gigsRoutes } from "./routes/gigs.js";
import { templateExtractorRoutes } from "./routes/template-extractor.js";
import { adminTemplatesReviewRoutes } from "./routes/admin-templates-review.js";
import { photorealAvatarRoutes } from "./routes/photoreal-avatar.js";
import { jobAnalyticsRoutes } from "./routes/job-analytics.js";
import { aiCostReconciliationRoutes } from "./routes/ai-cost-reconciliation.js";
import { featuredCreatorsRoutes } from "./routes/featured-creators.js";
import { artifactMetricsRoutes } from "./routes/artifact-metrics.js";
import { contentReportsRoutes } from "./routes/content-reports.js";
import { takeHomeInvitesRoutes } from "./routes/take-home-invites.js";
import { youtubeRoutes } from "./routes/youtube.js";
import { communicationRoutes } from "./routes/communication.js";
import { passwordManagementRoutes } from "./routes/password-management.js";
import { resumeScorerRoutes } from "./routes/resume-scorer.js";
import { resumeOptimizerRoutes } from "./routes/resume-optimizer.js";
import { skillExtractorRoutes } from "./routes/skill-extractor.js";
import { toolRunsRoutes } from "./routes/tool-runs.js";
import { sentimentRoutes } from "./routes/sentiment.js";
import { taskRoutes } from "./routes/task.js";
import { pointsRoutes } from "./routes/points.js";
import { feedRoutes } from "./routes/feed.js";
import { salaryRoutes } from "./routes/salary.js";
import { valuePropositionRoutes } from "./routes/value-proposition.js";
import { featureFlagRoutes } from "./routes/featureflag.js";
import { bootstrapRoutes } from "./routes/bootstrap.js";
import { hubsRoutes } from "./routes/hubs.js";
import { interviewRoutes } from "./routes/interview.js";
import { interviewAssignmentRoutes } from "./routes/interview-assignments.js";
import { interviewQuestionSetRoutes } from "./routes/interview-question-sets.js";
import { videoPitchRoutes } from "./routes/video-pitch.js";
import { scorecardRoutes, takeHomePublicRoutes } from "./routes/scorecards.js";
import { calibrationRoutes } from "./routes/calibration.js";
import { oauthRoutes } from "./routes/oauth.js";
import { adsRoutes } from "./routes/ads.js";
import { apiKeyRoutes } from "./routes/apikeys.js";
import { listsRoutes } from "./routes/lists.js";
import { followUpRoutes } from "./routes/followups.js";
import { hiringOnboardingRoutes } from "./routes/onboarding-hiring.js";
import { performanceRoutes } from "./routes/performance.js";
import { peopleRoutes } from "./routes/people.js";
import { calendarRoutes } from "./routes/calendar.js";
import { eventRoutes } from "./routes/events.js";
import { coffeeRoutes } from "./routes/coffee.js";
import { mapRoutes } from "./routes/map.js";
import { exclusiveBoardRoutes } from "./routes/exclusive-boards.js";
import { communityRoutes } from "./routes/community.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { jobScraperAdminRoutes, jobScraperUserRoutes } from "./routes/jobscraper.js";
import { applyButtonRoutes } from "./routes/apply-button.js";
import { passkeyRoutes } from "./routes/passkeys.js";
import { securityRoutes } from "./routes/security.js";
import { adminSecurityRoutes } from "./routes/adminSecurity.js";
import { atsRoutes } from "./routes/ats.js";
import { candidatesRoutes, candidateResumePublicRoutes } from "./routes/candidates.js";
import { pitchDeckRoutes, pitchDeckPublicRoutes } from "./routes/pitch-decks.js";
import { assessmentRoutes } from "./routes/assessments.js";
import { predictiveAssessmentRoutes } from "./routes/predictive-assessments.js";
import { userAuditRoutes } from "./routes/user-audit.js";
import { hiringInsightsRoutes } from "./routes/hiring-insights.js";
import { graphRoutes } from "./routes/graph.js";
import { chatSocketRoutes } from "./routes/chat-socket.js";
import { gameSocketRoutes } from "./routes/game-socket.js";
import { autoApplyRoutes } from "./routes/auto-apply.js";
import { autofillRoutes } from "./routes/autofill.js";
import { discoveryRoutes } from "./routes/discovery.js";
import { whitelabelRoutes } from "./routes/whitelabel.js";
import { serviceRoutes } from "./routes/services.js";
import { creatorRoutes } from "./routes/creators.js";
import { articleRoutes } from "./routes/articles.js";
import { adminArticleRoutes } from "./routes/admin-articles.js";
import { reportRoutes, adminReportRoutes } from "./routes/reports.js";
import {
  communityResourceRoutes,
  adminCommunityResourceRoutes,
} from "./routes/community-resources.js";
import { courseRoutes } from "./routes/courses.js";
import { courseAuthoringRoutes } from "./routes/course-authoring.js";
import { campaignDollarsRoutes } from "./routes/campaign-dollars.js";
import { learningPathRoutes } from "./routes/learning-paths.js";
import { verifyRoutes } from "./routes/verify.js";
import { legalRoutes } from "./routes/legal.js";
import { advertisingRoutes } from "./routes/advertising.js";
import { paidMediaRoutes } from "./routes/paid-media.js";
import { clickIdCaptureMiddleware } from "./middleware/clickIdCapture.js";
import { careerRoutes } from "./routes/career.js";
import { phoneRoutes } from "./routes/phone.js";
import { openapiRoutes } from "./routes/openapi.js";
import { sitemapRoutes } from "./routes/sitemap.js";
import { moduleRoutes as publicModuleRoutes } from "./routes/modules.js";
import { moduleGateByPath } from "./middleware/moduleGate.js";
import { MODULE_ROUTE_REGISTRY } from "./lib/moduleRouteRegistry.js";
import { createLLMClient, hasAnyLLMProviderKey } from "./services/adapters/llm-client.js";
import {
  buildTokenBudgetExceededResponse,
  TokenBudgetExceededError,
} from "./domains/billing/token-ledger.js";
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
  // Capture paid-media click IDs (fbclid/gclid/li_fat_id/ttclid/msclkid) on
  // ANY request so the cookies are present whatever the visitor's landing
  // page. Cheap, idempotent — see middleware/clickIdCapture.ts.
  app.use("*", clickIdCaptureMiddleware);
  // Strip error._source from JSON error responses for non-SuperAdmin
  // viewers. Registered early so it resumes last in the unwind, after
  // authMiddleware has populated c.var.user.
  app.use("/api/*", errorSourceFilterMiddleware);

  // Allow any origin. Frontend uses credentials: "include", so we echo the
  // request Origin back instead of "*" (browsers reject "*" with credentials).
  app.use(
    "*",
    cors({
      origin: (origin) => origin || "*",
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
    // Geo-IP surface for the dynamic Privacy / Terms / Cookie pages
    // and any other surface that needs the visitor's country before
    // they've signed in.
    "/api/_meta/geo",
    // Chrome extension telemetry — the optionalAuthMiddleware attaches
    // the user if a JWT is present, but signed-out captures are accepted
    // too (most valuable when detection fails on the LinkedIn signed-out
    // public preview layout).
    "/api/extension/sessions",
    "/api/chat/visitor",
    "/api/analytics/beacon",
    "/api/analytics/ads/impression",
    "/api/search/public",
    "/api/retained-search/firms",
    "/api/references/shared/",
    "/api/jobs/public",
    "/api/companies/public",
    "/api/resume/public",
    "/api/studio/videos/public",
    "/api/studio/videos/resume",
    "/api/studio/videos/user",
    "/api/studio/videos/featured",
    "/api/studio/public",
    // Per-entity public videos rail (#323). EntityVideos on Resume / Job /
    // Company / Profile / Article cards hits this for non-owners (incl.
    // anonymous viewers on public listing pages) so public videos linked
    // to the entity stay watchable. Owners still hit the auth'd `/projects`
    // endpoint to see their drafts + analytics.
    "/api/studio/projects/public",
    // Public voice-clone detail (#762). Powers the
    // `/marketplace/voices/:id` share-link landing page for unauthenticated
    // viewers. Returns the SAFE projection only (no sampleAudioUrl).
    "/api/studio/voice-clones/public",
    // Studio template marketplace — visibility='public' listings shown on
    // the /studio landing page and the per-creator listing pages. Handlers
    // at studio-templates.ts are explicitly anonymous ("No auth: anonymous
    // browsers + logged-in users both see the same set, which is what makes
    // the marketplace a marketplace") — gap #1121.
    "/api/studio/templates/public",
    "/api/studio/templates/listing",
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
    // Runtime-editable Pro / per-seat prices read by the public /pricing page
    // and the marketing surface. Anonymous callers must see live prices, not
    // the compile-time defaults.
    "/api/billing/pricing-config",
    // Paid-media OAuth start/callback are top-level browser navigations
    // (consent screen redirect) so they ride a short-lived JWT in
    // `state` instead of an Authorization header. /pixels/public is read
    // by the frontend app shell to inject pixel snippets — anonymous
    // visitors must see it. /conversions is server-to-server only and
    // stays authenticated.
    // Paid-media OAuth callback is a top-level browser navigation
    // (consent screen redirect) — identity rides in the signed `state`
    // JWT. /pixels/public is read by the frontend app shell to inject
    // pixel snippets and must be visible to anonymous visitors.
    // /oauth/start (POST) stays auth-required.
    "/api/paid-media/oauth/callback",
    "/api/paid-media/pixels/public",
    // Pre-signup security checks. Geo eligibility is the gate that hides
    // the signup form for sanctioned regions / shows the waitlist for
    // not-yet-launched ones (`<RegisterGate>` reads it). The waitlist POST
    // captures the prospect when blocked. Both run BEFORE any account
    // exists so they can't carry an Authorization header.
    "/api/security/geo",
    "/api/security/region-waitlist",
    "/api/phone/webhook",
    // Embed runtime data API — authenticated by a company embed key
    // (validated in the handler), not a user session. The loader + iframe
    // frame live under /embed/* (outside /api, so no auth gate).
    "/api/embed/v1",
    "/api/whitelabel/portal",
    "/api/whitelabel/demo-request",
    "/api/whitelabel/roi-calculator",
    "/api/public/candidate-resume",
    "/api/public/pitch-deck",
    "/api/public/take-home",
    // /map discovery pins (events + open-to-coffee people) — anonymous
    // visitors must see the pins so the public /map page works without
    // a session. Handler reads zero user-scoped data.
    "/api/map",
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
  const OPTIONAL_AUTH_PUBLIC_ROUTE = /^\/api\/(?:resumes\/public|resumes\/embedded|users\/public|vendor-sync\/connectors)(?:$|\/|\?)/;

  // Ad config is public (anonymous users see ads) but Pro check requires
  // optional auth so logged-in Pro users get adsEnabled: false.
  const ADS_CONFIG_ROUTE = /^\/api\/ads\/config$/;

  // Studio analytics events (view, CTA click), embed code, and the
  // per-second heatmap tracker are public. Route handlers use optional
  // auth (c.var.user?.sub ?? null). Both the legacy `/videos/<id>/…`
  // callsites and the post-#665 `/projects/<id>/…` callsites resolve
  // here — keying view/CTA-click analytics on the studio project (not
  // the rendered video row) is what makes pre-render telemetry
  // possible, so `projects` is the branch all live frontends now hit.
  // `/analytics/track` is the per-second watch heatmap (Wistia-style
  // drop-off chart) the watch page fires on tick / beforeunload /
  // ended; the handler is documented public, but until this entry was
  // added the global authMiddleware 401'd anonymous viewers before the
  // handler ran. Without it, the public watch page's view-tracking
  // POST returns 401 and the unauth visitor never gets counted.
  const STUDIO_PUBLIC_ROUTE = /^\/api\/studio\/(?:(?:videos|projects)\/[^/]+(?:\/view|\/cta-click|\/embed)|analytics\/track)$/;

  // Public interview session share links — no auth required.
  const INTERVIEW_PUBLIC_ROUTE = /^\/api\/interview\/public\/[^/]+$/;

  // Public gamification catalog + badge showcase — surfaces on the
  // /rewards article so anonymous visitors can see what they could
  // earn. Per-user reads (/me, /activity, /redemptions) stay private.
  const POINTS_PUBLIC_ROUTE = /^\/api\/points\/(?:catalog|badges)(?:$|\?)/;

  // Predictive-assessments catalog (Big Five, Cognitive, EQ, DISC, etc.)
  // is shown on the /tools/predictive-assessments page before the visitor
  // signs in — the kind picker needs to render for anonymous traffic so
  // the page doesn't 401-blank on first paint. Per-kind questions, run
  // start/respond/complete, history, and resume-match stay auth-gated
  // (and tier-gated) inside the handlers.
  const PREDICTIVE_ASSESSMENTS_PUBLIC_ROUTE =
    /^\/api\/predictive-assessments\/kinds(?:$|\?)/;

  // Public invite preview for async-interview magic links — candidate
  // visits /interview/:token before they've logged in / signed up.
  // /claim/:token still requires auth.
  const INTERVIEW_ASSIGNMENT_PUBLIC_ROUTE =
    /^\/api\/interview-assignments\/invite\/[^/]+$/;

  // Public live-screening invite endpoints — candidate visits the magic
  // link from their invite email to view slot details and accept/decline.
  // Token is unguessable (32-byte random) so it's safe to leave unauth.
  const LIVE_SCREEN_PUBLIC_ROUTE =
    /^\/api\/live-screen\/invites\/[^/]+(?:\/respond)?$/;

  // Email-integration OAuth start + callback. These are top-level browser
  // navigations (consent screen redirect) so they can't carry an
  // Authorization header. The route reads the user id from a short-lived
  // `link_token` JWT in the query string (same pattern as /api/auth/oauth);
  // the callback authenticates via the HMAC-signed `state` it issued. The
  // rest of /api/integrations/email/* (accounts CRUD, rules, sync) stays
  // behind authMiddleware.
  // #1460 — SCORM SCO iframes load assets without our JWT (they're
  // launched from the learner page via plain <iframe src>), so the
  // GET proxy at /api/courses/scorm-asset/<userId>/<pkgId>/<path>
  // must skip every auth gate. Same public-read model as the R2 CDN
  // it replaces. The handler validates userId/pkgId/path shape.
  const COURSES_SCORM_ASSET_ROUTE =
    /^\/api\/courses\/scorm-asset\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/.+$/i;

  const EMAIL_OAUTH_PUBLIC_ROUTE =
    /^\/api\/integrations\/email\/(?:gmail|outlook)\/(?:connect|callback)(?:$|\?|\/)/;

  // Seat-invite details preview — the invitee opens the accept page from
  // their email link before signing in. Keyed by the 24-byte random token
  // (same unguessable-bearer model as the live-screen invite above), so the
  // GET is safe to leave public; the POST /accept-invitation that actually
  // binds membership stays authenticated + email-matched (gap #1674).
  const ACCOUNT_INVITE_PUBLIC_ROUTE =
    /^\/api\/account\/invitation\/by-token\/[^/]+$/;

  // GET /api/resumes/:id (uuid or slug) — detail lookup. Route handler decides
  // access (owner OR public). Sub-routes like /export, /metadata, /diff, and
  // the POST/PUT/DELETE verbs stay behind full auth. Negative lookahead
  // excludes known sub-route names so they keep their existing auth behavior.
  const PUBLIC_RESUME_DETAIL_ROUTE =
    /^\/api\/resumes\/(?!public(?:$|\/)|embedded(?:$|\/)|getresumesownedbyauthuser(?:$|\/)|withownership(?:$|\/)|mastergroups(?:$|\/)|validateslug(?:$|\/)|save(?:$|\/)|parse(?:$|\/)|createfromfile(?:$|\/)|discover(?:$|\/)|tailor(?:$|\/)|embed(?:$|\/)|upload-file(?:$|\/)|track(?:$|\/)|clone(?:$|\/)|merge(?:$|\/)|stats(?:$|\/)|slug(?:$|\/))[^/]+\/?(?:$|\?)/;

  // /api/locations/* GETs are reference-data (countries / states / cities /
  // sitemap / resolve / search / reverse / entity-tag reads) consumed by
  // anonymous landing pages, the public sitemap, the signup LocationPicker,
  // and Googlebot. POST /entities/:kind/:id (entity-tag writes) stays
  // authenticated via the default branch — the handler's own owner check
  // enforces per-entity authorization.
  const LOCATIONS_REFERENCE_ROUTE = /^\/api\/locations(?:$|\/)/;

  // ─── Single source of truth: access mode per request ────────────────
  // Replaces the three parallel exemption lists that previously sat in
  // front of authMiddleware / emailVerifiedMiddleware / passwordChange-
  // Middleware. Adding a new public route is now one branch here instead
  // of three duplicated `if (X.test(path))` lines.
  //
  // - "public"          → all three gates skip; no c.var.user attached
  // - "optional-auth"   → auth attaches user IFF a JWT is present, but
  //                       missing/invalid is not an error; downstream
  //                       gates skip (handler enforces privacy)
  // - "authenticated"   → auth required; downstream gates fire unless a
  //                       per-gate carve-out applies (EMAIL_VERIFY_EXEMPT,
  //                       PASSWORD_CHANGE_EXEMPT)
  type AccessMode = "public" | "optional-auth" | "authenticated";

  function resolveAccessMode(path: string, method: string): AccessMode {
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return "public";
    if (INTERVIEW_PUBLIC_ROUTE.test(path)) return "public";
    if (INTERVIEW_ASSIGNMENT_PUBLIC_ROUTE.test(path)) return "public";
    if (LIVE_SCREEN_PUBLIC_ROUTE.test(path)) return "public";
    if (POINTS_PUBLIC_ROUTE.test(path)) return "public";
    if (PREDICTIVE_ASSESSMENTS_PUBLIC_ROUTE.test(path)) return "public";
    if (EMAIL_OAUTH_PUBLIC_ROUTE.test(path)) return "public";
    if (ACCOUNT_INVITE_PUBLIC_ROUTE.test(path)) return "public";
    if (COURSES_SCORM_ASSET_ROUTE.test(path)) return "public";

    if (STUDIO_PUBLIC_ROUTE.test(path)) return "optional-auth";
    if (OPTIONAL_AUTH_PUBLIC_ROUTE.test(path)) return "optional-auth";
    if (
      method === "GET" &&
      (USER_PROFILE_ROUTE.test(path) ||
        PUBLIC_LISTING_ROUTE.test(path) ||
        ADS_CONFIG_ROUTE.test(path) ||
        PUBLIC_RESUME_DETAIL_ROUTE.test(path) ||
        LOCATIONS_REFERENCE_ROUTE.test(path))
    ) {
      return "optional-auth";
    }

    return "authenticated";
  }

  // ── Auth layer ──────────────────────────────────────────────────────
  app.use("/api/*", async (c, next) => {
    const mode = resolveAccessMode(c.req.path, c.req.method);
    if (mode === "public") return next();
    if (mode === "optional-auth") return optionalAuthMiddleware(c as any, next);
    return authMiddleware(c as any, next);
  });

  // ── Email-verify layer ──────────────────────────────────────────────
  // Authenticated-but-unverified users can still hit auth routes
  // (manage their verification status), password management (reset
  // password via OTP), and security settings (set up 2FA before
  // verifying email). All three are NOT in PUBLIC_PREFIXES because
  // they need a JWT — they just shouldn't be gated on email status.
  const EMAIL_VERIFY_EXEMPT = ["/api/passwordmanagement", "/api/settings/security"];
  app.use("/api/*", async (c, next) => {
    const mode = resolveAccessMode(c.req.path, c.req.method);
    if (mode !== "authenticated") return next();
    if (EMAIL_VERIFY_EXEMPT.some((p) => c.req.path.startsWith(p))) return next();
    return emailVerifiedMiddleware(c as any, next);
  });

  // ── Password-change layer ───────────────────────────────────────────
  // Users with mustChangePassword=true are funnelled through the
  // password-management surface — same exemption rationale as above.
  const PASSWORD_CHANGE_EXEMPT = ["/api/passwordmanagement"];
  app.use("/api/*", async (c, next) => {
    const mode = resolveAccessMode(c.req.path, c.req.method);
    if (mode !== "authenticated") return next();
    if (PASSWORD_CHANGE_EXEMPT.some((p) => c.req.path.startsWith(p))) return next();
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
  app.route("/api/security", securityRoutes);
  app.route("/api/admin/security", adminSecurityRoutes);
  app.route("/api/errors", errorsRoutes);
  app.route("/api/_meta", metaRoutes);
  app.route("/api/extension", extensionRoutes);
  app.route("/api/account", accountRoutes);
  app.route("/api/workforce", workforceRoutes);
  app.route("/api/users", userRoutes);
  // Hono sub-router root path workaround: sub-router handlers registered at "/"
  // are never matched when mounted via app.route(prefix, router). Register explicitly.
  app.get("/api/resumes", listResumesHandler);
  app.get("/api/resumes/", listResumesHandler);
  app.post("/api/resumes", createResumeHandler);
  app.post("/api/resumes/", createResumeHandler);
  app.route("/api/resumes", resumeRoutes);
  app.route("/api/vendor-sync", vendorSyncRoutes);
  app.route("/api/resume", resumeRoastRoutes); // roast must be before catch-all in resumeRoutes
  app.route("/api/resume", resumeRoutes); // legacy resume endpoints
  app.route("/api/resumescorer", resumeScorerRoutes);
  app.route("/api/resumeoptimizer", resumeOptimizerRoutes);
  // #376 — canonical alias surface. Both routes proxy the same
  // `services/resume/analyze.ts` engine; mount them under a single
  // `/api/resume-analysis` namespace so frontend + Chrome extension
  // can migrate without `?surface=` query gymnastics. Legacy paths
  // stay live for SEO continuity (different funnel pages) and existing
  // tool-run history rows until the 410 sweep.
  app.route("/api/resume-analysis/score", resumeScorerRoutes);
  app.route("/api/resume-analysis/optimize", resumeOptimizerRoutes);
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
  // Company embedding (toggle + keys + snippet) — mounted BEFORE the
  // /api/companies catch-all so the :companyId/embed sub-routes match.
  app.route("/api/companies/:companyId/embed", companyEmbedRoutes);
  app.route("/api/companies", companyRoutes);
  // Embed runtime: key-authed data API (/api/embed/v1/*) + public loader +
  // iframe frame assets (/embed/v1/*). Makes a pasted snippet actually render.
  app.route("/api/embed", embedApiRoutes);
  app.route("/embed", embedAssetRoutes);
  app.route("/api/reviews", reviewRoutes);
  app.route("/api/boosts", boostRoutes);
  app.route("/api/taxonomies", taxonomyRoutes);
  app.route("/api/recruiter", recruiterRoutes);
  app.route("/api/recruiter/live-screen", liveScreenRecruiterRoutes);
  app.route("/api/live-screen", liveScreenPublicRoutes);
  app.route("/api/match", matchRoutes);
  app.route("/api/messages", messageRoutes);
  app.route("/api/chat", messageRoutes); // legacy AI chat endpoint alias
  app.route("/api/feed", feedRoutes);
  app.route("/api/notifications", notificationRoutes);
  app.route("/api/inbox", inboxRoutes);
  app.route("/api/integrations/email", emailIntegrationRoutes);
  app.route("/api/dashboard", dashboardRoutes);
  app.route("/api/userdashboard", dashboardRoutes); // legacy dashboard alias
  app.route("/api/search", searchRoutes);
  app.route("/api/billing", billingRoutes);
  app.route("/api/affiliate", affiliateRoutes); // legacy singular endpoint alias
  app.route("/api/payment", paymentRoutes);
  app.route("/api/payouts", payoutRoutes);
  app.route("/api/outplacement", outplacementRoutes);
  app.route("/api/boost-checkout", boostCheckoutRoutes);
  app.route("/api/course-checkout", courseCheckoutRoutes);
  app.route("/api/admin/tax-reporting", taxReportingRoutes);
  app.route("/api/recruiter-bd", recruiterBdRoutes);
  app.route("/api/gigs", gigsRoutes);
  app.route("/api/template-extractor", templateExtractorRoutes);
  app.route("/api/admin/templates-review", adminTemplatesReviewRoutes);
  app.route("/api/photoreal-avatar", photorealAvatarRoutes);
  app.route("/api/jobs-analytics", jobAnalyticsRoutes);
  app.route("/api/admin/ai-cost-reconciliation", aiCostReconciliationRoutes);
  app.route("/api/featured-creators", featuredCreatorsRoutes);
  app.route("/api/artifact-metrics", artifactMetricsRoutes);
  app.route("/api/reports", contentReportsRoutes);
  app.route("/api/take-home-invites", takeHomeInvitesRoutes);
  app.route("/api/affiliates", affiliateRoutes);
  app.route("/api/marketing", marketingRoutes);
  app.route("/api/settings", settingsRoutes);
  app.route("/api/export", settingsRoutes); // legacy export alias — /api/export/csv maps to /api/settings/export/csv
  app.route("/api/featureflag", featureFlagRoutes);
  app.route("/api/bootstrap", bootstrapRoutes);
  app.route("/api/task", taskRoutes);
  app.route("/api/points", pointsRoutes);
  app.route("/api/upload", uploadRoutes);
  app.route("/api/communication", communicationRoutes);
  app.route("/api/ai", aiRoutes);
  // MCP tools/call execution (gap #1620) dispatches via Hono's `app.request()`
  // to re-enter the same router without going through fetch / consuming a
  // subrequest. Make the app instance available to the MCP route via c.var.
  // The Variables type doesn't list "app" (MCP is the only consumer) so we
  // cast at the set + get sites.
  app.use("/api/mcp/*", (c, next) => {
    (c.set as (key: string, value: unknown) => void)("app", app);
    return next();
  });
  app.route("/api/mcp", mcpRoutes);
  app.route("/api/profile-audit", profileAuditRoutes);
  app.route("/api/career360", career360Routes);
  app.route("/api/profile", profileRoutes);
  app.route("/api/channels", channelRoutes);
  app.route("/api/locations", locationRoutes);
  app.route("/api/content-audiences", contentAudienceRoutes);
  app.route("/api/retained-search", retainedSearchRoutes);
  app.route("/api/references", referenceRoutes);
  app.route("/api/network", networkRoutes);
  app.route("/api/passwordmanagement", passwordManagementRoutes);
  // SuperAdmin management portal — impersonation sessions, user management, modules, audit
  // Must be mounted BEFORE /api/admin to avoid the admin catch-all intercepting these routes.
  app.route("/api/admin/impersonate", superadminRoutes);
  app.route("/api/admin/r2", adminR2Routes);
  app.route("/api/admin/workers", adminWorkerRoutes);
  app.route("/api/admin/courses", adminCourseRoutes);
  // Same rule as above: every "/api/admin/<sub>" router must be mounted BEFORE
  // the "/api/admin" catch-all (adminRoutes ends with `.all("*")` returning
  // "Admin route not found"), or Hono's registration-order matching lets that
  // catch-all intercept the sub-route. (#1701 — admin article queue 404.)
  app.route("/api/admin/job-sources", jobScraperAdminRoutes);
  app.route("/api/admin/articles", adminArticleRoutes);
  app.route("/api/admin/reports", adminReportRoutes);
  app.route("/api/admin/community-resources", adminCommunityResourceRoutes);
  app.route("/api/lms-oauth", lmsOauthRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/productdashboard", adminRoutes); // legacy admin stats alias
  app.route("/api/studio", studioRoutes);
  app.route("/api/studio", studioFeaturesRoutes);
  app.route("/api/games", gamesRoutes);
  app.route("/api/studio/game-agent", gameAgentRoutes);
  app.route("/api/studio", studioTemplatesRoutes);
  app.route("/api/studio", studioDubbingRoutes);
  app.route("/api/studio", linkedInPostRoutes);
  app.route("/api/nle", nleRoutes);
  app.route("/api", workspaceRoutes);
  app.route("/api/og", ogRoutes);
  app.route("/api/youtube", youtubeRoutes);
  app.route("/api/salaryanalyzer", salaryRoutes);
  app.route("/api/salarycalculator", salaryRoutes);
  app.route("/api/valueproposition", valuePropositionRoutes);
  app.route("/api/hubs", hubsRoutes);
  app.route("/api/interview", interviewRoutes);
  app.route("/api/interview-assignments", interviewAssignmentRoutes);
  app.route("/api/interview-question-sets", interviewQuestionSetRoutes);
  app.route("/api/video-pitch", videoPitchRoutes);
  app.route("/api/scorecards", scorecardRoutes);
  app.route("/api/calibration", calibrationRoutes);
  app.route("/api/public/take-home", takeHomePublicRoutes);
  app.route("/api/apply-button", applyButtonRoutes);
  app.route("/api/ads", adsRoutes);
  app.route("/api/apikeys", apiKeyRoutes);
  app.route("/api/lists", listsRoutes);
  app.route("/api/followups", followUpRoutes);
  app.route("/api/hiring", hiringOnboardingRoutes);
  app.route("/api/performance", performanceRoutes);
  // CHRO People Operations (#hired-video-extraction). Every route runs
  // behind peopleOpsContext (segment resolution + paid gate); see
  // routes/people.ts + specs/hired-video.
  app.route("/api/people", peopleRoutes);
  app.route("/api/calendar", calendarRoutes);
  app.route("/api/events", eventRoutes);
  app.route("/api/coffee", coffeeRoutes);
  app.route("/api/map", mapRoutes);
  app.route("/api/boards", exclusiveBoardRoutes);
  app.route("/api/community", communityRoutes);
  app.route("/api/analytics", analyticsRoutes);
  app.route("/api/job-sources", jobScraperUserRoutes);
  app.route("/api/ats", atsRoutes);
  app.route("/api/recruit", candidatesRoutes);
  app.route("/api/recruit/pitch-decks", pitchDeckRoutes);
  app.route("/api/public/candidate-resume", candidateResumePublicRoutes);
  app.route("/api/public/pitch-deck", pitchDeckPublicRoutes);
  app.route("/api/assessments", assessmentRoutes);
  app.route("/api/predictive-assessments", predictiveAssessmentRoutes);
  app.route("/api/audit", userAuditRoutes);
  app.route("/api/recruiter/hiring-insights", hiringInsightsRoutes);
  app.route("/api/graph", graphRoutes);
  app.route("/api/chat/socket", chatSocketRoutes);
  app.route("/api/games", gameSocketRoutes);
  app.route("/api/auto-apply", autoApplyRoutes);
  app.route("/api/autofill", autofillRoutes);
  app.route("/api/discovery", discoveryRoutes);
  app.route("/api/whitelabel", whitelabelRoutes);
  app.route("/api/services", serviceRoutes);
  app.route("/api/creators", creatorRoutes);
  app.route("/api/articles", articleRoutes);
  app.route("/api/reports", reportRoutes);
  app.route("/api/community-resources", communityResourceRoutes);
  app.route("/api/courses", courseRoutes);
  // Authoring helpers (#162 AI generator, #200 LMS connectors, etc.)
  // mount under the same prefix so the client never has to learn a
  // second course namespace. Order matters — must follow the catch-all-
  // free courseRoutes registration above, and the authoring router
  // defines no overlapping literal paths.
  app.route("/api/courses", courseAuthoringRoutes);
  app.route("/api/learning-paths", learningPathRoutes);
  app.route("/api/verify", verifyRoutes);
  app.route("/api/legal", legalRoutes);
  app.route("/api/advertising", advertisingRoutes);
  // #169 — Campaign $ redemption store. Read-only balance + tx surface
  // for the redemption UI; debit happens server-side from boosts.ts.
  app.route("/api/campaign-dollars", campaignDollarsRoutes);
  app.route("/api/paid-media", paidMediaRoutes);
  app.route("/api/career", careerRoutes);
  app.route("/api/phone", phoneRoutes);
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

    let reply = "Thanks for your interest in hired.video! We help job seekers land their dream role faster with AI-powered video resumes, career coaching, and direct connections to recruiters. Sign up free to get started — no credit card required.";

    if (hasAnyLLMProviderKey(c.env as any)) {
      try {
        // Visitor chat is unauthenticated — LLMClient sees user=null, so
        // it skips the budget gate AND skips the ledger charge. Path is
        // identical to every other AI call site.
        const llm = createLLMClient(c.env as any, (c as any).var?.user ?? null);
        const { content } = await llm.callText("visitor_chat", {
          useCase: "chat",
          systemPrompt: VISITOR_SYSTEM_PROMPT,
          userMessage: message,
        });
        reply = content;
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
    const origin = c.req.header("origin");
    if (origin) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Vary", "Origin");
    }
    // Token-quota exceeded — surface as 429 with the budget summary so
    // the frontend can show the upgrade prompt. Bubbled up automatically
    // from any route that uses `LLMClient`; no per-route handling needed.
    if (err instanceof TokenBudgetExceededError) {
      return buildTokenBudgetExceededResponse(c as any, err.summary);
    }
    logger.error("unhandled request error", {
      message: err.message,
      path: c.req.path,
      method: c.req.method,
    });
    return globalErrorHandler(err, c);
  });

  return app;
}

