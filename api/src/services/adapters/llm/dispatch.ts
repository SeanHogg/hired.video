/**
 * Transport for the LLM port: walk a use case's profile chain against the
 * Builderforce gateway (one-shot or streamed via llm-stream.ts), with the
 * universal prompt-safety screen, per-attempt timeouts, post-success
 * validation, substitution alarm, and the chain-exhausted error.
 */

import type {
  BuilderforceClient,
  ChatMessage,
  ResponseFormat,
} from "@seanhogg/builderforce-sdk";
import { logger } from "../../../lib/logger.js";
import { buildModelRequestParams } from "../model-request-rules.js";
import { screenPrompt, PromptBlockedError } from "../../moderation/promptGuard.js";
import type { InferenceProfile, LLMUseCase } from "../providers.js";
import { streamCompletion } from "../llm-stream.js";
import {
  LLMDispatchError,
  classifyAttemptError,
  isChainTerminal,
  type LLMDispatchAttempt,
} from "./dispatch-errors.js";
import { isTruncatedJson } from "./json-schema.js";
import { normalizeUsage } from "./metering.js";
import type { LLMCallOpts, LLMMessagesOptions, LLMResult } from "./types.js";

/** One dispatch request: the resolved chain plus the wire payload. */
export interface DispatchRequest {
  chain: InferenceProfile[];
  useCase: LLMUseCase;
  messages: ChatMessage[];
  responseFormat?: ResponseFormat;
  tools?: LLMMessagesOptions["tools"];
  toolChoice?: LLMMessagesOptions["toolChoice"];
  metadata: Record<string, string>;
  callOpts: LLMCallOpts;
  validateContent?: (content: string) => void;
}

/**
 * Walk the use case's profile chain via the SDK. Each profile is
 * one independent gateway request; failures advance the chain. The
 * gateway's own internal retry is opaque to us (surfaced via
 * `_builderforce.retries` on the response we ultimately return).
 *
 * `validateContent` is an optional post-success check for JSON-mode
 * callers. When supplied, a parse / schema failure is treated as a
 * model failure and the loop advances to the next profile.
 */
