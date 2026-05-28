/**
 * Minimal JSON-RPC 2.0 envelope helpers for the MCP server (#1620).
 *
 * We implement the protocol directly rather than pulling
 * `@modelcontextprotocol/sdk` — the API runs on Cloudflare Workers and
 * the SDK's transport layer assumes a Node server. The wire format is
 * small and stable, so a hand-rolled envelope keeps the Worker bundle
 * lean and avoids a runtime-compat risk.
 */

/** JSON-RPC request id — string, number, or null per spec. */
export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

/** Standard JSON-RPC 2.0 error codes (plus MCP convention). */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

export function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

/** Validate that an unknown body is a well-formed JSON-RPC 2.0 request.
 *  Returns the typed request or a descriptive error string. */
export function parseJsonRpcRequest(
  body: unknown,
): { ok: true; request: JsonRpcRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (b.jsonrpc !== "2.0") {
    return { ok: false, error: 'Missing or invalid "jsonrpc": must be "2.0"' };
  }
  if (typeof b.method !== "string" || b.method.length === 0) {
    return { ok: false, error: 'Missing or invalid "method"' };
  }
  if (
    b.params !== undefined &&
    (typeof b.params !== "object" || b.params === null || Array.isArray(b.params))
  ) {
    return { ok: false, error: '"params" must be an object when present' };
  }
  return {
    ok: true,
    request: {
      jsonrpc: "2.0",
      id: (b.id ?? null) as JsonRpcId,
      method: b.method,
      params: b.params as Record<string, unknown> | undefined,
    },
  };
}

/** A request with no `id` is a notification — the server must not reply.
 *  (JSON-RPC 2.0 §4.1) */
export function isNotification(request: JsonRpcRequest): boolean {
  return request.id === undefined || request.id === null;
}
