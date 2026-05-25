/**
 * AI billing-coverage guard — gap #429.
 *
 * Static check: every `routes/*.ts` source file that invokes the LLM
 * client (`callJson` / `callRaw` / `callLLMWithUsage`) MUST pair the
 * call with a `useCase` string. The LLM client funnels every call
 * through `recordTokenUsage` keyed on `useCase` (see #428), so the
 * presence of `useCase` is the structural invariant that proves the
 * route charges tokens.
 *
 * This test is intentionally LINT-y rather than runtime: each AI route
 * has its own auth + request shape and standing up a runtime fixture
 * for all 18 routes would dwarf the value. A drift here means a
 * contributor wired a new tool the old (un-metered) way — the test
 * fires immediately, before the leak ships.
 *
 * If you legitimately add a new LLM-touching route that handles its
 * own metering, append it to ALLOWLISTED_RAW_LLM_FILES below with the
 * justification.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = join(__dirname, "..", "..", "routes");

/** Files allowed to call the LLM without a `useCase` (because they
 *  charge tokens via a different code path). Empty by default — every
 *  current route uses the standard `callJson({ useCase, ... })` shape. */
const ALLOWLISTED_RAW_LLM_FILES: Set<string> = new Set([]);

const LLM_CALL_PATTERN = /\b(callJson|callRaw|callLLMWithUsage)\s*\(/g;
const USE_CASE_PATTERN = /useCase\s*:/;

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...listRouteFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

describe("AI billing coverage", () => {
  it("every LLM call site in routes/* pairs the call with a `useCase` so token usage is metered", () => {
    const offenders: string[] = [];

    for (const file of listRouteFiles(ROUTES_DIR)) {
      const fileName = file.split(/[\\/]/).pop()!;
      if (ALLOWLISTED_RAW_LLM_FILES.has(fileName)) continue;

      const source = readFileSync(file, "utf8");
      const llmHits = source.match(LLM_CALL_PATTERN);
      if (!llmHits) continue;

      // Heuristic: for each `callJson(...)` site, ensure a `useCase:`
      // appears within the next ~600 characters. We don't need an AST
      // — the calls are syntactically uniform: `llm.callJson("slug",
      // { useCase: "...", ... })`.
      LLM_CALL_PATTERN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = LLM_CALL_PATTERN.exec(source)) !== null) {
        const window = source.slice(m.index, m.index + 600);
        if (!USE_CASE_PATTERN.test(window)) {
          offenders.push(`${fileName}:${m.index} — ${m[1]}(...) without an adjacent useCase`);
        }
      }
    }

    expect(
      offenders.length,
      `Found ${offenders.length} LLM call site(s) missing a \`useCase\` — these calls won't be metered and will silently re-introduce the billing leak fixed in #428:\n${offenders.map((o) => `  • ${o}`).join("\n")}\n\nWrap each via \`llm.callJson("<slug>", { useCase: "<feature_key>", ... })\` or add the file to ALLOWLISTED_RAW_LLM_FILES with justification.`,
    ).toBe(0);
  });
});
