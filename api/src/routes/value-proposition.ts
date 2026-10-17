import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { attachTokenBudget, requirePro, requireTokenBudget } from "../middleware/tierEnforcement.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { aiFailure } from "../services/adapters/llm-error.js";
import { AiStreamFailure, aiStreamResponse, wantsEventStream } from "../services/adapters/ai-stream-response.js";
import { handleValueProposition as valuePropositionUseCase } from "../services/job/value-proposition-handler.js";
import { asHandler } from "../handlers/shared.js";

// The use case returns the pitch / throws DomainError; map to the envelope.
const handleValueProposition = asHandler(valuePropositionUseCase);

export const valuePropositionRoutes = new Hono<AppEnv>();
valuePropositionRoutes.use("*", attachTokenBudget());

// One generator: the body says whether the job / résumé are ids or text.
async function generate(c: Context<AppEnv>) {
  // Closes gap-register #765 — Free-tier 3 value-prop pitches / month.
  const blocked = await servicesProcessor.enforce(c, "value_prop_pitch");
  if (blocked) return blocked;

  const body = await c.req.json().catch(() => null);
  const deps = {
    db: getDb(),
    now: () => new Date(),
    llm: hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, c.var.user) : null,
  };
  // Streamed (#1342): the pitch is shown as it is written.
  if (wantsEventStream(c)) {
    return aiStreamResponse(
      c,
      async (stream) => {
        const { status, body: out } = await handleValueProposition(deps, c.var.user?.sub ?? null, body, stream);
        const envelope = out as { data?: unknown; error?: { code?: string; message?: string; details?: unknown } };
        if (status < 200 || status >= 300) {
          throw new AiStreamFailure(envelope.error?.code ?? "AI_UNAVAILABLE", envelope.error?.message ?? "Request failed", status, envelope.error?.details);
        }
        servicesProcessor.meterEvent(c, "value_prop_pitch");
        return envelope.data;
      },
      { tag: "[valueproposition] stream" },
    );
  }
  try {
    const { status, body: out } = await handleValueProposition(deps, c.var.user?.sub ?? null, body);
    if (status >= 200 && status < 300) servicesProcessor.meterEvent(c, "value_prop_pitch");
    return c.json(out as object, status as 200);
  } catch (err) {
    return aiFailure(c, err, "[valueproposition] LLM error");
  }
}

// Legacy per-input-shape paths (pre-2026-10-04 clients) share the one handler.
const LEGACY_PATHS = ["content", "job-content-resume-id", "job-id-resume-id", "job-id-resume-content"].map((p) => `/generate/${p}`);

// Paid AI is Pro-only (2026-10-04 ruling); the free-tier cap below is then moot
// but kept so the entitlement meter still counts pitches.
for (const path of ["/generate", ...LEGACY_PATHS]) {
  valuePropositionRoutes.post(path, requirePro("Value Proposition"), requireTokenBudget(), generate);
}

valuePropositionRoutes.all("*", (c) =>
  c.json(
    {
      success: false as const,
      error: { code: "NOT_FOUND", message: "Value proposition route not found" },
      timestamp: new Date().toISOString(),
    },
    404,
  ),
);
