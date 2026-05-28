/**
 * Route-level tests for the MCP JSON-RPC server (gap #1620).
 *
 * Exercises the `mcpRoutes` Hono instance directly via `.request()` —
 * this covers the method-dispatch in mcp.ts (initialize / ping /
 * tools-list / prompts-get / errors / notifications / unknown method)
 * that the pure shared/mcp descriptor tests don't reach. Auth middleware
 * is applied at the app level, so hitting the sub-app directly tests the
 * protocol handler in isolation.
 *
 * Run: node --import tsx --test src/routes/__tests__/mcp-route.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mcpRoutes } from "../mcp.js";

async function rpc(body: unknown): Promise<{ status: number; json: any }> {
  const res = await mcpRoutes.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

describe("MCP route — initialize", () => {
  it("returns protocolVersion + capabilities + serverInfo", async () => {
    const { status, json } = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize" });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.jsonrpc, "2.0");
    assert.strictEqual(json.id, 1);
    assert.ok(json.result.protocolVersion);
    assert.ok(json.result.capabilities.tools);
    assert.ok(json.result.capabilities.prompts);
    assert.strictEqual(json.result.serverInfo.name, "hired.video");
  });
});

describe("MCP route — discovery", () => {
  it("ping returns an empty result", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 2, method: "ping" });
    assert.deepStrictEqual(json.result, {});
  });

  it("tools/list returns the tool catalog", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    assert.ok(Array.isArray(json.result.tools));
    assert.ok(json.result.tools.length >= 17);
    assert.ok(json.result.tools.every((t: any) => typeof t.name === "string" && t.inputSchema));
  });

  it("prompts/list returns the prompt catalog with arguments", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 4, method: "prompts/list" });
    assert.ok(Array.isArray(json.result.prompts));
    const coach = json.result.prompts.find((p: any) => p.name === "career-coach");
    assert.ok(coach);
    assert.ok(Array.isArray(coach.arguments));
  });

  it("resources/templates/list returns hired:// templates", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 5, method: "resources/templates/list" });
    assert.ok(Array.isArray(json.result.resourceTemplates));
    assert.ok(json.result.resourceTemplates.every((r: any) => r.uriTemplate.startsWith("hired://")));
  });
});

describe("MCP route — prompts/get", () => {
  it("renders a prompt with arguments into a user message", async () => {
    const { json } = await rpc({
      jsonrpc: "2.0",
      id: 6,
      method: "prompts/get",
      params: { name: "career-coach", arguments: { role: "recruiter" } },
    });
    assert.strictEqual(json.result.messages[0].role, "user");
    assert.ok(json.result.messages[0].content.text.includes("recruiter"));
  });

  it("errors with INVALID_PARAMS on a missing name", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 7, method: "prompts/get", params: {} });
    assert.strictEqual(json.error.code, -32602);
  });

  it("errors with INVALID_PARAMS on an unknown prompt", async () => {
    const { json } = await rpc({
      jsonrpc: "2.0",
      id: 8,
      method: "prompts/get",
      params: { name: "nope" },
    });
    assert.strictEqual(json.error.code, -32602);
  });
});

describe("MCP route — execution stubs", () => {
  it("tools/call returns a spec-shaped isError result pointing at the REST endpoint", async () => {
    const { json } = await rpc({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "resume-optimize", arguments: {} },
    });
    assert.strictEqual(json.result.isError, true);
    assert.ok(json.result.content[0].text.includes("/api/resumeoptimizer/optimize"));
  });
});

describe("MCP route — protocol errors", () => {
  it("unknown method → METHOD_NOT_FOUND", async () => {
    const { json } = await rpc({ jsonrpc: "2.0", id: 10, method: "does/not/exist" });
    assert.strictEqual(json.error.code, -32601);
  });

  it("non-2.0 envelope → INVALID_REQUEST (400)", async () => {
    const { status, json } = await rpc({ jsonrpc: "1.0", id: 11, method: "ping" });
    assert.strictEqual(status, 400);
    assert.strictEqual(json.error.code, -32600);
  });

  it("malformed JSON → PARSE_ERROR (400)", async () => {
    const res = await mcpRoutes.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    assert.strictEqual(res.status, 400);
    const json = (await res.json()) as any;
    assert.strictEqual(json.error.code, -32700);
  });

  it("a notification (no id) gets a 202 with no body", async () => {
    const res = await mcpRoutes.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    assert.strictEqual(res.status, 202);
    const text = await res.text();
    assert.strictEqual(text, "");
  });
});

describe("MCP route — GET probe", () => {
  it("GET returns transport info instead of 404", async () => {
    const res = await mcpRoutes.request("/", { method: "GET" });
    assert.strictEqual(res.status, 200);
    const json = (await res.json()) as any;
    assert.strictEqual(json.server.name, "hired.video");
  });
});
