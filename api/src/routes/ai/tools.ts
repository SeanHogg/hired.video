/**
 * The AI tool dispatcher.
 *
 *   GET  /api/ai/tools           catalog (id, requirePro, anonymous, streaming)
 *   POST /api/ai/tools/:toolId   run one tool — body per tool, `Accept:
 *                                text/event-stream` streams where supported
 *
 * Replaces the per-tool route files (resume scorer / optimizer, skill
 * extractor, template extractor, value proposition, profile audit, salary,
 * sentiment ×4, career resilience, improve-text, résumé summarize / revise /
 * consolidate-bullets) and their private 404/501 catch-alls. Every tool keeps
 * its auth / Pro / token-budget / entitlement behaviour — declared as data in
 * services/ai-tools/registry.ts and applied here in one order.
 */
import { Hono, type MiddlewareHandler } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { ANONYMOUS_AI_TOOL_IDS, isAiToolId } from "../../../../shared/ai-tools/tool-ids.js";
import { DomainError } from "../../domains/errors.js";
import { requireModuleActive } from "../../middleware/moduleGate.js";
import { checkTokenBudget, requirePro } from "../../middleware/tierEnforcement.js";
import { AI_TOOL_REGISTRY, aiToolCatalog } from "../../services/ai-tools/registry.js";
import { failTool, type AiToolContext, type AiToolEntry } from "../../services/ai-tools/types.js";

export const aiToolRoutes = new Hono<AppEnv>();

/** Run a middleware as a gate: null when it called next(), else its response. */
async function gate(mw: MiddlewareHandler<AppEnv>, c: AiToolContext): Promise<Response | null> {
  let passed = false;
  const res = await mw(c, async () => {
    passed = true;
  });
  return passed ? null : (res ?? c.res);
}

/** auth → module toggle → Pro → token budget → per-tool guard. */
async function runGates(c: AiToolContext, tool: AiToolEntry): Promise<Response | null> {
  if (!c.var.user?.sub && !ANONYMOUS_AI_TOOL_IDS.includes(tool.id)) {
    return failTool(c, new DomainError(401, "UNAUTHORIZED", "Authentication required"));
  }
  if (tool.moduleSlug) {
    const blocked = await gate(requireModuleActive(tool.moduleSlug), c);
    if (blocked) return blocked;
  }
  if (tool.requirePro) {
    const blocked = await gate(requirePro(tool.requirePro), c);
    if (blocked) return blocked;
  }
  if (tool.tokenBudget === "gate") {
    const blocked = await checkTokenBudget(c);
    if (blocked) return blocked;
  }
  return tool.guard ? gate(tool.guard, c) : null;
}

aiToolRoutes.get("/tools", (c) => c.json(success(aiToolCatalog()), 200));

aiToolRoutes.post("/tools/:toolId", async (c) => {
  const toolId = c.req.param("toolId");
  if (!isAiToolId(toolId)) return failTool(c, new DomainError(404, "TOOL_NOT_FOUND", `Unknown AI tool: ${toolId}`));
  const tool = AI_TOOL_REGISTRY[toolId];

  const blocked = await runGates(c, tool);
  if (blocked) return blocked;

  const parsed = tool.schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return failTool(c, new DomainError(400, "VALIDATION_ERROR", `Invalid ${toolId} request`, parsed.error.flatten()));
  }
  return tool.handler(c, parsed.data);
});
