/**
 * Tests for the MCP layer (#1620):
 * - JSON-RPC 2.0 envelope parsing + helpers
 * - descriptor builders project the shared registries into MCP shapes
 * - prompt rendering over MCP matches the registry
 *
 * Run: node --import tsx --test shared/__tests__/mcp.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  JSON_RPC_ERRORS,
  isNotification,
  jsonRpcError,
  jsonRpcResult,
  parseJsonRpcRequest,
} from "../mcp/jsonrpc.js";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  buildMcpPrompts,
  buildMcpResourceTemplates,
  buildMcpTools,
  renderMcpPrompt,
} from "../mcp/descriptors.js";
import { TOOL_IDS, TOOLS } from "../ai-tools/index.js";
import { PROMPT_IDS, PROMPTS } from "../ai-prompts/index.js";

describe("mcp/jsonrpc", () => {
  it("parses a well-formed request", () => {
    const r = parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.ok(r.ok);
    if (r.ok) {
      assert.strictEqual(r.request.method, "tools/list");
      assert.strictEqual(r.request.id, 1);
    }
  });

  it("rejects a non-2.0 envelope", () => {
    const r = parseJsonRpcRequest({ jsonrpc: "1.0", method: "x" });
    assert.ok(!r.ok);
  });

  it("rejects a missing method", () => {
    const r = parseJsonRpcRequest({ jsonrpc: "2.0", id: 1 });
    assert.ok(!r.ok);
  });

  it("rejects array params", () => {
    const r = parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "x", params: [] });
    assert.ok(!r.ok);
  });

  it("treats a missing/null id as a notification", () => {
    const r = parseJsonRpcRequest({ jsonrpc: "2.0", method: "notifications/initialized" });
    assert.ok(r.ok);
    if (r.ok) assert.strictEqual(isNotification(r.request), true);
  });

  it("a request with an id is not a notification", () => {
    const r = parseJsonRpcRequest({ jsonrpc: "2.0", id: 0, method: "ping" });
    assert.ok(r.ok);
    // id:0 is a valid id, not a notification
    if (r.ok) assert.strictEqual(isNotification(r.request), false);
  });

  it("result + error helpers carry the id", () => {
    assert.deepStrictEqual(jsonRpcResult(7, { ok: true }), {
      jsonrpc: "2.0",
      id: 7,
      result: { ok: true },
    });
    assert.deepStrictEqual(
      jsonRpcError(7, JSON_RPC_ERRORS.METHOD_NOT_FOUND, "nope"),
      { jsonrpc: "2.0", id: 7, error: { code: -32601, message: "nope" } },
    );
  });
});

describe("mcp/descriptors", () => {
  it("server info + protocol version are set", () => {
    assert.strictEqual(MCP_SERVER_INFO.name, "hired.video");
    assert.match(MCP_PROTOCOL_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("buildMcpTools exposes one entry per registry tool", () => {
    const tools = buildMcpTools();
    assert.strictEqual(tools.length, TOOL_IDS.length);
    for (const t of tools) {
      assert.ok(TOOLS[t.name], `MCP tool ${t.name} has no registry entry`);
      assert.strictEqual(t.inputSchema.type, "object");
      assert.ok(t._meta.endpoint.startsWith("/api/"));
      assert.ok(["GET", "POST", "PUT", "DELETE", "PATCH"].includes(t._meta.method));
    }
  });

  it("tool inputSchema reflects requestSchema hints", () => {
    const optimize = buildMcpTools().find((t) => t.name === "resume-optimize");
    assert.ok(optimize);
    assert.ok(optimize!.inputSchema.properties.resumeText);
  });

  it("buildMcpPrompts exposes one entry per registry prompt with arguments", () => {
    const prompts = buildMcpPrompts();
    assert.strictEqual(prompts.length, PROMPT_IDS.length);
    for (const p of prompts) {
      assert.ok(PROMPTS[p.name as keyof typeof PROMPTS], `MCP prompt ${p.name} has no registry entry`);
      assert.ok(Array.isArray(p.arguments));
    }
    const coach = prompts.find((p) => p.name === "career-coach");
    assert.ok(coach!.arguments.some((a) => a.name === "role"));
    const qgen = prompts.find((p) => p.name === "interview-question-generator");
    assert.ok(qgen!.arguments.some((a) => a.name === "type" && a.required === true));
  });

  it("renderMcpPrompt renders a registered prompt as a user message", () => {
    const out = renderMcpPrompt("career-coach", { name: "Sean", role: "recruiter" });
    assert.strictEqual(out.messages.length, 1);
    assert.strictEqual(out.messages[0].role, "user");
    assert.ok(out.messages[0].content.text.includes("Sean"));
    assert.ok(out.messages[0].content.text.includes("recruiter"));
  });

  it("renderMcpPrompt passes args to parameterized prompts", () => {
    const out = renderMcpPrompt("interview-question-generator", { type: "system-design", count: 7 });
    assert.ok(out.messages[0].content.text.includes("system-design interview"));
    assert.ok(out.messages[0].content.text.includes("exactly 7"));
  });

  it("renderMcpPrompt throws on unknown prompt", () => {
    assert.throws(() => renderMcpPrompt("nope"), /Unknown prompt/);
  });

  it("resource templates are only GET tools with :params", () => {
    const templates = buildMcpResourceTemplates();
    for (const t of templates) {
      const tool = TOOLS[t.name];
      assert.strictEqual(tool.method, "GET");
      assert.ok(tool.endpoint.includes(":"));
      assert.ok(t.uriTemplate.startsWith("hired://"));
      assert.ok(t.uriTemplate.includes("{"));
    }
    // resume-get / user-profile-get / task-get qualify; list endpoints don't
    assert.ok(templates.some((t) => t.name === "resume-get"));
    assert.ok(!templates.some((t) => t.name === "resume-list-mine"));
  });
});
