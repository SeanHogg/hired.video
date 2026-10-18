/**
 * Hiring decisions routes for /api/scorecards/*.
 * Thin HTTP adapter — body parsing via Zod, delegation to service.
 */

import { Hono } from "hono";
import type { Variables, AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { CreateDecisionSchema } from "../../domains/scorecards/schemas.js";
import { requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";
import { withGamification } from "../../domains/gamification/with-gamification.js";
import { validateJson } from "../helpers/validate.js";

export function decisionRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const userId = requireUser(c);
    const applicationId = c.req.query("applicationId");
    if (!applicationId) {
      return c.json(error("VALIDATION_ERROR", "applicationId required"), 400);
    }
    return c.json(
      success(await service().listDecisions(userId, applicationId)),
    );
  });

  r.post("/", validateJson(CreateDecisionSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const auth = requireUser(c);
    const body = c.req.valid("json");
    const created = await service().createDecision(auth, body);
    // #1118 — an "approve" hiring decision is the hire-confirmed signal.
    // RefId = the decision id keeps it idempotent. Best-effort.
    if (body.decision === "approve") {
      await withGamification(c, "hire-confirmed", (game, role, uidEarner) =>
        game.onHireConfirmed({
          userId: uidEarner,
          role,
          hireId: (created as { id?: string } | null)?.id ?? body.applicationId,
        }),
      );
    }
    return c.json(success(created), 201);
  });

  return r;
}
