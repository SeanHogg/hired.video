/**
 * #375 — the one-bullet wands (`add_bullet_metric`, `strengthen_bullet_verbs`)
 * behind `POST /api/resumeoptimizer/rewrite-bullet`.
 *   1. `rewriteBullet` sends the lens's prompt under a per-mode feature key,
 *      returns the validated `{ improved }`, and lets a malformed model answer
 *      or a gateway failure surface (the route turns it into aiFailure).
 *   2. The route is paid AI: Pro first, then the token budget, then the
 *      body check — an anonymous call is refused before anything runs.
 *
 * Run: node --import tsx --test src/services/resume/__tests__/rewrite-bullet.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import type {
  LenientIngest,
  LLMCallOpts,
  LLMClient,
  LLMMessagesOptions,
  LLMOptions,
  LLMResult,
  LLMUsage,
} from "../../adapters/llm-client.js";
import { BULLET_REWRITE_PROMPTS, rewriteBullet } from "../rewrite-bullet.js";
import { RewriteBulletRequestSchema } from "../../../../../shared/tool-schemas.js";
import { resumeOptimizerRoutes } from "../../../routes/resume-optimizer.js";

const USAGE: LLMUsage = { promptTokens: 212, completionTokens: 38, totalTokens: 250, model: "stub/model" };

interface Call {
  featureKey: string;
  options: LLMOptions;
}

/** A gateway stand-in: answers `callJson` with `answer` run through the
 *  caller's schema (as the real client does), or throws `failure`. */
function stubLlm(answer: unknown, failure?: Error): { llm: LLMClient; calls: Call[] } {
  const calls: Call[] = [];
  const llm: LLMClient = {
    async callJson<T>(featureKey: string, options: LLMOptions, schema: z.ZodType<T>, _opts?: LLMCallOpts) {
      calls.push({ featureKey, options });
      if (failure) throw failure;
      return { data: schema.parse(answer), usage: USAGE };
    },
    async callJsonLenient<Wire, Canonical>(
      _k: string,
      _o: LLMOptions,
      _s: LenientIngest<Wire, Canonical>,
      _opts?: LLMCallOpts,
    ): Promise<{ data: Canonical; usage: LLMUsage }> {
      throw new Error("rewriteBullet must use callJson");
    },
    async callText(_k: string, _o: LLMOptions, _opts?: LLMCallOpts): Promise<{ content: string; usage: LLMUsage }> {
      throw new Error("rewriteBullet must use callJson");
    },
    async callMessages(_k: string, _o: LLMMessagesOptions, _opts?: LLMCallOpts): Promise<LLMResult> {
      throw new Error("rewriteBullet must use callJson");
    },
  };
  return { llm, calls };
}

const WEAK = "Responsible for vendor management across 12 contracts";

describe("rewriteBullet", () => {
  it("metric lens: placeholder outcome comes back validated, under its own feature key", async () => {
    const { llm, calls } = stubLlm({ improved: "Cut vendor spend [N]% by renegotiating 12 contracts" });
    const out = await rewriteBullet(llm, WEAK, "metric");
    assert.deepEqual(out, { improved: "Cut vendor spend [N]% by renegotiating 12 contracts" });
    assert.equal(calls[0].featureKey, "resume_rewrite_bullet_metric");
    assert.equal(calls[0].options.systemPrompt, BULLET_REWRITE_PROMPTS.metric);
    assert.match(calls[0].options.userMessage, /^Bullet: Responsible for vendor management across 12 contracts\n/);
  });

  it("verbs lens uses its own prompt and key", async () => {
    const { llm, calls } = stubLlm({ improved: "Managed 12 vendor contracts end to end" });
    await rewriteBullet(llm, WEAK, "verbs");
    assert.equal(calls[0].featureKey, "resume_rewrite_bullet_verbs");
    assert.equal(calls[0].options.systemPrompt, BULLET_REWRITE_PROMPTS.verbs);
  });

  it("both prompts forbid invented numbers and demand the JSON shape", () => {
    for (const prompt of Object.values(BULLET_REWRITE_PROMPTS)) {
      assert.match(prompt, /Do NOT invent employers, tools, team sizes, outcomes or numbers/);
      assert.match(prompt, /\{ "improved": "<the rewritten bullet>" \}/);
    }
    assert.match(BULLET_REWRITE_PROMPTS.metric, /\[N\]%/);
  });

  it("an empty or over-long model answer is rejected, not returned", async () => {
    await assert.rejects(rewriteBullet(stubLlm({ improved: "" }).llm, WEAK, "verbs"));
    await assert.rejects(rewriteBullet(stubLlm({ improved: "x".repeat(601) }).llm, WEAK, "verbs"));
    await assert.rejects(rewriteBullet(stubLlm({ rewritten: "Led vendor management" }).llm, WEAK, "verbs"));
  });

  it("a gateway failure propagates to the route", async () => {
    const { llm } = stubLlm(null, new Error("All providers failed"));
    await assert.rejects(rewriteBullet(llm, WEAK, "metric"), /All providers failed/);
  });
});

describe("RewriteBulletRequestSchema — the route's body check", () => {
  it("accepts a bullet and a known lens", () => {
    assert.ok(RewriteBulletRequestSchema.safeParse({ original: WEAK, mode: "metric" }).success);
  });
  it("rejects an empty bullet, an over-long one and an unknown lens", () => {
    assert.equal(RewriteBulletRequestSchema.safeParse({ original: "", mode: "metric" }).success, false);
    assert.equal(RewriteBulletRequestSchema.safeParse({ original: "x".repeat(2001), mode: "verbs" }).success, false);
    assert.equal(RewriteBulletRequestSchema.safeParse({ original: WEAK, mode: "shorten" }).success, false);
  });
});

describe("POST /rewrite-bullet — paid AI gates", () => {
  it("is gated by Pro, then the token budget, in that order", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "..", "..", "..", "routes", "resume-optimizer.ts"), "utf8");
    assert.match(
      src,
      /resumeOptimizerRoutes\.post\("\/rewrite-bullet", requirePro\("Resume wands"\), requireTokenBudget\(\), async/,
    );
  });

  it("refuses an anonymous call with 401 before reading the body", async () => {
    const res = await resumeOptimizerRoutes.request("/rewrite-bullet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ original: WEAK, mode: "metric" }),
    });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
  });
});
