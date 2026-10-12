/**
 * MCP descriptor builders — pure functions that project the shared AI
 * registries (prompts + tools) into Model Context Protocol shapes
 * (#1620). The registries are the single source of truth; these
 * builders are the only translation layer, so an external agent sees
 * exactly what the in-app brain sees.
 *
 * No I/O — every function here is a pure transform, exercised directly
 * in shared/__tests__/mcp-descriptors.test.ts.
 */

import { PROMPTS, PROMPT_IDS } from "../ai-prompts/index.js";
import type { PromptArgument } from "../ai-prompts/index.js";
import { TOOLS, TOOL_IDS } from "../ai-tools/index.js";

/** MCP protocol revision we implement. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const MCP_SERVER_INFO = {
  name: "hired.video",
  title: "hired.video AI Brain",
  version: "0.1.0",
} as const;

/** Capabilities advertised in the `initialize` result. Tools +
 *  resources are listChanged:false (static registry); execution
 *  (`tools/call`, `resources/read`) is tracked as the #1620 remainder. */
export const MCP_CAPABILITIES = {
  prompts: { listChanged: false },
  tools: { listChanged: false },
  resources: { listChanged: false, subscribe: false },
} as const;

// ── Tools ──────────────────────────────────────────────────────────────

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  /** Non-standard hint block — surfaces the concrete REST endpoint +
   *  page contexts so a client (or our own proxy) can route a call. */
  _meta: {
    endpoint: string;
    method: string;
    requiresAuth: boolean;
    contextTypes: string[];
  };
}

/** Map the loose `requestSchema` string hints to a JSON-Schema-ish
 *  property block. Until the registry carries real Zod schemas (#1623
 *  follow-on) every field is typed `string` with the hint as its
 *  description. */
function toInputSchema(
  requestSchema: Record<string, string> | undefined,
): McpTool["inputSchema"] {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const [key, hint] of Object.entries(requestSchema ?? {})) {
    properties[key] = { type: "string", description: hint };
  }
  return { type: "object", properties };
}

export function buildMcpTools(): McpTool[] {
  return TOOL_IDS.map((id) => {
    const tool = TOOLS[id];
    return {
      name: tool.id,
      description: tool.description,
      inputSchema: toInputSchema(tool.requestSchema),
      _meta: {
        endpoint: tool.endpoint,
        method: tool.method,
        requiresAuth: tool.requiresAuth,
        contextTypes: tool.contextTypes,
      },
    };
  });
}

// ── Prompts ────────────────────────────────────────────────────────────

export interface McpPrompt {
  name: string;
  description: string;
  arguments: PromptArgument[];
}

export function buildMcpPrompts(): McpPrompt[] {
  return PROMPT_IDS.map((id) => ({
    name: PROMPTS[id].id,
    description: PROMPTS[id].description,
    arguments: PROMPTS[id].arguments ?? [],
  }));
}

export interface McpPromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

export interface McpGetPromptResult {
  description: string;
  messages: McpPromptMessage[];
}

/** Render a prompt by id with the supplied arguments. Throws on unknown
 *  id (caller maps to a JSON-RPC INVALID_PARAMS). The rendered system
 *  prompt is returned as a single `user`-role text message — MCP has no
 *  dedicated system role, and clients prepend prompt messages as
 *  context, which is the intended use. */
export function renderMcpPrompt(
  name: string,
  args: Record<string, unknown> = {},
): McpGetPromptResult {
  const prompt = (PROMPTS as Record<string, (typeof PROMPTS)[keyof typeof PROMPTS]>)[name];
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  // render signatures vary per prompt; the protocol boundary passes the
  // raw args object through (missing optionals render their defaults).
  const text = (prompt.render as (vars: Record<string, unknown>) => string)(args);
  return {
    description: prompt.description,
    messages: [{ role: "user", content: { type: "text", text } }],
  };
}

// ── Resource templates ───────────────────────────────────────────────────

export interface McpResourceTemplate {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
}

/** Project the GET tools that take a `:param` into MCP resource
 *  templates (`hired://<tool-id>/{param}`). List/collection GETs and
 *  mutating verbs are excluded — resources are read-addressable
 *  entities, not actions. */
export function buildMcpResourceTemplates(): McpResourceTemplate[] {
  return TOOL_IDS.map((id) => TOOLS[id])
    .filter((tool) => tool.method === "GET" && tool.endpoint.includes(":"))
    .map((tool) => {
      const paramNames = [...tool.endpoint.matchAll(/:([a-zA-Z][a-zA-Z0-9_]*)/g)].map(
        (m) => m[1],
      );
      const uriTemplate = `hired://${tool.id}/${paramNames.map((p) => `{${p}}`).join("/")}`;
      return {
        uriTemplate,
        name: tool.id,
        description: tool.description,
        mimeType: "application/json",
      };
    });
}
