/**
 * Paths a signed-in, unverified user may stay on. Used by
 * `GlobalVerificationGate` in App.tsx.
 *
 * Matching is `path === prefix` or `path.startsWith(prefix + "/")` after
 * lowercasing. `/` is therefore exact-match only: no real pathname starts
 * with `"//"`, so this opens only the marketing homepage itself. That
 * entry was missing, which sent an unverified signed-in user from `/` to
 * `/verify-email` (#1658 / #3157).
 */
export const VERIFICATION_ALLOWED_PREFIXES = [
  "/",
  "/verify-email",
  "/confirm-email",
  "/login",
  "/signup",
  "/signup-success",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/auth/magic-link",
  "/accept-invitation",
  "/logout",
  "/privacy",
  "/terms",
  "/cookies",
] as const;

export function isVerificationAllowedPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return VERIFICATION_ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
