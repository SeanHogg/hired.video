/**
 * Route modules evaluated at isolate STARTUP rather than inside their first
 * request (gap #2342).
 *
 * app.ts mounts every route module lazily (lib/lazy-route.ts) so Worker
 * startup stays under Cloudflare's startup CPU cap. On the Workers Free plan
 * that moved each module's init (zod schemas, Hono routers, …) into the first
 * request that touched it, inside a 10 ms request CPU budget — and Cloudflare
 * killed it (error 1102, a CORS-less 503 the browser reports as "Failed to
 * fetch"). Global-scope evaluation is billed to startup, not to a request, so
 * importing a module here moves its init out of the request path.
 *
 * The set is the modules behind the paths real traffic hits (request_logs,
 * 14 days to 2026-10-10: help, points, studio, _meta/geo, inbox, search, auth,
 * usage, billing, settings, social/YouTube, résumés …), plus the `/api` and
 * `/` catch-all mounts every later request walks through. Measured with
 * `wrangler check startup`: lazy 680 ms, this set 740 ms, every module
 * 1250 ms. Routes left lazy (recruiting, LMS, HR, admin tooling) still work;
 * only their first hit on a fresh isolate risks the CPU kill.
 *
 * hot-routes.test.ts fails if a hot route's request would still lazily load a
 * module that is mounted ahead of it under the same prefix.
 */
import "./routes/account.js";
import "./routes/ai/index.js";
import "./routes/analytics/index.js";
import "./routes/articles.js";
import "./routes/auth.js";
import "./routes/billing.js";
import "./routes/bootstrap.js";
import "./routes/checkout.js";
import "./routes/communication.js";
import "./routes/community-resources.js";
import "./routes/companies.js";
import "./routes/company-embed.js";
import "./routes/coupons.js";
import "./routes/course-authoring.js";
import "./routes/courses.js";
import "./routes/errors.js";
import "./routes/events.js";
import "./routes/featured-creators.js";
import "./routes/game-agent.js";
import "./routes/guest-auth.js";
import "./routes/help.js";
import "./routes/inbox.js";
import "./routes/jobs.js";
import "./routes/jobscraper.js";
import "./routes/locations.js";
import "./routes/media-proxy.js";
import "./routes/meta.js";
import "./routes/nle.js";
import "./routes/notifications.js";
import "./routes/oauth.js";
import "./routes/og.js";
import "./routes/openapi.js";
import "./routes/paid-media.js";
import "./routes/passkeys.js";
import "./routes/pipeline/index.js";
import "./routes/points.js";
import "./routes/promotions.js";
import "./routes/proof.js";
import "./routes/resume-feedback.js";
import "./routes/resumes/index.js";
import "./routes/role-access.js";
import "./routes/search.js";
import "./routes/security.js";
import "./routes/services.js";
import "./routes/settings.js";
import "./routes/sitemap.js";
import "./routes/social.js";
import "./routes/sourcing-bids.js";
import "./routes/studio.js";
import "./routes/studio-content-scan.js";
import "./routes/studio-dubbing.js";
import "./routes/studio-features.js";
import "./routes/studio-home-wall.js";
import "./routes/studio-render-variants.js";
import "./routes/studio-social-publish.js";
import "./routes/studio-socket.js";
import "./routes/studio-templates.js";
import "./routes/theme-calendar.js";
import "./routes/tool-runs.js";
import "./routes/upload.js";
import "./routes/users.js";
import "./routes/video-personalization.js";
import "./routes/workspaces.js";
import "./routes/youtube.js";