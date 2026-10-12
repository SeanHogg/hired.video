// /people/:id — public professional profile page (UUID or customUrlSlug).
// Rewrites OG meta + injects the ProfilePage JSON-LD for social + search
// crawlers so the profile gets a rich result + accurate share card without
// executing the SPA. Real users get the unmodified SPA. Metadata + JSON-LD
// come from GET /api/og/person/:userRef/meta (only public, verified profiles
// resolve; private/unverified return a neutral fallback).

import { makeCrawlerOgHandler } from "../_lib/og-rewrite.js";

// No `defaults`: /people/:id also matches named marketing sub-routes
// (/people/roster, /people/scorecards, …). The meta endpoint returns null
// fields for anything that isn't a public profile, so rewriteMeta is a no-op
// and those pages keep their own SPA meta — only real profiles get rewritten.
export const onRequest = makeCrawlerOgHandler({
  metaUrl: ({ base, params }) => `${base}/api/og/person/${encodeURIComponent(params.id)}/meta`,
});
