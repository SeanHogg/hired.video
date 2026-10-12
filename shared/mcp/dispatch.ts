/**
 * MCP `tools/call` dispatcher (gap #1620 — execution half).
 *
 * Pure function: takes a tool descriptor (`endpoint`, `method`) plus the
 * caller's `arguments` object and projects them into a `{ url, init }`
 * pair suitable for `Hono.app.request(url, init)` re-entry.
 *
 * Why re-entry vs outbound fetch:
 *   - On Cloudflare Workers, calling `fetch()` against the same hostname
 *     loops back through the edge → subrequest budget + extra latency.
 *   - `Hono.app.request()` runs the handler chain in-process, no
 *     subrequest consumed, no network round-trip. Auth header forwarded
 *     verbatim so the tool runs with the caller's identity (token-ledger
 *     billing, workspace scope, RBAC all stay correct).
 *
 * Arg mapping rules:
 *   - Path placeholders (`:id`, `:userId`, …) consumed first; missing
 *     placeholder values throw before re-entry so we don't issue a
 *     half-built URL.
 *   - For GET / DELETE / HEAD: remaining args become query params
 *     (non-string values JSON-stringified).
 *   - For POST / PUT / PATCH: remaining args become the JSON body.
 *
 * Result wrapping is the caller's responsibility — the MCP response shape
 * is `{ content: [{ type, text }], isError }` and depends on the
 * tool's response Content-Type.
 *
 * Pure (no DOM, no fetch, no Hono import) so it lives in shared/ and is
 * exercised by `shared/__tests__/mcp-dispatch.test.ts` without standing
 * up a server.
 */

export interface DispatchRequest {
  /** Path + query string ready to hand to `app.request(url, init)`. */
  url: string;
  init: RequestInit;
}

export interface DispatchInput {
  /** Tool's REST endpoint template, e.g. `/api/resumes/:id`. */
  endpoint: string;
  /** HTTP method (GET / POST / PUT / PATCH / DELETE). */
  method: string;
  /** User-supplied arguments — path params, query, body all merged in
   *  one object per the MCP `tools/call` request shape. */
  args: Record<string, unknown>;
  /** Bearer token forwarded so the tool runs scoped to the caller's
   *  identity. May be undefined when the tool's `requiresAuth=false`. */
  authorization?: string;
}

const PATH_PARAM_RE = /:([a-zA-Z][a-zA-Z0-9_]*)/g;

/** Methods that carry a JSON request body vs methods that fold remaining
 *  args into the query string. */
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export function buildDispatchRequest(input: DispatchInput): DispatchRequest {
  const method = input.method.toUpperCase();
  const args = { ...input.args };

  // 1) Walk path placeholders, consume matching args, throw on miss.
  const path = input.endpoint.replace(PATH_PARAM_RE, (_full, name: string) => {
    const value = args[name];
    if (value === undefined || value === null || value === "") {
      throw new Error(
        `tool dispatch: missing required path parameter "${name}" for ${input.endpoint}`,
      );
    }
    delete args[name];
    return encodeURIComponent(String(value));
  });

  const headers: Record<string, string> = {};
  if (input.authorization) {
    headers["Authorization"] = input.authorization;
  }

  // 2) Split remaining args into either query string or JSON body
  //    depending on the verb.
  let url = path;
  let body: string | undefined;

  if (BODY_METHODS.has(method)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(args);
  } else {
    const remaining = Object.entries(args).filter(([, v]) => v !== undefined);
    if (remaining.length > 0) {
      const qs = new URLSearchParams();
      for (const [k, v] of remaining) {
        qs.set(k, typeof v === "string" ? v : JSON.stringify(v));
      }
      url = `${path}${path.includes("?") ? "&" : "?"}${qs.toString()}`;
    }
  }

  // app.request() accepts relative URLs since Hono v3; we keep paths
  // unconditionally absolute by prefixing a synthetic origin so callers
  // that pass the result to `new Request()` directly don't fail with
  // "Invalid URL". The Worker's own request handler ignores the host.
  const fullUrl = url.startsWith("http")
    ? url
    : `http://internal.mcp${url.startsWith("/") ? "" : "/"}${url}`;

  return {
    url: fullUrl,
    init: {
      method,
      headers,
      body,
    },
  };
}

/** Map a `hired://<tool-id>/{params…}` resource URI back to a tool
 *  invocation. Returns the tool id + the parsed path params, suitable
 *  for plugging into `buildDispatchRequest` after the caller looks up
 *  the tool's endpoint template. */
export function parseHiredResourceUri(
  uri: string,
): { toolId: string; pathParams: string[] } | null {
  if (!uri.startsWith("hired://")) return null;
  const rest = uri.slice("hired://".length);
  const segments = rest.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const [toolId, ...pathParams] = segments;
  return { toolId, pathParams };
}
