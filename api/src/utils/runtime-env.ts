/**
 * Single source of truth for "which environment is this worker running in".
 *
 * Why this exists:
 *   Six call sites independently asked `process.env.NODE_ENV !== "production"`
 *   and called the answer `isDev`. Cloudflare Workers never set NODE_ENV —
 *   wrangler does not inject it and it is not a `[vars]` entry — so that
 *   expression was ALWAYS true in production. Two consequences shipped live:
 *     • routes/auth.ts returned the email-verification token and the temp
 *       auth token in the API response body "only in dev" (account takeover:
 *       request a resend for any address, read the token out of the 200).
 *     • utils/jwt.ts fell back to the hardcoded "dev-secret" instead of
 *       throwing when JWT_SECRET was unconfigured, so prod would have signed
 *       real sessions with a public constant.
 *
 * Contract:
 *   • FAIL CLOSED. Production is the default; a caller gets dev behaviour
 *     only when the environment says so EXPLICITLY. An unset/unknown value
 *     must never unlock a debug affordance or an insecure fallback.
 *   • `APP_ENV` is the authoritative signal because it survives into the
 *     Worker as a declared var (wrangler.toml `[vars]`). NODE_ENV is honoured
 *     as a fallback so Node-hosted tests and local tooling work unchanged.
 *   • Every environment-shaped branch imports from here. Do not re-derive
 *     `NODE_ENV !== "production"` anywhere else.
 */

export type AppEnv = "production" | "development" | "test";

/** Values that explicitly opt OUT of production behaviour. */
const NON_PRODUCTION: Record<string, AppEnv> = {
  dev: "development",
  development: "development",
  local: "development",
  test: "test",
  testing: "test",
};

function read(key: string): string {
  const raw = process.env[key] ?? (globalThis as any).__ENV?.[key];
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/**
 * The resolved environment. `APP_ENV` wins over `NODE_ENV`; anything
 * unrecognised (including unset) resolves to "production".
 */
export function appEnv(): AppEnv {
  for (const key of ["APP_ENV", "NODE_ENV"]) {
    const value = read(key);
    if (!value) continue;
    if (NON_PRODUCTION[value]) return NON_PRODUCTION[value];
    if (value === "production" || value === "prod") return "production";
  }
  return "production";
}

/** True unless the environment explicitly declares dev/test. */
export function isProduction(): boolean {
  return appEnv() === "production";
}

/**
 * True only in an explicitly non-production environment. Gate every debug
 * affordance (echoing a token back in a response, test-mode vendor flags,
 * verbose errors) on this — never on a bare NODE_ENV comparison.
 */
export function isDevEnvironment(): boolean {
  return !isProduction();
}
