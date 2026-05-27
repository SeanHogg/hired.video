/**
 * AI API Registry — frontend compat shim.
 *
 * The authoritative AI tool catalog now lives in
 * [shared/ai-tools/](../../../shared/ai-tools/) so the orchestrator,
 * the in-app panel, and (under #1620) the MCP server all read from the
 * same source. This file preserves the public API surface that
 * `ai-orchestration-service.ts` and `ai-context-helpers.ts` rely on
 * (`getAPIById`, `getAPIsByAction`, `getAPIsForContext`) and adapts the
 * shared `AIToolDef` to the older `AvailableAPI` interface.
 *
 * The dead `AI_APIS`, `DATA_APIS`, and `CONTEXT_API_MAPPING` exports
 * were removed — they had no callers outside the legacy registry's own
 * test file (gap #1623 partial close).
 */

import type { AvailableAPI, AIContextType } from "@/lib/types/ai-context";
import {
  TOOLS,
  getTool,
  getToolsByAction,
  getToolsForContext,
  type AIToolDef,
} from "@shared/ai-tools";

/** Adapt the richer shared `AIToolDef` shape to the legacy
 *  `AvailableAPI` consumed by the orchestrator. The shared shape is a
 *  structural superset, so the cast is safe — every field on
 *  `AvailableAPI` exists on `AIToolDef` with the same type. */
function toAvailable(tool: AIToolDef): AvailableAPI {
  return {
    id: tool.id,
    endpoint: tool.endpoint,
    method: tool.method,
    description: tool.description,
    supportedActions: tool.supportedActions,
    requiresAuth: tool.requiresAuth,
    requestSchema: tool.requestSchema,
    responseSchema: tool.responseSchema,
  };
}

/** Get available APIs for a specific context type. */
export function getAPIsForContext(contextType: AIContextType): AvailableAPI[] {
  // The shared `AIContextType` mirrors the frontend one — same string
  // union, pending the canonical move under #1621.
  return getToolsForContext(contextType as never).map(toAvailable);
}

/** Get an API by its stable id. Returns undefined if no match — the
 *  legacy `AvailableAPI` contract returned undefined for misses
 *  whereas the shared `getTool` throws, so this preserves the older
 *  semantics for the orchestrator's fallback path. */
export function getAPIById(apiId: string): AvailableAPI | undefined {
  const tool = TOOLS[apiId];
  return tool ? toAvailable(tool) : undefined;
}

/** Find APIs that support a specific coarse action. */
export function getAPIsByAction(action: string): AvailableAPI[] {
  return getToolsByAction(action).map(toAvailable);
}
