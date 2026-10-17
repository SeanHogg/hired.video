/**
 * /api/ai — the AI surface.
 *
 *   GET  /models          vendor/model catalog (SuperAdmin only)
 *   POST /chat            career coach turn            (chat.ts)
 *   GET|DELETE /sessions  chat sessions                (sessions.ts)
 *   POST /help-assist     doc-grounded deflection      (help.ts, optional-auth)
 *   GET  /tools           AI tool catalog              (tools.ts)
 *   POST /tools/:toolId   every AI tool, one dispatcher (tools.ts)
 */
import { Hono } from "hono";
import { BuilderforceClient } from "@seanhogg/builderforce-sdk";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { attachTokenBudget } from "../../middleware/tierEnforcement.js";
import { superAdminMiddleware } from "../../middleware/superAdmin.js";
import { aiChatRoutes } from "./chat.js";
import { aiHelpRoutes } from "./help.js";
import { aiSessionRoutes } from "./sessions.js";
import { aiToolRoutes } from "./tools.js";

export const aiRoutes = new Hono<AppEnv>();

// Piggy-back the live token-budget onto every AI response so clients can
// update the AI-tokens UI from the same round-trip. See attachTokenBudget.
aiRoutes.use("*", attachTokenBudget());

// GET /api/ai/models — vendor/model catalog. SuperAdmin only: end
// users must never see which LLM provider serves their requests; they
// only see "tokens consumed". Reads live from the Builderforce
// gateway (whatever's currently catalog-available + cooldown state)
// rather than a hand-maintained registry on our side.
aiRoutes.get("/models", superAdminMiddleware, async (c) => {
  const apiKey = c.env?.BUILDERFORCE_API_KEY?.trim();
  if (!apiKey) {
    return c.json(success({ configured: false, data: [] }));
  }
  const sdk = new BuilderforceClient({ apiKey, baseUrl: c.env?.BUILDERFORCE_GATEWAY_URL });
  try {
    const models = await sdk.models.list();
    return c.json(success(models));
  } catch (err) {
    return c.json(error("MODELS_UNAVAILABLE", err instanceof Error ? err.message : String(err)), 502);
  }
});

aiRoutes.route("/", aiChatRoutes).route("/", aiSessionRoutes).route("/", aiHelpRoutes).route("/", aiToolRoutes);
