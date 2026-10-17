/**
 * AI tool registry entry — one data row per tool served by
 * `POST /api/ai/tools/:toolId` (routes/ai/tools.ts).
 *
 * The dispatcher applies the gates the entry declares, in this order:
 *   auth (unless listed in ANONYMOUS_AI_TOOL_IDS) → module toggle → `requirePro` → token budget
 *   → `schema` → `handler`.
 * `handler` owns everything tool-specific: entitlement meters
 * (servicesProcessor), streaming, the LLM call and its fallback.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";
import type { AiToolId } from "../../../../shared/ai-tools/tool-ids.js";
import type { AppEnv } from "../../types/index.js";
import type { DomainError } from "../../domains/errors.js";
import { failFromDomainError } from "../../handlers/shared.js";

export type AiToolContext = Context<AppEnv>;

export interface AiToolEntry {
  id: AiToolId;
  /** Validates the JSON body; failures answer 400 VALIDATION_ERROR. */
  schema: z.ZodTypeAny;
  /** Pro feature name for the PRO_REQUIRED copy (`requirePro`), when paid. */
  requirePro?: string;
  /** `gate` = refuse up front when the token budget is spent; `handler` =
   *  the handler decides (audience-aware tools); `none` = not LLM-metered. */
  tokenBudget: "gate" | "handler" | "none";
  /** LLM use-case profile the tool bills under (catalog + docs). */
  useCase?: string;
  /** Admin module toggle (modules table slug) that can switch the tool off. */
  moduleSlug?: string;
  /** Extra per-tool middleware run after the gates (e.g. an IP cap). */
  guard?: MiddlewareHandler<AppEnv>;
  handler: (c: AiToolContext, input: unknown) => Promise<Response>;
}

/** Typed constructor: the handler sees `z.infer<schema>`, the registry
 *  stores the erased entry. */
export function defineAiTool<S extends z.ZodTypeAny>(
  entry: Omit<AiToolEntry, "schema" | "handler"> & {
    schema: S;
    handler: (c: AiToolContext, input: z.infer<S>) => Promise<Response>;
  },
): AiToolEntry {
  return entry as AiToolEntry;
}

/** Answer a tool request with a DomainError's envelope. */
export function failTool(c: AiToolContext, err: DomainError): Response {
  const result = failFromDomainError(err);
  return c.json(result.body as never, result.status as never);
}
