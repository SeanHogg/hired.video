/**
 * Partner authentication middleware — the gate for every `/api/partner/*`
 * system-to-system route. Reads the partner key from `Authorization: Bearer
 * hvpk_...` (or the `X-Hired-Partner-Key` header), validates it via
 * `resolvePartnerRequest`, and stashes the resolved partner on `c.var.partner`.
 *
 * `/api/partner` is in PUBLIC_PREFIXES so the JWT auth layer skips it — this
 * middleware is the ONLY auth on the partner surface. Same posture as the
 * company embed data API.
 */
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/index.js";
import { error } from "../types/index.js";
import { resolvePartnerRequest, PartnerAuthError } from "../services/partner/keys.js";
import type { PartnerScope } from "../../../shared/partner.js";

function extractKey(authHeader: string | undefined, headerKey: string | undefined): string | null {
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();
  if (headerKey) return headerKey.trim();
  return null;
}

/**
 * Build a middleware that requires a valid partner key and (optionally) a
 * specific scope. Usage: `partnerAuth("write:job_seekers")`.
 */
export function partnerAuth(requiredScope: PartnerScope | null = null): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const rawKey = extractKey(c.req.header("Authorization"), c.req.header("X-Hired-Partner-Key"));
    try {
      const result = await resolvePartnerRequest(rawKey, requiredScope);
      c.set("partner", { partnerId: result.partnerId, keyId: result.keyId, scopes: result.scopes });
      await next();
    } catch (err) {
      if (err instanceof PartnerAuthError) {
        return c.json(error(err.code, err.message), err.status);
      }
      throw err;
    }
  };
}
