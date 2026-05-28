import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import {
  JSON_RPC_ERRORS,
  isNotification,
  jsonRpcError,
  jsonRpcResult,
  parseJsonRpcRequest,
  type JsonRpcId,
} from "../../../shared/mcp/jsonrpc.js";
import {
  MCP_CAPABILITIES,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  buildMcpPrompts,
  buildMcpResourceTemplates,
  buildMcpTools,
  renderMcpPrompt,
} from "../../../shared/mcp/descriptors.js";

/**
 * Model Context Protocol server (gap #1620) — exposes the hired.video AI
 * brain to external agents (Claude.ai, IDE assistants) over JSON-RPC 2.0
 * (the MCP Streamable HTTP transport, non-streaming JSON mode).
 *
 * Mounted at /api/mcp behind the default `authenticated` access mode in
 * app.ts, so a request carries the caller's existing JWT and is scoped
 * to that user. A dedicated per-user OAuth credential issued from
 * Settings → AI Integrations (revocable like a passkey) is the next
 * step — see the #1620 remainder in the gap register.
 *
 * Implemented this pass (discovery + prompt rendering, all derived from
 * the shared registries so there is zero drift from the in-app brain):
 *   initialize · ping · notifications/initialized
 *   tools/list · prompts/list · prompts/get · resources/templates/list
 *
 * `tools/call` + `resources/read` (execution) return a spec-shaped
 * isError result directing the caller to the REST endpoint that
 * `tools/list` already advertises — wiring real execution needs the
 * per-tool request context (auth, token ledger, DB) and is tracked as
 * the #1620 remainder.
 */
export const mcpRoutes = new Hono<AppEnv>();

function handleMethod(
  id: JsonRpcId,
  method: string,
  params: Record<string, unknown> | undefined,
) {
  switch (method) {
    case "initialize":
      return jsonRpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: MCP_CAPABILITIES,
        serverInfo: MCP_SERVER_INFO,
      });

    case "ping":
      return jsonRpcResult(id, {});

    case "tools/list":
      return jsonRpcResult(id, { tools: buildMcpTools() });

    case "prompts/list":
      return jsonRpcResult(id, { prompts: buildMcpPrompts() });

    case "prompts/get": {
      const name = typeof params?.name === "string" ? params.name : "";
      if (!name) {
        return jsonRpcError(
          id,
          JSON_RPC_ERRORS.INVALID_PARAMS,
          'prompts/get requires a "name" param',
        );
      }
      const args =
        params?.arguments && typeof params.arguments === "object"
          ? (params.arguments as Record<string, unknown>)
          : {};
      try {
        return jsonRpcResult(id, renderMcpPrompt(name, args));
      } catch (err) {
        return jsonRpcError(
          id,
          JSON_RPC_ERRORS.INVALID_PARAMS,
          err instanceof Error ? err.message : "Unknown prompt",
        );
      }
    }

    case "resources/list":
      // Concrete resources are addressed via templates (entity ids are
      // user-specific and not enumerable without a query); return empty.
      return jsonRpcResult(id, { resources: [] });

    case "resources/templates/list":
      return jsonRpcResult(id, {
        resourceTemplates: buildMcpResourceTemplates(),
      });

    case "tools/call": {
      const name = typeof params?.name === "string" ? params.name : "(unknown)";
      const tool = buildMcpTools().find((t) => t.name === name);
      const guidance = tool
        ? `Tool execution over MCP is not enabled yet. Call ${tool._meta.method} ${tool._meta.endpoint} directly with your bearer token.`
        : `Unknown tool: ${name}`;
      return jsonRpcResult(id, {
        content: [{ type: "text", text: guidance }],
        isError: true,
      });
    }

    case "resources/read":
      return jsonRpcResult(id, {
        contents: [],
        _meta: {
          note: "Resource reads over MCP are not enabled yet; fetch the REST endpoint from tools/list with your bearer token.",
        },
      });

    default:
      return jsonRpcError(
        id,
        JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        `Method not found: ${method}`,
      );
  }
}

mcpRoutes.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      jsonRpcError(null, JSON_RPC_ERRORS.PARSE_ERROR, "Invalid JSON body"),
      400,
    );
  }

  const parsed = parseJsonRpcRequest(body);
  // `in`-operator narrowing rather than the `ok` discriminant — the api
  // tsconfig runs with strictNullChecks off, where discriminated-union
  // narrowing on a boolean literal isn't reliable.
  if (!("request" in parsed)) {
    return c.json(
      jsonRpcError(null, JSON_RPC_ERRORS.INVALID_REQUEST, parsed.error),
      400,
    );
  }

  const { request } = parsed;

  // Notifications (no id) get an ack with no body per JSON-RPC 2.0 §4.1.
  if (isNotification(request)) {
    return c.body(null, 202);
  }

  const response = handleMethod(request.id ?? null, request.method, request.params);
  return c.json(response);
});

// GET is used by some MCP clients to probe for SSE support. We only do
// the JSON response mode, so advertise that plainly rather than 404.
mcpRoutes.get("/", (c) =>
  c.json({
    server: MCP_SERVER_INFO,
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: "streamable-http (JSON response mode; SSE not supported)",
    hint: "POST JSON-RPC 2.0 requests to this endpoint.",
  }),
);
