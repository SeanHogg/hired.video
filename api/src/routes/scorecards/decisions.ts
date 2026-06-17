/**
 * Hiring decisions routes for /api/scorecards/*.
 * Thin HTTP adapter — body parsing via Zod, delegation to service.
 */

import { Hono } from "hono";
import type { Variables, AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { CreateDecisionSchema } from "../../domains/scorecards/schemas.js";
import { mapServiceError, requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";
import { withGamification } from "../../domains/gamification/with-gamification.js";

export function decisionRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const applicationId = c.req.query("applicationId");
    if (!applicationId) {
      return c.json(error("VALIDATION_ERROR", "applicationId required"), 400);
    }
    try {
      return c.json(
        success(await service().listDecisions(auth.userId, applicationId)),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.post("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = CreateDecisionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      const created = await service().createDecision(auth.userId, parsed.data);
      // #1118 — an "approve" hiring decision is the hire-confirmed signal.
      // RefId = the decision id keeps it idempotent. Best-effort.
      if (parsed.data.decision === "approve") {
        await withGamification(c, "hire-confirmed", (game, role, uidEarner) =>
          game.onHireConfirmed({
            userId: uidEarner,
            role,
            hireId: (created as { id?: string } | null)?.id ?? parsed.data.applicationId,
          }),
        );
      }
      return c.json(success(created), 201);
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}
