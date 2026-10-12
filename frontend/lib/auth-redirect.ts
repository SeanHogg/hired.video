// Single seam for deep-link → auth → destination round-trips. Every consumer
// (Login, Signup, Settings inbox-sync hero, future tool CTAs) reads/writes
// the `?redirectTo=` query param through this module so the allowlist stays
// honest. Rejects scheme-relative ("//host"), backslash-relative ("/\\host"),
// protocol absolute ("https://..."), and javascript:/data:/vbscript: URIs.
// Defaults to "/" when input is missing or invalid.
//
// Why also read `?redirect=`? Login.tsx, VerifyEmail.tsx, OAuthProviders, and
// the magic-link endpoint all predate this gap with a `?redirect=` convention
// of their own. Until those consumers migrate, we accept either spelling so a
// CTA that writes `?redirectTo=` and an old caller that wrote `?redirect=`
// both land the user back where they meant to be. `redirectTo` wins when both
// are present.

const REDIRECT_PARAMS = ["redirectTo", "redirect"] as const;

export function safeRedirectTo(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  const v = String(raw).trim();
  if (!v.startsWith("/")) return fallback;
  // Scheme-relative ("//evil.com") and backslash-relative ("/\\evil.com")
  // both let browsers treat the URL as cross-origin — block them.
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  // Defense-in-depth: a literal path can't start with these schemes, but
  // belt-and-braces in case the input is decoded oddly upstream.
  if (/^\s*(javascript|data|vbscript):/i.test(v)) return fallback;
  return v;
}

/**
 * Pull a sanitized redirect target out of a URLSearchParams (or anything with
 * a `.get()` method). Accepts both `redirectTo` (new) and `redirect` (legacy).
 */
export function readRedirectParam(
  params: { get(key: string): string | null },
  fallback = "/",
): string {
  for (const key of REDIRECT_PARAMS) {
    const raw = params.get(key);
    if (raw) return safeRedirectTo(raw, fallback);
  }
  return fallback;
}

/** Build a Link `to` that preserves the current pathname+search as redirectTo. */
export function buildAuthLinkTo(
  authPath: "/login" | "/signup",
  currentPathWithSearch: string,
): string {
  const safe = safeRedirectTo(currentPathWithSearch, "");
  return safe ? `${authPath}?redirectTo=${encodeURIComponent(safe)}` : authPath;
}

/**
 * Append (or replace) `redirectTo` on an existing URL-ish string. Used when a
 * post-auth handler navigates to an intermediate screen (e.g.
 * `/signup-success?email=…`) that itself needs to carry the destination
 * forward to the eventual sign-in.
 */
export function withRedirectTo(url: string, redirectTo: string | null | undefined): string {
  const safe = safeRedirectTo(redirectTo, "");
  if (!safe) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}redirectTo=${encodeURIComponent(safe)}`;
}
