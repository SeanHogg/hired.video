/**
 * AI Tool Registry — shared types.
 *
 * Every AI-callable endpoint (resume optimization, salary analysis,
 * task CRUD, etc.) is declared once here and consumed by:
 *
 *   - the frontend AIOrchestrationService planner
 *     ([ai-orchestration-service.ts](../../frontend/lib/services/ai-orchestration-service.ts))
 *   - the in-app AIChatPanel quick-action suggestions
 *   - (under gap #1620) the MCP `tools/list` endpoint, where each entry
 *     maps to one MCP tool
 *
 * Prior to this registry, the frontend kept its own 14-entry list in
 * `frontend/lib/config/ai-api-registry.ts` whose endpoint paths
 * referenced retired PascalCase routes (`/api/Resume/{id}`,
 * `/api/SalaryAnalyzer/analyze`) — those don't exist on the current
 * backend. Migrating to this registry corrected those paths to the
 * actual mount points in [app.ts](../../api/src/app.ts).
 */

// AIContextType is now canonical in shared/ai-context-types.ts (gap
// #1626 close). Imported for local use in AIToolDef + re-exported so
// existing `import { AIContextType } from "@shared/ai-tools"` callsites
// keep working.
import type { AIContextType } from "../ai-context-types.js";
export type { AIContextType } from "../ai-context-types.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface AIToolDef {
  /** Stable identifier — kebab-case, lowercase. Acts as both registry
   *  key and (under #1620) MCP tool name. Never rename a shipped id —
   *  add a new one and migrate callers. */
  id: string;
  /** Human-readable description used in MCP `tools/list`, the
   *  orchestrator's prompt, and the SuperAdmin tool browser. */
  description: string;
  /** Concrete endpoint path, including `:param` placeholders for path
   *  segments (`/api/resume/:id`). Use lowercase to match the current
   *  Hono mounts in [app.ts](../../api/src/app.ts). */
  endpoint: string;
  /** HTTP verb. */
  method: HttpMethod;
  /** Whether the route requires an authenticated user. */
  requiresAuth: boolean;
  /** Coarse action labels the tool services — used by the orchestrator
   *  to pick tools when the user message implies one of these
   *  ("optimize my resume", "ATS score", etc.). */
  supportedActions: string[];
  /** Page-context types where this tool is surfaced in the chat panel.
   *  The orchestrator filters tools by context type before planning. */
  contextTypes: AIContextType[];
  /** Optional link to the backend `LLMUseCase` profile in
   *  [providers.ts](../../api/src/services/adapters/providers.ts). Set
   *  for LLM-backed tools so MCP introspection + token-ledger reports
   *  can cross-reference. Plain CRUD tools leave this undefined. */
  useCase?: string;
  /** Loose shape hint for the request payload — keys → type strings.
   *  Replace with a Zod schema reference under #1624's `variables`
   *  follow-on once schemas live in shared. */
  requestSchema?: Record<string, string>;
  /** Loose shape hint for the response payload. Same upgrade path as
   *  `requestSchema`. */
  responseSchema?: Record<string, string>;
}

/** Substitute `:param` placeholders in an endpoint with values from
 *  `params`. Throws when a placeholder has no value supplied so a typo
 *  at a call site fails loudly rather than hitting `:id` literally. */
export function buildEndpointUrl(
  endpoint: string,
  params: Record<string, string | number> = {},
): string {
  return endpoint.replace(/:([a-zA-Z][a-zA-Z0-9_]*)/g, (_match, key) => {
    const value = params[key];
    if (value === undefined || value === null || value === "") {
      throw new Error(
        `[ai-tools] Endpoint "${endpoint}" requires param ":${key}" — none supplied.`,
      );
    }
    return encodeURIComponent(String(value));
  });
}
