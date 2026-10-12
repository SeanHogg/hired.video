import { Hono } from "hono";
import type { Context } from "hono";
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
import {
  buildDispatchRequest,
  parseHiredResourceUri,
} from "../../../shared/mcp/dispatch.js";

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
 * Implemented this pass (discovery + prompt rendering + execution, all
 * derived from the shared registries so there is zero drift from the
 * in-app brain):
 *   initialize · ping · notifications/initialized
 *   tools/list · prompts/list · prompts/get · resources/templates/list
 *   tools/call · resources/read
 *
 * Execution dispatches via Hono `app.request()` re-entry — the route
 * mount in app.ts stows the app instance on c.var, then `executeToolCall`
 * builds a `{url,init}` pair from the tool's endpoint + the caller's
 * arguments (path params consumed first, remainder fold into query string
 * for GET/DELETE or JSON body for POST/PUT/PATCH) and re-enters the same
 * router. The caller's Authorization header is forwarded verbatim so
 * token-ledger billing + workspace scope stay correct.
 *
 * SSE streaming mode is the next remainder — today this only ships the
 * JSON response transport.
 */
export const mcpRoutes = new Hono<AppEnv>();

/** Execute a tool via Hono in-process re-entry. The app instance was
 *  stowed on c.var by the middleware in app.ts so we don't take a
 *  circular dep on createApp() here. Auth header is forwarded so the
 *  tool runs scoped to the caller's identity (token-ledger bills
 *  against the same user). */
async function executeToolCall(
  c: Context,
  toolName: string,
  args: Record<string, unknown>,
) {
  const tool = buildMcpTools().find((t) => t.name === toolName);
  if (!tool) {
    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }
  // The middleware that mounts this route block stores `app` on c.var.
  // Without it we have no way to re-enter the router.
  const app = (c.get as (key: string) => unknown)("app") as
    | { request: (url: string, init?: RequestInit) => Promise<Response> }
    | undefined;
  if (!app || typeof app.request !== "function") {
    return {
      content: [
        {
          type: "text" as const,
          text: "MCP dispatch unavailable in this isolate (app reference missing).",
        },
      ],
      isError: true,
    };
  }
  let dispatch;
  try {
    dispatch = buildDispatchRequest({
      endpoint: tool._meta.endpoint,
      method: tool._meta.method,
      args,
      authorization: c.req.header("Authorization") ?? undefined,
    });
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: err instanceof Error ? err.message : String(err),
        },
      ],
      isError: true,
    };
  }
  let response: Response;
  try {
    response = await app.request(dispatch.url, dispatch.init);
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            "Tool dispatch failed: " +
            (err instanceof Error ? err.message : String(err)),
        },
      ],
      isError: true,
    };
  }
  const text = await response.text();
  // Surface non-2xx as isError so the caller knows the route refused
  // even though we returned a content payload they can inspect.
  return {
    content: [{ type: "text" as const, text }],
    isError: !response.ok,
    _meta: {
      status: response.status,
      contentType: response.headers.get("content-type"),
    },
  };
}

async function handleMethod(
  c: Context,
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
      const name = typeof params?.name === "string" ? params.name : "";
      if (!name) {
        return jsonRpcError(
          id,
          JSON_RPC_ERRORS.INVALID_PARAMS,
          'tools/call requires a "name" param',
        );
      }
      const toolArgs =
        params?.arguments && typeof params.arguments === "object"
          ? (params.arguments as Record<string, unknown>)
          : {};
      const result = await executeToolCall(c, name, toolArgs);
      return jsonRpcResult(id, result);
    }

    case "resources/read": {
      const uri = typeof params?.uri === "string" ? params.uri : "";
      if (!uri) {
        return jsonRpcError(
          id,
          JSON_RPC_ERRORS.INVALID_PARAMS,
          'resources/read requires a "uri" param',
        );
      }
      const parsed = parseHiredResourceUri(uri);
      if (!parsed) {
        return jsonRpcError(
          id,
          JSON_RPC_ERRORS.INVALID_PARAMS,
          `Unsupported resource URI scheme: ${uri}`,
        );
      }
      // Resource URIs project to GET tools with `:param` placeholders.
      // The template's path params come in URI order; we name them via
      // the matching tool's endpoint pattern.
      const tool = buildMcpTools().find((t) => t.name === parsed.toolId);
      if (!tool) {
        return jsonRpcError(
          id,
          JSON_RPC_ERRORS.INVALID_PARAMS,
          `Unknown resource tool: ${parsed.toolId}`,
        );
      }
      const paramNames = [...tool._meta.endpoint.matchAll(/:([a-zA-Z][a-zA-Z0-9_]*)/g)].map(
        (m) => m[1],
      );
      const args: Record<string, unknown> = {};
      paramNames.forEach((n, i) => {
        if (parsed.pathParams[i] !== undefined) args[n] = parsed.pathParams[i];
      });
      const result = await executeToolCall(c, parsed.toolId, args);
      // Resource shape — return the raw text as a single resource entry
      // so MCP clients render it as the entity body. Status code drift
      // surfaces via `isError` from executeToolCall.
      return jsonRpcResult(id, {
        contents: [
          {
            uri,
            mimeType: result._meta?.contentType ?? "application/json",
            text: result.content[0]?.text ?? "",
          },
        ],
        isError: result.isError,
      });
    }

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

  const response = await handleMethod(
    c,
    request.id ?? null,
    request.method,
    request.params,
  );
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
