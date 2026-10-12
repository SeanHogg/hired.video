import { Hono } from "hono";
import type { Context } from "hono";
import { lazyRoute, type RouteLoader } from "./lib/lazy-route.js";
import { cors } from "hono/cors";
import { TIER_NAME } from "../../shared/tier-copy.js";
import { PRO_MONTHLY_PRICE } from "../../shared/pricing.js";
import { authMiddleware, optionalAuthMiddleware } from "./middleware/auth.js";
import { emailVerifiedMiddleware } from "./middleware/emailVerified.js";
import { passwordChangeMiddleware } from "./middleware/passwordChange.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import { rateLimiterMiddleware } from "./middleware/rateLimiter.js";
import { requestLoggerMiddleware } from "./middleware/requestLogger.js";
import { getRelease } from "./utils/release.js";
import type { Variables } from "./types/index.js";
import { errorSourceFilterMiddleware } from "./middleware/errorSourceFilter.js";
import { getDb, schema } from "./db/index.js";

import { clickIdCaptureMiddleware } from "./middleware/clickIdCapture.js";
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
  // Route modules load on first request, not at isolate start — see
  // lib/lazy-route.ts (Worker startup CPU cap, gap #2339).
  const mount = (prefix: string, load: RouteLoader) => lazyRoute(app, prefix, load);

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
    // Inbound social webhooks (#2048): authenticated by each network's signature, not a JWT.
    "/api/social/webhooks",
    "/api/auth/magic-link",
    "/api/errors/report",
    // Opened straight from a recipient's email client (no JWT): the open-
    // tracking pixel, the signed click redirect, one-click unsubscribe, and the
    // token-keyed preference
    // center. The authenticated SuperAdmin manager (/api/admin/campaigns) and
    // the Settings panel (/api/email/preferences/me) are NOT matched by these
    // prefixes and stay authenticated.
    "/api/campaigns/open",
    "/api/campaigns/click",
    "/api/email/unsubscribe",
    "/api/email/preferences/token",
    "/api/email/webhooks",
    // Conformant xAPI 1.0.3 LRS — external tools authenticate with an
    // LRS-specific Basic-auth credential (lrs_credentials), NOT a hired.video
    // JWT, so the whole surface bypasses the platform auth layer. Same posture
    // as /api/partner. NOTE: the AUTHENTICATED credential-manager lives at
    // /api/learning/lrs-credentials and is deliberately NOT matched here.
    "/api/xapi",
    // Geo-IP surface for the dynamic Privacy / Terms / Cookie pages
    // and any other surface that needs the visitor's country before
    // they've signed in.
    "/api/_meta/geo",
    // Real aggregate social-proof counts for the marketing pages.
    "/api/proof/stats",
    // Chrome extension telemetry — the optionalAuthMiddleware attaches
    // the user if a JWT is present, but signed-out captures are accepted
    // too (most valuable when detection fails on the LinkedIn signed-out
    // public preview layout).
    "/api/extension/sessions",
    "/api/chat/visitor",
    "/api/search/public",
    "/api/retained-search/firms",
    "/api/references/shared/",
    "/api/references/public/",
    "/api/jobs/public",
    "/api/companies/public",
    "/api/resume/public",
    "/api/studio/videos/public",
    // The theme picker's events (no personal data; signed-out video makers too).
    "/api/theme-calendar/events",
    "/api/studio/videos/resume",
    "/api/studio/videos/user",
    "/api/studio/videos/featured",
    "/api/studio/public",
    // Page → video embeds (#1860/#1863). <MarketingPageVideo> mounts
    // app-wide in AppShell and fires `/paths` (cached membership set) on
    // every route — incl. anonymous marketing/homepage visitors — then
    // `/resolve` only on a hit. Both handlers read zero user-scoped data.
    // The SuperAdmin management surface (GET/POST/DELETE on the bare
    // `/api/studio/page-embeds`) is NOT matched by these longer prefixes,
    // so it stays authenticated + SuperAdmin-gated.
    "/api/studio/page-embeds/paths",
    "/api/studio/page-embeds/resolve",
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
    "/api/bookings/public",
    "/api/bookings/r",
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
    // Social connection OAuth callbacks — top-level browser navigations that
    // ride the signed `state` (no Authorization header survives the consent
    // redirect). The platform + lane + owner are inside the signed state; a
    // managed-scope state can only have been minted by the SA-gated auth-url.
    "/api/social/oauth/callback",
    "/api/admin/social/oauth/callback",
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
    // Partner system-to-system API (SDK). Authenticated by a partner API key
    // in partnerAuthMiddleware, not a user session — same posture as the embed
    // data API. The `/v1` suffix keeps this from also matching the
    // user-authenticated `/api/partner-consent/*` surface.
    "/api/partner/v1",
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
    // One-tap pause from the posting-agent digest email (HMAC token, no JWT).
    "/api/distribution/posting-agent/pause-link",
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
  // `projects/<id>/engagement/public` (forms, chapters, thumbnails of a
  // public project) and `forms/<id>/submit` serve signed-out viewers of the
  // playback overlay (#1586); both handlers gate on the project being public.
  const STUDIO_PUBLIC_ROUTE = /^\/api\/studio\/(?:(?:videos|projects)\/[^/]+(?:\/view|\/cta-click|\/embed)|projects\/[^/]+\/engagement\/public|forms\/[^/]+\/submit|analytics\/track)$/;

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

  // Studio collaboration WebSocket upgrade (gap #2243). A browser
  // `WebSocket` can't send an Authorization header, so this upgrade can't
  // pass the Bearer-header authMiddleware. The route
  // ([studio-socket.ts](./routes/studio-socket.ts)) is its OWN auth gate —
  // it verifies the `?access_token=` JWT and enforces `canActFor` against
  // the project owner — so it's safe to bypass the global auth layer here.
  const STUDIO_COLLAB_SOCKET_ROUTE = /^\/api\/studio\/[^/]+\/collab-socket$/;

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

  // Public events discovery (free product — see routes/events.ts). Anonymous
  // visitors browse the events surface: GET / (search public events), GET
  // /categories, GET /slug/:slug, GET /:id (single event, gated on visibility
  // by the handler). All four use optional auth so the handler can resolve
  // viewer-specific visibility / RSVP state when a JWT is present. Deeper
  // GETs (/:id/attendees, /:id/matches, /:id/analytics, /:id/attendees/export.csv)
  // and all writes stay authenticated via the default branch — they're not
  // single-segment so this regex doesn't match them. /mine is single-segment
  // and matches, but its handler 401s anonymous callers itself, which is the
  // intended behavior.
  const EVENTS_PUBLIC_ROUTE = /^\/api\/events(?:\/(?:slug\/[^/]+|[^/]+))?(?:$|\?)/;

  // Candidate-screening portal: a candidate opens the magic link from their
  // invite email at /api/public/screening/:token before (or without) signing
  // in. Optional auth — the token in the path is the access grant, but a
  // present JWT lets the handler bind the request to the signed-in user and
  // pull already-on-file items (pull-don't-ask). GET (portal view), POST
  // /claim (binds the user — 401s itself when anonymous), and POST
  // /items/:id/satisfy all share this mode. NOT in PUBLIC_PREFIXES on purpose:
  // a "public" classification would never attach the user, breaking the bind.
  const SCREENING_PORTAL_ROUTE = /^\/api\/public\/screening(?:\/|$)/;

  // Resume-feedback share link: a peer/coach opens GET /api/resume-feedback/link/:token
  // before (or without) signing in. Optional auth so the handler can claim the
  // link for an authenticated visitor; the share token is the access grant.
  // All other resume-feedback routes stay authenticated via the default branch.
  const RESUME_FEEDBACK_LINK_ROUTE = /^\/api\/resume-feedback\/link\/[^/]+(?:$|\?)/;

  // Any resume-feedback request carrying a `?token=` is a reviewer acting via
  // their unguessable share link — the token IS the access grant, so an
  // UNauthenticated peer can read the review and leave feedback without an
  // account (the explicit "email lets a guest give feedback, no sign-up"
  // requirement). Escalated to optional-auth in the auth layer below (a JWT
  // still attaches if present so an authed visitor claims the link). The
  // service re-validates the token against the review on every call.
  const RESUME_FEEDBACK_ROUTE = /^\/api\/resume-feedback(?:\/|$)/;

  // Reviews are public-read: the polymorphic reviews router documents its
  // list (`/:subjectType/:subjectId`), aggregate, and threaded comments
  // GETs as public, and those handlers never read c.var.user. Without a
  // carve-out they fell through to authMiddleware and 401'd anonymous
  // visitors (e.g. a logged-out shopper browsing a course's reviews).
  // Route through optional auth so a present JWT is still attached — the
  // `/me` GET resolves the caller's own review and 401s itself when
  // anonymous. GET-only: every write (POST/PUT/DELETE) stays authenticated
  // via the default branch.
  const REVIEWS_PUBLIC_ROUTE = /^\/api\/reviews(?:\/|$)/;

  // Usage tracking ingestion (#2044) — anon visitors AND authed users both
  // beacon here; optional-auth attaches the user when a JWT is present so the
  // session links to user_id, retaining the pre-signup journey.
  const USAGE_TRACK_ROUTE = /^\/api\/usage\/track$/;

  // Client analytics beacons — feature events, ad impressions, artifact views.
  // Signed-out viewers must be accepted (the artifact beacon 401'd every
  // anonymous view while it was missing from the public list), and a JWT, when
  // present, must attach so the row carries the viewer: these were "public",
  // which never runs auth, so every beacon row had a null user.
  const ANALYTICS_BEACON_ROUTE = /^\/api\/analytics\/(?:beacon|ads\/impression|artifacts\/beacon)$/;

  // Context-aware help meta reads (#2001) — GET /contexts, /resolve, /search
  // serve mapping + search META only (never content) and the handlers never
  // read c.var.user. The HelpDrawer renders for anonymous visitors on public
  // pages, so without this carve-out the global authMiddleware 401'd them
  // before the handler ran. GET-only: SuperAdmin curation (/mappings,
  // /reindex) stays authenticated via the default branch and is excluded by
  // the explicit slug alternation here.
  const HELP_PUBLIC_READ_ROUTE = /^\/api\/help\/(?:contexts|resolve|search)(?:$|\?)/;

  // Help-first deflection in the AI Brain (#2232) — the Brain is now the single
  // assistant and answers FAQ-shaped questions from the bundled help docs even
  // for SIGNED-OUT visitors (a cheap, doc-grounded reply; no user data touched,
  // never escalates to premium without an account). optional-auth so a present
  // JWT still attaches (history/personalisation) but anonymous is allowed.
  // POST-only path; the full `/api/ai/chat` stays authenticated.
  const AI_HELP_ASSIST_ROUTE = /^\/api\/ai\/help-assist(?:$|\?)/;

  // Anonymous resume parse for the kit workspace — a signed-out visitor
  // uploads/pastes/describes themselves and sees their resume + video preview
  // before creating an account. Mirrors the /api/resume/roast loss-leader:
  // nothing is persisted, anon traffic is IP-capped by the route's own
  // limiter (routes/resumes.ts), and a present JWT still attaches so authed
  // users keep servicesProcessor metering. POST-only on the canonical
  // `/api/resumes/parse` path; the legacy `/api/resume/parse` mount stays
  // authenticated. `/revise` is the same workspace's chat ("make it punchier")
  // applied to that unsaved draft; `/extract-text` = the résumé tools' file read.
  const RESUME_PARSE_ROUTE = /^\/api\/resumes\/(?:parse|revise|extract-text)(?:$|\?)/;

  // Public mailboxes: the Contact form / ContactPanel (POST /contact) and
  // lead-magnet capture such as the Resume Roast (POST /leads). Signed-out
  // visitors are the main audience, so these are optional-auth (a present JWT
  // still attaches for role/prefill); the router IP-caps anonymous callers.
  // POST-only — the lead list + triage stay SuperAdmin-authenticated.
  const MARKETING_PUBLIC_WRITE_ROUTE = /^\/api\/marketing\/(?:contact|leads)(?:$|\?)/;

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
    if (STUDIO_COLLAB_SOCKET_ROUTE.test(path)) return "public";
    if (POINTS_PUBLIC_ROUTE.test(path)) return "public";
    if (PREDICTIVE_ASSESSMENTS_PUBLIC_ROUTE.test(path)) return "public";
    if (EMAIL_OAUTH_PUBLIC_ROUTE.test(path)) return "public";
    if (ACCOUNT_INVITE_PUBLIC_ROUTE.test(path)) return "public";
    if (COURSES_SCORM_ASSET_ROUTE.test(path)) return "public";
    if (method === "GET" && HELP_PUBLIC_READ_ROUTE.test(path)) return "public";

    if (AI_HELP_ASSIST_ROUTE.test(path)) return "optional-auth";
    // The Post dock lists postable networks before anyone signs in.
    if (method === "GET" && path === "/api/social/platforms") return "optional-auth";
    if (method === "POST" && RESUME_PARSE_ROUTE.test(path)) return "optional-auth";
    if (method === "POST" && MARKETING_PUBLIC_WRITE_ROUTE.test(path)) return "optional-auth";
    if (STUDIO_PUBLIC_ROUTE.test(path)) return "optional-auth";
    if (SCREENING_PORTAL_ROUTE.test(path)) return "optional-auth";
    if (USAGE_TRACK_ROUTE.test(path)) return "optional-auth";
    if (method === "POST" && ANALYTICS_BEACON_ROUTE.test(path)) return "optional-auth";
    if (OPTIONAL_AUTH_PUBLIC_ROUTE.test(path)) return "optional-auth";
    if (method === "GET" && RESUME_FEEDBACK_LINK_ROUTE.test(path)) return "optional-auth";
    if (
      method === "GET" &&
      (USER_PROFILE_ROUTE.test(path) ||
        PUBLIC_LISTING_ROUTE.test(path) ||
        ADS_CONFIG_ROUTE.test(path) ||
        PUBLIC_RESUME_DETAIL_ROUTE.test(path) ||
        LOCATIONS_REFERENCE_ROUTE.test(path) ||
        REVIEWS_PUBLIC_ROUTE.test(path) ||
        EVENTS_PUBLIC_ROUTE.test(path))
    ) {
      return "optional-auth";
    }

    return "authenticated";
  }

  // ── Auth layer ──────────────────────────────────────────────────────
  app.use("/api/*", async (c, next) => {
    let mode = resolveAccessMode(c.req.path, c.req.method);
    // Reviewer share-token writes: the unguessable token is the access grant,
    // so an unauthenticated peer can leave feedback. Escalate any token-bearing
    // resume-feedback request to optional-auth (attach a JWT if present, never
    // require one). `/link/:token` is already optional-auth above.
    if (
      mode === "authenticated" &&
      RESUME_FEEDBACK_ROUTE.test(c.req.path) &&
      c.req.query("token")
    ) {
      mode = "optional-auth";
    }
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
      return c.json({ status: "ok", release: getRelease(), timestamp: new Date().toISOString() });
    } catch (error: any) {
      return c.json(
        {
          status: "error",
          release: getRelease(),
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

  mount("/api/auth/passkey", () => import("./routes/passkeys.js").then((m) => m.passkeyRoutes));
  mount("/api/auth/oauth", () => import("./routes/oauth.js").then((m) => m.oauthRoutes));
  mount("/api/auth/guest", () => import("./routes/guest-auth.js").then((m) => m.guestAuthRoutes));
  mount("/api/auth", () => import("./routes/auth.js").then((m) => m.authRoutes));
  mount("/api/security", () => import("./routes/security.js").then((m) => m.securityRoutes));
  mount("/api/admin/security", () => import("./routes/adminSecurity.js").then((m) => m.adminSecurityRoutes));
  mount("/api/errors", () => import("./routes/errors.js").then((m) => m.errorsRoutes));
  mount("/api/_meta", () => import("./routes/meta.js").then((m) => m.metaRoutes));
  mount("/api/proof", () => import("./routes/proof.js").then((m) => m.proofRoutes));
  mount("/api/extension", () => import("./routes/extension.js").then((m) => m.extensionRoutes));
  mount("/api/account", () => import("./routes/account.js").then((m) => m.accountRoutes));
  mount("/api/workforce", () => import("./routes/workforce.js").then((m) => m.workforceRoutes));
  mount("/api/users", () => import("./routes/users.js").then((m) => m.userRoutes));
  // Hono sub-router root path workaround: sub-router handlers registered at "/"
  // are never matched when mounted via app.route(prefix, router). Register explicitly.
  // Handlers import routes/resumes.js on demand, like mount() (gap #2339).
  const listResumes = async (c: Context) => (await import("./routes/resumes.js")).listResumesHandler(c);
  const createResume = async (c: Context) => (await import("./routes/resumes.js")).createResumeHandler(c);
  app.get("/api/resumes", listResumes);
  app.get("/api/resumes/", listResumes);
  app.post("/api/resumes", createResume);
  app.post("/api/resumes/", createResume);
  mount("/api/resumes", () => import("./routes/resumes.js").then((m) => m.resumeRoutes));
  mount("/api/resume-versions", () => import("./routes/resume-versions.js").then((m) => m.resumeVersionRoutes)); // master / version lineage + create-from-a-job (the kit reviews)
  mount("/api/resume-feedback", () => import("./routes/resume-feedback.js").then((m) => m.resumeFeedbackRoutes)); // career coaching & resume feedback (#1939)
  mount("/api/vendor-sync", () => import("./routes/vendor-sync.js").then((m) => m.vendorSyncRoutes));
  mount("/api/resume", () => import("./routes/resume-roast.js").then((m) => m.resumeRoastRoutes)); // roast must be before catch-all in resumeRoutes
  mount("/api/resume", () => import("./routes/resumes.js").then((m) => m.resumeRoutes)); // legacy resume endpoints
  mount("/api/resumescorer", () => import("./routes/resume-scorer.js").then((m) => m.resumeScorerRoutes));
  mount("/api/resumeoptimizer", () => import("./routes/resume-optimizer.js").then((m) => m.resumeOptimizerRoutes));
  // #376 — canonical alias surface. Both routes proxy the same
  // `services/resume/analyze.ts` engine; mount them under a single
  // `/api/resume-analysis` namespace so frontend + Chrome extension
  // can migrate without `?surface=` query gymnastics. Legacy paths
  // stay live for SEO continuity (different funnel pages) and existing
  // tool-run history rows until the 410 sweep.
  mount("/api/resume-analysis/score", () => import("./routes/resume-scorer.js").then((m) => m.resumeScorerRoutes));
  mount("/api/resume-analysis/optimize", () => import("./routes/resume-optimizer.js").then((m) => m.resumeOptimizerRoutes));
  mount("/api/skillextractor", () => import("./routes/skill-extractor.js").then((m) => m.skillExtractorRoutes));
  mount("/api/tool-runs", () => import("./routes/tool-runs.js").then((m) => m.toolRunsRoutes));
  mount("/api/jobs/:jobId/pipeline/share", () => import("./routes/pipeline-share.js").then((m) => m.pipelineShareRoutes));
  mount("/api/jobs/:jobId/pipeline", () => import("./routes/jobpipeline.js").then((m) => m.jobPipelineRoutes));
  mount("/api/pipeline/public", () => import("./routes/pipeline-share.js").then((m) => m.pipelinePublicRoutes));
  // Cross-job kanban (#405). Mounted AFTER /api/pipeline/public so the more
  // specific public-share router keeps priority for `/api/pipeline/public/*`.
  mount("/api/pipeline", () => import("./routes/pipeline-all.js").then((m) => m.crossJobPipelineRoutes));
  mount("/api/recruiter/bulk-score", () => import("./routes/bulk-scoring.js").then((m) => m.bulkScoringRoutes));
  mount("/api/transcripts/search", () => import("./routes/transcript-search.js").then((m) => m.transcriptSearchRoutes));
  mount("/api/jobs/:jobId/sourcing-bids", () => import("./routes/sourcing-bids.js").then((m) => m.sourcingBidsByJobRoutes));
  mount("/api/sourcing", () => import("./routes/sourcing-bids.js").then((m) => m.sourcingBrowseRoutes));
  mount("/api/sourcing-bids", () => import("./routes/sourcing-bids.js").then((m) => m.sourcingBidActionRoutes));
  mount("/api/jobs", () => import("./routes/jobs.js").then((m) => m.jobRoutes));
  mount("/api/job", () => import("./routes/jobs.js").then((m) => m.jobRoutes)); // legacy singular endpoints (e.g., /api/Job)
  // Company embedding (toggle + keys + snippet) — mounted BEFORE the
  // /api/companies catch-all so the :companyId/embed sub-routes match.
  mount("/api/companies/:companyId/embed", () => import("./routes/company-embed.js").then((m) => m.companyEmbedRoutes));
  mount("/api/companies", () => import("./routes/companies.js").then((m) => m.companyRoutes));
  // Embed runtime: key-authed data API (/api/embed/v1/*) + public loader +
  // iframe frame assets (/embed/v1/*). Makes a pasted snippet actually render.
  mount("/api/embed", () => import("./routes/embed-runtime.js").then((m) => m.embedApiRoutes));
  mount("/embed", () => import("./routes/embed-runtime.js").then((m) => m.embedAssetRoutes));
  mount("/api/reviews", () => import("./routes/reviews.js").then((m) => m.reviewRoutes));
  mount("/api/boosts", () => import("./routes/boosts.js").then((m) => m.boostRoutes));
  mount("/api/taxonomies", () => import("./routes/taxonomies.js").then((m) => m.taxonomyRoutes));
  mount("/api/recruiter", () => import("./routes/recruiter.js").then((m) => m.recruiterRoutes));
  mount("/api/recruiter/live-screen", () => import("./routes/live-screen.js").then((m) => m.liveScreenRecruiterRoutes));
  mount("/api/live-screen", () => import("./routes/live-screen.js").then((m) => m.liveScreenPublicRoutes));
  mount("/api/match", () => import("./routes/match.js").then((m) => m.matchRoutes));
  mount("/api/messages", () => import("./routes/messages.js").then((m) => m.messageRoutes));
  mount("/api/chat", () => import("./routes/messages.js").then((m) => m.messageRoutes)); // legacy AI chat endpoint alias
  mount("/api/feed", () => import("./routes/feed.js").then((m) => m.feedRoutes));
  mount("/api/feed-features", () => import("./routes/feed-features.js").then((m) => m.feedFeatureRoutes)); // SA-curated dashboard feed (read)
  mount("/api/role-access", () => import("./routes/role-access.js").then((m) => m.roleAccessRoutes)); // per-role feature/nav manifest (read)
  mount("/api/usage", () => import("./routes/usage.js").then((m) => m.usageRoutes)); // usage tracking ingestion (optional-auth)
  mount("/api/notifications", () => import("./routes/notifications.js").then((m) => m.notificationRoutes));
  mount("/api/push", () => import("./routes/push.js").then((m) => m.pushRoutes)); // browser Web Push registration
  mount("/api/contacts", () => import("./routes/contacts.js").then((m) => m.contactRoutes)); // native contacts graph (0493)
  mount("/api/inbox", () => import("./routes/inbox.js").then((m) => m.inboxRoutes));
  mount("/api/integrations/email", () => import("./routes/email-integration.js").then((m) => m.emailIntegrationRoutes));
  mount("/api/integrations", () => import("./routes/integrations.js").then((m) => m.integrationsRoutes)); // generic vendor API-key registry (#261)
  mount("/api/dashboard", () => import("./routes/dashboard.js").then((m) => m.dashboardRoutes));
  mount("/api/userdashboard", () => import("./routes/dashboard.js").then((m) => m.dashboardRoutes)); // legacy dashboard alias
  mount("/api/search", () => import("./routes/search.js").then((m) => m.searchRoutes));
  mount("/api/help", () => import("./routes/help.js").then((m) => m.helpRoutes));
  mount("/api/billing", () => import("./routes/billing.js").then((m) => m.billingRoutes));
  mount("/api/affiliate", () => import("./routes/affiliates.js").then((m) => m.affiliateRoutes)); // legacy singular endpoint alias
  mount("/api/payment", () => import("./routes/payment.js").then((m) => m.paymentRoutes));
  mount("/api/payouts", () => import("./routes/payouts.js").then((m) => m.payoutRoutes));
  mount("/api/admin/payouts", () => import("./routes/admin-payouts.js").then((m) => m.adminPayoutRoutes));
  mount("/api/outplacement", () => import("./routes/outplacement.js").then((m) => m.outplacementRoutes));
  mount("/api/boost-checkout", () => import("./routes/boost-checkout.js").then((m) => m.boostCheckoutRoutes));
  mount("/api/course-checkout", () => import("./routes/course-checkout.js").then((m) => m.courseCheckoutRoutes));
  mount("/api/admin/tax-reporting", () => import("./routes/tax-reporting.js").then((m) => m.taxReportingRoutes));
  mount("/api/recruiter-bd", () => import("./routes/recruiter-bd.js").then((m) => m.recruiterBdRoutes));
  mount("/api/gigs", () => import("./routes/gigs.js").then((m) => m.gigsRoutes));
  mount("/api/template-extractor", () => import("./routes/template-extractor.js").then((m) => m.templateExtractorRoutes));
  mount("/api/admin/templates-review", () => import("./routes/admin-templates-review.js").then((m) => m.adminTemplatesReviewRoutes));
  mount("/api/photoreal-avatar", () => import("./routes/photoreal-avatar.js").then((m) => m.photorealAvatarRoutes));
  mount("/api/jobs-analytics", () => import("./routes/job-analytics.js").then((m) => m.jobAnalyticsRoutes));
  mount("/api/admin/ai-cost-reconciliation", () => import("./routes/ai-cost-reconciliation.js").then((m) => m.aiCostReconciliationRoutes));
  mount("/api/featured-creators", () => import("./routes/featured-creators.js").then((m) => m.featuredCreatorsRoutes));
  mount("/api/artifact-metrics", () => import("./routes/artifact-metrics.js").then((m) => m.artifactMetricsRoutes));
  mount("/api/take-home-invites", () => import("./routes/take-home-invites.js").then((m) => m.takeHomeInvitesRoutes));
  mount("/api/affiliates", () => import("./routes/affiliates.js").then((m) => m.affiliateRoutes));
  mount("/api/campaigns", () => import("./routes/campaigns-public.js").then((m) => m.campaignsPublicRoutes)); // public open-tracking pixel
  mount("/api/email", () => import("./routes/email-preferences.js").then((m) => m.emailPreferencesRoutes)); // marketing unsubscribe + preference center
  mount("/api/marketing", () => import("./routes/marketing.js").then((m) => m.marketingRoutes));
  mount("/api/settings", () => import("./routes/settings.js").then((m) => m.settingsRoutes));
  mount("/api/export", () => import("./routes/settings.js").then((m) => m.settingsRoutes)); // legacy export alias — /api/export/csv maps to /api/settings/export/csv
  mount("/api/featureflag", () => import("./routes/featureflag.js").then((m) => m.featureFlagRoutes));
  mount("/api/bootstrap", () => import("./routes/bootstrap.js").then((m) => m.bootstrapRoutes));
  mount("/api/task", () => import("./routes/task.js").then((m) => m.taskRoutes));
  mount("/api/activities", () => import("./routes/activities.js").then((m) => m.activityRoutes));
  mount("/api/points", () => import("./routes/points.js").then((m) => m.pointsRoutes));
  mount("/api/upload", () => import("./routes/upload.js").then((m) => m.uploadRoutes));
  // Remote images re-served same-origin for canvas rasterizing (document downloads).
  mount("/api/media", () => import("./routes/media-proxy.js").then((m) => m.mediaProxyRoutes));
  mount("/api/communication", () => import("./routes/communication.js").then((m) => m.communicationRoutes));
  mount("/api/ai", () => import("./routes/ai.js").then((m) => m.aiRoutes));
  // MCP tools/call execution (gap #1620) dispatches via Hono's `app.request()`
  // to re-enter the same router without going through fetch / consuming a
  // subrequest. Make the app instance available to the MCP route via c.var.
  // The Variables type doesn't list "app" (MCP is the only consumer) so we
  // cast at the set + get sites.
  app.use("/api/mcp/*", (c, next) => {
    (c.set as (key: string, value: unknown) => void)("app", app);
    return next();
  });
  mount("/api/mcp", () => import("./routes/mcp.js").then((m) => m.mcpRoutes));
  mount("/api/profile-audit", () => import("./routes/profile-audit.js").then((m) => m.profileAuditRoutes));
  mount("/api/career360", () => import("./routes/career360.js").then((m) => m.career360Routes));
  mount("/api/profile", () => import("./routes/profile.js").then((m) => m.profileRoutes));
  mount("/api/channels", () => import("./routes/channels.js").then((m) => m.channelRoutes));
  mount("/api/locations", () => import("./routes/locations.js").then((m) => m.locationRoutes));
  mount("/api/content-audiences", () => import("./routes/content-audiences.js").then((m) => m.contentAudienceRoutes));
  mount("/api/retained-search", () => import("./routes/retained-search.js").then((m) => m.retainedSearchRoutes));
  mount("/api/references", () => import("./routes/references.js").then((m) => m.referenceRoutes));
  mount("/api/network", () => import("./routes/network.js").then((m) => m.networkRoutes));
  mount("/api/passwordmanagement", () => import("./routes/password-management.js").then((m) => m.passwordManagementRoutes));
  // Partner platform (SDK). `/api/partner/v1` is key-authenticated (public
  // prefix); `/api/partner-consent` is the JOB SEEKER's JWT-gated approve/
  // revoke surface; `/api/admin/partners` is SuperAdmin key issuance.
  mount("/api/partner", () => import("./routes/partner.js").then((m) => m.partnerRoutes));
  mount("/api/partner-consent", () => import("./routes/partner-consent.js").then((m) => m.partnerConsentRoutes));
  mount("/api/partner-account", () => import("./routes/partner-account.js").then((m) => m.partnerAccountRoutes));
  mount("/api/admin/partners", () => import("./routes/admin-partners.js").then((m) => m.adminPartnerRoutes));
  // SuperAdmin management portal — impersonation sessions, user management, modules, audit
  // Must be mounted BEFORE /api/admin to avoid the admin catch-all intercepting these routes.
  mount("/api/admin/impersonate", () => import("./routes/superadmin/index.js").then((m) => m.superadminRoutes));
  mount("/api/admin/r2", () => import("./routes/admin-r2.js").then((m) => m.adminR2Routes));
  mount("/api/admin/workers", () => import("./routes/admin-workers.js").then((m) => m.adminWorkerRoutes));
  mount("/api/admin/courses", () => import("./routes/admin-courses.js").then((m) => m.adminCourseRoutes));
  // Same rule as above: every "/api/admin/<sub>" router must be mounted BEFORE
  // the "/api/admin" catch-all (adminRoutes ends with `.all("*")` returning
  // "Admin route not found"), or Hono's registration-order matching lets that
  // catch-all intercept the sub-route. (#1701 — admin article queue 404.)
  mount("/api/admin/job-sources", () => import("./routes/jobscraper.js").then((m) => m.jobScraperAdminRoutes));
  mount("/api/admin/articles", () => import("./routes/admin-articles.js").then((m) => m.adminArticleRoutes));
  mount("/api/admin/feed-features", () => import("./routes/admin-feed-features.js").then((m) => m.adminFeedFeatureRoutes)); // SA dashboard-feed curation
  mount("/api/admin/role-access", () => import("./routes/admin-role-access.js").then((m) => m.adminRoleAccessRoutes)); // SA per-role feature/nav access
  mount("/api/admin/usage", () => import("./routes/admin-usage.js").then((m) => m.adminUsageRoutes)); // SA presence + usage analytics
  mount("/api/admin/campaigns", () => import("./routes/admin-campaigns.js").then((m) => m.adminCampaignRoutes)); // SA email-campaign manager
  mount("/api/admin/reports", () => import("./routes/reports.js").then((m) => m.adminReportRoutes));
  mount("/api/admin/community-resources", () => import("./routes/community-resources.js").then((m) => m.adminCommunityResourceRoutes));
  mount("/api/lms-oauth", () => import("./routes/lms-oauth.js").then((m) => m.lmsOauthRoutes));
  mount("/api/admin/social", () => import("./routes/admin-social.js").then((m) => m.adminSocialRoutes)); // SA managed brand accounts (Lane A, layer 2)
  mount("/api/admin/promotions", () => import("./routes/admin-promotions.js").then((m) => m.adminPromotionRoutes)); // SA promotion queue (Lane A, #2046)
  mount("/api/admin/content-scans", () => import("./routes/admin-content-scans.js").then((m) => m.adminContentScanRoutes)); // SA review of the explicit-scan gate (mig 0505)
  mount("/api/admin/coupons", () => import("./routes/admin-coupons.js").then((m) => m.adminCouponRoutes)); // SA coupon codes (free month of Pro)
  mount("/api/admin/theme-calendar", () => import("./routes/theme-calendar.js").then((m) => m.adminThemeCalendarRoutes)); // SA theme calendar (#2350)
  mount("/api/admin", () => import("./routes/admin.js").then((m) => m.adminRoutes));
  mount("/api/productdashboard", () => import("./routes/admin.js").then((m) => m.adminRoutes)); // legacy admin stats alias
  mount("/api/studio", () => import("./routes/studio.js").then((m) => m.studioRoutes));
  mount("/api/studio", () => import("./routes/studio-social-publish.js").then((m) => m.studioSocialPublishRoutes)); // TikTok / Instagram / X / Facebook posts
  mount("/api/studio", () => import("./routes/studio-render-variants.js").then((m) => m.studioRenderVariantRoutes)); // fitted cuts per network preset (#2045)
  mount("/api/studio", () => import("./routes/studio-home-wall.js").then((m) => m.studioHomeWallRoutes)); // show / hide a video on the home page (#2354)
  mount("/api/studio", () => import("./routes/studio-content-scan.js").then((m) => m.studioContentScanRoutes)); // explicit-scan gate for the home wall: owner status + sampled frames (mig 0505)
  mount("/api/studio", () => import("./routes/studio-features.js").then((m) => m.studioFeaturesRoutes));
  mount("/api/games", () => import("./routes/games.js").then((m) => m.gamesRoutes));
  mount("/api/studio/game-agent", () => import("./routes/game-agent.js").then((m) => m.gameAgentRoutes));
  mount("/api/studio", () => import("./routes/studio-templates.js").then((m) => m.studioTemplatesRoutes));
  mount("/api/studio", () => import("./routes/studio-dubbing.js").then((m) => m.studioDubbingRoutes));
  mount("/api/studio", () => import("./routes/linkedin-post.js").then((m) => m.linkedInPostRoutes));
  mount("/api/nle", () => import("./routes/nle.js").then((m) => m.nleRoutes));
  mount("/api", () => import("./routes/workspaces.js").then((m) => m.workspaceRoutes));
  mount("/api/og", () => import("./routes/og.js").then((m) => m.ogRoutes));
  mount("/api/youtube", () => import("./routes/youtube.js").then((m) => m.youtubeRoutes));
  mount("/api/salaryanalyzer", () => import("./routes/salary.js").then((m) => m.salaryRoutes));
  mount("/api/salarycalculator", () => import("./routes/salary.js").then((m) => m.salaryRoutes));
  mount("/api/valueproposition", () => import("./routes/value-proposition.js").then((m) => m.valuePropositionRoutes));
  mount("/api/hubs", () => import("./routes/hubs.js").then((m) => m.hubsRoutes));
  mount("/api/interview", () => import("./routes/interview.js").then((m) => m.interviewRoutes));
  mount("/api/interview-assignments", () => import("./routes/interview-assignments.js").then((m) => m.interviewAssignmentRoutes));
  mount("/api/interview-question-sets", () => import("./routes/interview-question-sets.js").then((m) => m.interviewQuestionSetRoutes));
  mount("/api/video-pitch", () => import("./routes/video-pitch.js").then((m) => m.videoPitchRoutes));
  mount("/api/scorecards", () => import("./routes/scorecards.js").then((m) => m.scorecardRoutes));
  mount("/api/calibration", () => import("./routes/calibration.js").then((m) => m.calibrationRoutes));
  mount("/api/public/take-home", () => import("./routes/scorecards.js").then((m) => m.takeHomePublicRoutes));
  mount("/api/apply-button", () => import("./routes/apply-button.js").then((m) => m.applyButtonRoutes));
  mount("/api/ads", () => import("./routes/ads.js").then((m) => m.adsRoutes));
  mount("/api/apikeys", () => import("./routes/apikeys.js").then((m) => m.apiKeyRoutes));
  mount("/api/lists", () => import("./routes/lists.js").then((m) => m.listsRoutes));
  mount("/api/followups", () => import("./routes/followups.js").then((m) => m.followUpRoutes));
  mount("/api/hiring", () => import("./routes/onboarding-hiring.js").then((m) => m.hiringOnboardingRoutes));
  mount("/api/performance", () => import("./routes/performance.js").then((m) => m.performanceRoutes));
  // CHRO People Operations (#hired-video-extraction). Every route runs
  // behind peopleOpsContext (segment resolution + paid gate); see
  // routes/people.ts + specs/hired-video.
  mount("/api/people", () => import("./routes/people.js").then((m) => m.peopleRoutes));
  mount("/api/calendar", () => import("./routes/calendar.js").then((m) => m.calendarRoutes));
  mount("/api/events", () => import("./routes/events.js").then((m) => m.eventRoutes));
  mount("/api/coffee", () => import("./routes/coffee.js").then((m) => m.coffeeRoutes));
  mount("/api/map", () => import("./routes/map.js").then((m) => m.mapRoutes));
  mount("/api/boards", () => import("./routes/exclusive-boards.js").then((m) => m.exclusiveBoardRoutes));
  mount("/api/community", () => import("./routes/community.js").then((m) => m.communityRoutes));
  mount("/api/analytics", () => import("./routes/analytics.js").then((m) => m.analyticsRoutes));
  mount("/api/job-sources", () => import("./routes/jobscraper.js").then((m) => m.jobScraperUserRoutes));
  mount("/api/ats", () => import("./routes/ats.js").then((m) => m.atsRoutes));
  mount("/api/recruit", () => import("./routes/candidates.js").then((m) => m.candidatesRoutes));
  mount("/api/recruit/pitch-decks", () => import("./routes/pitch-decks.js").then((m) => m.pitchDeckRoutes));
  mount("/api/recruit/screening", () => import("./routes/screening.js").then((m) => m.screeningRoutes));
  mount("/api/public/candidate-resume", () => import("./routes/candidates.js").then((m) => m.candidateResumePublicRoutes));
  mount("/api/public/pitch-deck", () => import("./routes/pitch-decks.js").then((m) => m.pitchDeckPublicRoutes));
  mount("/api/public/screening", () => import("./routes/screening.js").then((m) => m.screeningPublicRoutes));
  mount("/api/assessments", () => import("./routes/assessments.js").then((m) => m.assessmentRoutes));
  mount("/api/predictive-assessments", () => import("./routes/predictive-assessments.js").then((m) => m.predictiveAssessmentRoutes));
  mount("/api/audit", () => import("./routes/user-audit.js").then((m) => m.userAuditRoutes));
  mount("/api/recruiter/hiring-insights", () => import("./routes/hiring-insights.js").then((m) => m.hiringInsightsRoutes));
  mount("/api/graph", () => import("./routes/graph.js").then((m) => m.graphRoutes));
  mount("/api/chat/socket", () => import("./routes/chat-socket.js").then((m) => m.chatSocketRoutes));
  mount("/api/games", () => import("./routes/game-socket.js").then((m) => m.gameSocketRoutes));
  // Real-time collaborative studio editing (gap #2243) — WS upgrade to the
  // StudioRoom DO. Dual-mounted at /api/studio (same pattern as the games
  // socket); self-authenticates via query-param JWT (browser WS can't send
  // a Bearer header), so it's in the STUDIO_COLLAB_SOCKET_ROUTE public
  // carve-out above.
  mount("/api/studio", () => import("./routes/studio-socket.js").then((m) => m.studioSocketRoutes));
  mount("/api/auto-apply", () => import("./routes/auto-apply.js").then((m) => m.autoApplyRoutes));
  mount("/api/autofill", () => import("./routes/autofill.js").then((m) => m.autofillRoutes));
  mount("/api/discovery", () => import("./routes/discovery.js").then((m) => m.discoveryRoutes));
  mount("/api/whitelabel", () => import("./routes/whitelabel.js").then((m) => m.whitelabelRoutes));
  mount("/api/services", () => import("./routes/services.js").then((m) => m.serviceRoutes));
  mount("/api/creators", () => import("./routes/creators.js").then((m) => m.creatorRoutes));
  mount("/api/bookings", () => import("./routes/bookings.js").then((m) => m.bookingsRoutes));
  mount("/api/articles", () => import("./routes/articles.js").then((m) => m.articleRoutes));
  mount("/api/reports", () => import("./routes/reports.js").then((m) => m.reportRoutes));
  mount("/api/community-resources", () => import("./routes/community-resources.js").then((m) => m.communityResourceRoutes));
  mount("/api/courses", () => import("./routes/courses.js").then((m) => m.courseRoutes));
  // Authoring helpers (#162 AI generator, #200 LMS connectors, etc.)
  // mount under the same prefix so the client never has to learn a
  // second course namespace. Order matters — must follow the catch-all-
  // free courseRoutes registration above, and the authoring router
  // defines no overlapping literal paths.
  mount("/api/courses", () => import("./routes/course-authoring.js").then((m) => m.courseAuthoringRoutes));
  mount("/api/learning-paths", () => import("./routes/learning-paths.js").then((m) => m.learningPathRoutes));
  mount("/api/cohorts", () => import("./routes/cohorts.js").then((m) => m.cohortRoutes));
  mount("/api/learning-goals", () => import("./routes/learning-goals.js").then((m) => m.learningGoalsRoutes));
  // LRS credential management + tenant portability are authenticated
  // (owner-scoped) — register them BEFORE the /api/learning learner router so
  // their concrete sub-paths win.
  mount("/api/learning/lrs-credentials", () => import("./routes/lrs-credentials.js").then((m) => m.lrsCredentialRoutes));
  mount("/api/learning/portability", () => import("./routes/learning-portability.js").then((m) => m.learningPortabilityRoutes));
  mount("/api/learning", () => import("./routes/learning.js").then((m) => m.learningRoutes));
  mount("/api/verify", () => import("./routes/verify.js").then((m) => m.verifyRoutes));
  // Conformant xAPI 1.0.3 LRS. In PUBLIC_PREFIXES (below) so the JWT layer
  // skips it — the surface authenticates with its own LRS Basic-auth credential.
  mount("/api/xapi", () => import("./routes/xapi-lrs.js").then((m) => m.xapiLrsRoutes));
  mount("/api/legal", () => import("./routes/legal.js").then((m) => m.legalRoutes));
  mount("/api/advertising", () => import("./routes/advertising.js").then((m) => m.advertisingRoutes));
  // #169 — Campaign $ redemption store. Read-only balance + tx surface
  // for the redemption UI; debit happens server-side from boosts.ts.
  mount("/api/campaign-dollars", () => import("./routes/campaign-dollars.js").then((m) => m.campaignDollarsRoutes));
  mount("/api/paid-media", () => import("./routes/paid-media.js").then((m) => m.paidMediaRoutes));
  mount("/api/social/webhooks", () => import("./routes/social-webhooks.js").then((m) => m.socialWebhookRoutes)); // inbound platform webhooks (#2048) — signature-authenticated, public
  mount("/api/distribution", () => import("./routes/distribution.js").then((m) => m.distributionRoutes)); // scheduled posts + off-platform reach (#2047/#2048)
  mount("/api/social", () => import("./routes/social.js").then((m) => m.socialRoutes)); // social connection layer + Lane B (PRD §5.0)
  mount("/api/promotions", () => import("./routes/promotions.js").then((m) => m.promotionRoutes)); // creator promotion submissions (Lane A, #2046)
  mount("/api/coupons", () => import("./routes/coupons.js").then((m) => m.couponRoutes)); // redeem a SuperAdmin coupon code
  mount("/api/theme-calendar", () => import("./routes/theme-calendar.js").then((m) => m.themeCalendarRoutes)); // public: events the theme picker reads (#2350)
  mount("/api/video-personalization", () => import("./routes/video-personalization.js").then((m) => m.videoPersonalizationRoutes)); // Settings › Video personalization (#2350)
  mount("/api/token-packs", () => import("./routes/token-packs.js").then((m) => m.tokenPackRoutes)); // Pro AI-token top-up packs (buy + verify)
  mount("/api/career", () => import("./routes/career.js").then((m) => m.careerRoutes));
  mount("/api/phone", () => import("./routes/phone.js").then((m) => m.phoneRoutes));
  mount("/api/modules", () => import("./routes/modules.js").then((m) => m.moduleRoutes));
  mount("/api", () => import("./routes/openapi.js").then((m) => m.openapiRoutes));
  mount("/", () => import("./routes/sitemap.js").then((m) => m.sitemapRoutes));

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
  mount("/featureflag", () => import("./routes/featureflag.js").then((m) => m.featureFlagRoutes));
  mount("/FeatureFlag", () => import("./routes/featureflag.js").then((m) => m.featureFlagRoutes));

  // Some legacy frontend services still call /sentiment/* without /api prefix
  mount("/sentiment", () => import("./routes/sentiment.js").then((m) => m.sentimentRoutes));

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
      // The root app is untyped (`new Hono()`), so read the var through its declared shape.
      route: (c.var as Partial<Variables>).routePattern ?? null,
      method: c.req.method,
    });
    return globalErrorHandler(err, c);
  });

  return app;
}

