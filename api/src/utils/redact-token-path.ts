/**
 * Token-bearing paths — request_logs stores the raw path, so every route
 * whose URL carries a bearer token (an emailed consent / invite / share
 * link) is logged with that segment replaced by `:token`. Data-driven: a
 * new tokenized route adds its prefix here. The segment right after the
 * prefix is the token; anything after it (`/claim`, `/comments`) is kept.
 */
export const TOKEN_PATH_PREFIXES: readonly string[] = [
  "/api/public/candidate-video-consent/",
  "/api/public/candidate-resume/",
  "/api/public/pitch-deck/",
  "/api/public/screening/",
  "/api/public/take-home/invite/",
  "/api/account/invitation/by-token/",
  "/api/bookings/r/",
  "/api/career/resilience-report/",
  "/api/email/unsubscribe/",
  "/api/email/preferences/token/",
  "/api/games/invites/",
  "/api/interview-assignments/invite/",
  "/api/interview-assignments/claim/",
  "/api/live-screen/invites/",
  "/api/references/shared/",
  "/api/resume-feedback/link/",
  "/api/take-home-invites/by-token/",
];

export const REDACTED_TOKEN_SEGMENT = ":token";

/** `path` with the token segment of a token-bearing route replaced by `:token`. */
export function redactTokenPath(path: string): string {
  for (const prefix of TOKEN_PATH_PREFIXES) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (!rest) return path;
    const slash = rest.indexOf("/");
    return prefix + REDACTED_TOKEN_SEGMENT + (slash === -1 ? "" : rest.slice(slash));
  }
  return path;
}
