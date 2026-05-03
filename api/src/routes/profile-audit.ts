/**
 * POST /api/profile-audit — Pro-gated. Reads the authenticated user's
 * profile, asks the LLM for a rewritten headline + summary, runs the
 * deterministic 5-check audit (mirrors the blog post), and returns
 * everything the /tools/profile-audit page needs to render the
 * before/after preview.
 *
 * Acceptance is NOT handled here — the frontend calls the existing
 * `PUT /api/users/me` to apply whichever fields the user accepts. Keeps
 * profile-write validation, audit, and notifications in one place.
 */

import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requirePro } from "../middleware/auth-gates.js";
import { checkTokenBudget } from "../middleware/token-budget.js";
import { runProfileAudit } from "../services/profile/ProfileAuditService.js";

export const profileAuditRoutes = new Hono<{ Variables: Variables }>();

profileAuditRoutes.post("/", requirePro("Profile Audit"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;

  try {
    const result = await runProfileAudit({
      userId,
      env: (c.env as any) ?? {},
      user: c.var.user,
    });
    return c.json(success(result), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "USER_NOT_FOUND") {
      return c.json(error("NOT_FOUND", "Your profile could not be loaded."), 404);
    }
    console.error("[profile-audit] failed", err);
    return c.json(
      error(
        "AI_UNAVAILABLE",
        "AI providers are temporarily unavailable. Please try again in a minute.",
      ),
      503,
    );
  }
});
