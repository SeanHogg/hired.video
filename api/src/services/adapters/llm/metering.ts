/**
 * Metering call-site wrapper for the LLM port: usage normalization, the
 * gateway billing metadata, and the fire-and-forget token-ledger charge.
 * The ledger / token-balance logic itself lives in token-ledger.ts.
 */

import type { ChatCompletionResponse } from "@seanhogg/builderforce-sdk";
import { logger } from "../../../lib/logger.js";
import { tokenLedger } from "../../../domains/billing/token-ledger.js";
import type { JwtPayload } from "../../../types/index.js";
import type { LLMCallOpts, LLMUsage } from "./types.js";

/**
 * Charge the token-ledger after a successful LLM call. Fire-and-forget
 * — billing failures must NEVER fail an otherwise-successful AI
 * response.
 *
 * Exported for the metering regression suite (#429): this is the single
 * choke point every metered LLM call flows through, so asserting its
 * gate (charge iff a billed user + positive usage) protects the whole
 * AI surface from silently re-introducing the "forgot to bill" leak.
 */
export async function chargeLedger(
  user: JwtPayload | null | undefined,
  featureKey: string,
  usage: LLMUsage | undefined,
  opts: LLMCallOpts,
): Promise<void> {
  const billedUserId = opts.billedUserId ?? user?.sub;
  if (!billedUserId || !usage || usage.totalTokens <= 0) return;
  try {
    await tokenLedger.charge({
      userId: billedUserId,
      featureKey,
      usage,
      toolRunId: opts.toolRunId,
      sessionId: opts.sessionId,
      ...(opts.exempt ? { exempt: true } : {}),
    });
  } catch (err) {
    logger.warn("[llm-client] charge failed", { billedUserId, featureKey, error: err });
  }
}

export function normalizeUsage(
  raw: ChatCompletionResponse["usage"],
  requestedModel: string,
  resolvedModel: string | undefined,
  traceId: string | undefined,
  schemaRetries: number | undefined,
): LLMUsage {
  return {
    promptTokens: raw?.prompt_tokens ?? 0,
    completionTokens: raw?.completion_tokens ?? 0,
    totalTokens: raw?.total_tokens ?? 0,
    model: resolvedModel ?? requestedModel,
    requestedModel,
    ...(traceId ? { traceId } : {}),
    // SA-only strict-mode conformance telemetry (#2159). Only stamp when the
    // gateway actually reported a count so the charge path / usage-ledger
    // metadata stays absent (not `0`) for non-strict calls.
    ...(schemaRetries !== undefined ? { schemaRetries } : {}),
  };
}

/**
 * Build the metadata the gateway will persist on `llm_usage_log` and
 * echo back on `_builderforce.metadata`. Always includes `featureKey`
 * for SA dashboards; optional `toolRunId` / `sessionId` / `userId`
 * for forensic billing trace-back. Single source so every call site
 * sends consistent shape.
 */
export function buildMetadata(
  user: JwtPayload | null | undefined,
  featureKey: string,
  opts: LLMCallOpts,
): Record<string, string> {
  const md: Record<string, string> = { featureKey };
  const billedUserId = opts.billedUserId ?? user?.sub;
  if (billedUserId) md.userId = billedUserId;
  if (opts.toolRunId) md.toolRunId = opts.toolRunId;
  if (opts.sessionId) md.sessionId = opts.sessionId;
  return md;
}
