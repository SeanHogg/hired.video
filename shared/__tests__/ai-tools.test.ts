/**
 * Locks the AI tool registry shape:
 * - every id is kebab-case + unique
 * - every entry's `id` matches its registry key
 * - every endpoint starts with /api/ and the pre-`:param` segment is
 *   lowercase (Hono mounts in app.ts are lowercase + case-sensitive)
 * - every entry declares at least one contextType + one supportedAction
 * - getTool throws on unknown ids; getToolsForContext / getToolsByAction
 *   return the expected shape
 * - buildEndpointUrl substitutes `:param` placeholders and throws on
 *   missing params
 *
 * Run: node --import tsx --test shared/__tests__/ai-tools.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  TOOLS,
  TOOL_IDS,
  aiToolPath,
  buildEndpointUrl,
  isAiToolId,
  getTool,
  getToolsByAction,
  getToolsForContext,
} from "../ai-tools/index.js";

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

describe("ai-tools registry", () => {
  it("every tool id matches its registry key", () => {
    for (const id of TOOL_IDS) {
      assert.strictEqual(TOOLS[id].id, id, `id mismatch for "${id}"`);
    }
  });

  it("every tool id is kebab-case", () => {
    for (const id of TOOL_IDS) {
      assert.match(id, KEBAB, `tool id "${id}" is not kebab-case`);
    }
  });

  it("registry ids are unique", () => {
    const set = new Set(TOOL_IDS);
    assert.strictEqual(set.size, TOOL_IDS.length, "duplicate tool id detected");
  });

  it("every endpoint starts with /api/ and is lowercase before any :param", () => {
    for (const id of TOOL_IDS) {
      const tool = TOOLS[id];
      assert.ok(
        tool.endpoint.startsWith("/api/"),
        `tool "${id}" endpoint "${tool.endpoint}" does not start with /api/`,
      );
      const pathOnly = tool.endpoint.split(":")[0];
      assert.strictEqual(
        pathOnly,
        pathOnly.toLowerCase(),
        `tool "${id}" path segment "${pathOnly}" must be lowercase (Hono routes are case-sensitive)`,
      );
    }
  });

  it("tools served by the AI dispatcher use aiToolPath(id)", () => {
    for (const id of TOOL_IDS.filter(isAiToolId)) {
      assert.strictEqual(TOOLS[id].endpoint, aiToolPath(id), `tool "${id}" must call the dispatcher`);
    }
    assert.strictEqual(TOOLS["resume-score"].endpoint, "/api/ai/tools/resume-score");
  });

  it("every tool declares at least one contextType + supportedAction", () => {
    for (const id of TOOL_IDS) {
      const tool = TOOLS[id];
      assert.ok(
        tool.contextTypes.length > 0,
        `tool "${id}" has no contextTypes`,
      );
      assert.ok(
        tool.supportedActions.length > 0,
        `tool "${id}" has no supportedActions`,
      );
      assert.ok(
        tool.description.length > 0,
        `tool "${id}" has empty description`,
      );
    }
  });

  it("getTool returns the registered reference and throws on miss", () => {
    for (const id of TOOL_IDS) {
      assert.strictEqual(getTool(id), TOOLS[id]);
    }
    assert.throws(() => getTool("not-a-real-tool"), /Unknown tool id/);
  });

  it("getToolsForContext returns all and only tools that opt into the context", () => {
    const resumeEdit = getToolsForContext("resume-edit");
    assert.ok(
      resumeEdit.some((t) => t.id === "resume-optimize"),
      "expected resume-optimize in resume-edit context",
    );
    for (const t of resumeEdit) {
      assert.ok(
        t.contextTypes.includes("resume-edit"),
        `tool "${t.id}" returned for resume-edit but doesn't declare it`,
      );
    }
  });

  it("getToolsByAction filters by action label", () => {
    const optimizers = getToolsByAction("optimize-content");
    assert.ok(optimizers.length > 0);
    for (const t of optimizers) {
      assert.ok(t.supportedActions.includes("optimize-content"));
    }
    assert.deepStrictEqual(getToolsByAction("never-supported"), []);
  });

  it("buildEndpointUrl substitutes :param placeholders", () => {
    assert.strictEqual(
      buildEndpointUrl("/api/resumes/:id", { id: "abc" }),
      "/api/resumes/abc",
    );
    assert.strictEqual(
      buildEndpointUrl("/api/task/:id", { id: "task-1" }),
      "/api/task/task-1",
    );
  });

  it("buildEndpointUrl url-encodes param values", () => {
    assert.strictEqual(
      buildEndpointUrl("/api/users/:id", { id: "a/b c" }),
      "/api/users/a%2Fb%20c",
    );
  });

  it("buildEndpointUrl throws when a :param has no value", () => {
    assert.throws(
      () => buildEndpointUrl("/api/resumes/:id", {}),
      /requires param ":id"/,
    );
  });

  it("buildEndpointUrl leaves paths without placeholders untouched", () => {
    assert.strictEqual(
      buildEndpointUrl("/api/resumes?owner=me&include=ownership"),
      "/api/resumes?owner=me&include=ownership",
    );
  });
});