export async function dispatchChain(sdk: BuilderforceClient, opts: DispatchRequest): Promise<LLMResult> {
  const correlationId = `llm-${crypto.randomUUID()}`;
  const attempts: LLMDispatchAttempt[] = [];

  // Universal content-safety net. Every text LLM call funnels through
  // dispatch, so screening the user-role input here covers the career
  // coach, storyboard script, comic scaffolder, and any future feature
  // for free. Throws PromptBlockedError (an AppError → clean 422 via the
  // global handler) before a single token is spent. Trusted internal
  // callers (moderation scanner) opt out via `skipContentGuard`.
  if (!opts.callOpts.skipContentGuard) {
    const userText = opts.messages
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");
    const screen = screenPrompt(userText);
    if (!screen.safe) {
      logger.warn("[llm-client] prompt blocked", {
        correlationId,
        useCase: opts.useCase,
        category: screen.category,
        label: screen.label,
      });
      throw new PromptBlockedError(screen);
    }
  }

  for (let i = 0; i < opts.chain.length; i++) {
    const profile = opts.chain[i];
    const startedAt = Date.now();
    // Per-attempt timeout: caller-supplied wins; otherwise `:free`
    // tier profiles get a tight 25s cap (closes gap #525 part A —
    // free-pool requests that haven't started in ~20s won't finish
    // within 60s either, so a long timeout just inflates the
    // wall-clock the user waits before the chain advances). Paid
    // profiles keep the SDK default 60s.
    // Model-family wire rules (strict pin, sampling, thinking budget,
    // tool_choice) live in model-request-rules.ts — never branch here.
    const hasTools = Boolean(opts.tools && opts.tools.length > 0);
    const { attemptTimeoutMs: familyTimeoutMs, ...modelParams } =
      buildModelRequestParams(profile, opts.toolChoice, hasTools);
    const isFreeTier = profile.model.endsWith(":free");
    const perAttemptTimeoutMs =
      opts.callOpts.timeoutMs ?? familyTimeoutMs ?? (isFreeTier ? 25_000 : undefined);
    // Captures `_builderforce.resolvedVendor` after a successful SDK
    // call so the catch block can attribute a post-success local
    // failure (schema/empty validator throw) to the upstream that
    // actually served us. Stays undefined when the SDK call itself
    // throws (BuilderforceApiError carries its own `vendor`).
    let resolvedVendor: string | undefined;
    // Streamed (#1342): deltas reach the sink as they arrive; a failed
    // attempt that already streamed tells the sink to discard them.
    const sink = hasTools ? undefined : opts.callOpts.stream;
    let streamedAny = false;
    try {
      const params = {
        ...modelParams,
        messages: opts.messages,
        ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
        ...(hasTools ? { tools: opts.tools } : {}),
        useCase: opts.useCase,
        metadata: { ...opts.metadata, correlationId },
        ...(perAttemptTimeoutMs !== undefined
          ? { timeoutMs: perAttemptTimeoutMs }
          : {}),
        ...(opts.callOpts.signal ? { signal: opts.callOpts.signal } : {}),
        ...(opts.callOpts.idempotencyKey
          ? { idempotencyKey: opts.callOpts.idempotencyKey }
          : {}),
      };
      const res = sink
        ? await streamCompletion(sdk, params, sink, () => {
            streamedAny = true;
          })
        : await sdk.chat.completions.create({ ...params, stream: false });

      resolvedVendor = res._builderforce?.resolvedVendor;
      const choice = res.choices?.[0];
      const message = choice?.message;
      const content = typeof message?.content === "string" ? message.content : "";
      const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

      // A response is valid if EITHER it has prose OR it requested tools.
      if (!content && toolCalls.length === 0) {
        throw new Error(`Empty response from gateway for model ${profile.model}`);
      }
      // JSON cut off at max_tokens can never parse (a résumé echo, a
      // thinking model that spent the budget): a failed attempt, so the
      // chain advances instead of handing half a document to the caller.
      if (isTruncatedJson(choice?.finish_reason, opts.responseFormat)) {
        throw new Error(`Truncated JSON response (finish_reason=length) from model ${profile.model}`);
      }

      if (opts.validateContent && content) {
        opts.validateContent(content);
      }

      const usage = normalizeUsage(
        res.usage,
        profile.model,
        res._builderforce?.resolvedModel ?? res.model,
        res._builderforce?.traceId,
        res._builderforce?.schemaRetries,
      );
      // #515 — silent substitution alarm. The gateway docs (SDK 0.4.0)
      // treat `model` as a hint and reserve the right to substitute on
      // cooldown / outage / plan-tier mismatch. For latency-pinned use
      // cases (e.g. `match` requires Cerebras sub-200ms TTFT) a swap to
      // OpenRouter is a 50× latency hit. Log the substitution so SA can
      // dashboard SLA breaches without locking out vendor improvements.
      // Quiet by default — only fires when the gateway actually swapped.
      if (
        usage.model &&
        usage.model !== profile.model &&
        // Don't double-warn the fallback chain we drove — substitution
        // is only the silent gateway-side swap.
        attempts.length === 0
      ) {
        const latencyMs = Date.now() - startedAt;
        // Structured + greppable. The same substitution fact is also
        // recorded on the queryable usage-ledger metadata downstream
        // (token-ledger.charge → servicesProcessor.meter) so SA can
        // dashboard SLA breaches, not just grep logs (gap #515 option b).
        logger.warn("[llm-client] substitution-alarm", {
          correlationId,
          useCase: opts.useCase,
          requestedModel: profile.model,
          resolvedModel: usage.model,
          latencyMs,
        });
      }
      const finishReason =
        choice?.finish_reason ?? (toolCalls.length > 0 ? "tool_calls" : "stop");

      return {
        content,
        toolCalls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
        finishReason,
        usage,
      };
    } catch (err) {
      const cls = classifyAttemptError(err);
      const attempt: LLMDispatchAttempt = {
        model: profile.model,
        durationMs: Date.now() - startedAt,
        ...cls,
        vendor: cls.vendor ?? resolvedVendor,
      };
      attempts.push(attempt);
      if (streamedAny) sink?.onReset?.();
      // Short-circuit when every later profile would fail the same way
      // (isChainTerminal: gateway-terminal, tenant-key 401, subrequest cap).
      // Walking the rest of the chain just burns latency, per-attempt cost
      // and Worker subrequests on calls guaranteed to fail identically.
      // Stop and surface the trail we have. Gaps #2263 / #1570 / #2309.
      if (isChainTerminal(err)) {
        logger.warn("[llm-client] attempt failed terminally; short-circuiting chain", {
          correlationId,
          useCase: opts.useCase,
          model: profile.model,
          kind: cls.kind,
          status: cls.status,
          remainingProfiles: opts.chain.length - 1 - i,
        });
        break;
      }
      if (i < opts.chain.length - 1) {
        logger.warn("[llm-client] attempt failed; falling back", {
          correlationId,
          useCase: opts.useCase,
          model: profile.model,
          kind: cls.kind,
          status: cls.status,
          fallbackModel: opts.chain[i + 1].model,
          message: cls.message.slice(0, 150),
        });
      }
    }
  }
  // Every profile in the chain failed. Prefer the gateway's authoritative
  // trace id (`details.correlationId`, captured per attempt) for the
  // user-facing error so Builderforce support can resolve it server-side;
  // fall back to our locally-minted request-metadata id only when no
  // attempt carried a gateway trace (pre-dispatch / non-Builderforce
  // throws). Gap #1810. Both ids are logged below so our own logs stay
  // cross-referenceable either way.
  // Each profile is an independent gateway call with its OWN trace id, so
  // take the LAST one that carried a trace — the terminal failure the user
  // actually hit. Per-attempt traces are surfaced individually in the
  // support payload (llm-error.ts) so every call in the chain stays
  // resolvable.
  const gatewayTraceId = [...attempts].reverse().find((a) => a.traceId)?.traceId;
  logger.error("[llm-client] dispatch exhausted", {
    correlationId,
    useCase: opts.useCase,
    gatewayTraceId,
    attempts,
  });
  throw new LLMDispatchError(opts.useCase, attempts, gatewayTraceId ?? correlationId);
}
