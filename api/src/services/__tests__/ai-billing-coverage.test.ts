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

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ESM-safe equivalent of CJS __dirname — the api package is ESM
// (`"type": "module"`) so the original `__dirname` reference threw.
const __dirname = dirname(fileURLToPath(import.meta.url));
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

      const rawSource = readFileSync(file, "utf8");
      // Pre-strip line + block comments so the regex doesn't fire on
      // prose references like `// see llm.callJson(...)`. Replaced with
      // same-length spaces so character offsets in error messages still
      // point at the right line for human debugging.
      const source = rawSource
        .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
      const llmHits = source.match(LLM_CALL_PATTERN);
      if (!llmHits) continue;

      // Heuristic: for each `callJson(...)` site, ensure a `useCase:`
      // appears within the next ~3000 characters. We don't need an AST
      // — the calls are syntactically uniform: `llm.callJson("slug",
      // { useCase: "...", ... })`. The window must comfortably exceed
      // a long template-literal `userMessage` + `systemPrompt` (the
      // dashboard insights call clocks in around 1.2 KB of literals
      // before reaching `useCase`); 3000 chars covers every legitimate
      // call shape in routes/* today while still being tight enough to
      // catch a truly unmetered callsite.
      LLM_CALL_PATTERN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = LLM_CALL_PATTERN.exec(source)) !== null) {
        const window = source.slice(m.index, m.index + 3000);
        if (!USE_CASE_PATTERN.test(window)) {
          offenders.push(`${fileName}:${m.index} — ${m[1]}(...) without an adjacent useCase`);
        }
      }
    }

    assert.equal(
      offenders.length,
      0,
      `Found ${offenders.length} LLM call site(s) missing a \`useCase\` — these calls won't be metered and will silently re-introduce the billing leak fixed in #428:\n${offenders.map((o) => `  • ${o}`).join("\n")}\n\nWrap each via \`llm.callJson("<slug>", { useCase: "<feature_key>", ... })\` or add the file to ALLOWLISTED_RAW_LLM_FILES with justification.`,
    );
  });
});
