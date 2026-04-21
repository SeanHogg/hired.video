#!/usr/bin/env node
/**
 * LLM bake-off harness for the /api/match pipeline.
 *
 * Runs the analyze + tailor prompts against every model in the OpenRouter
 * free fallback chain and emits a markdown table: score, latency, token
 * cost, schema validity. Use this to pick the model that performs best
 * for THIS specific pipeline before hard-coding it into the fallback list.
 *
 * This hits real OpenRouter endpoints — it's OPT-IN so CI doesn't run
 * it by accident:
 *
 *   RUN_LLM_BAKEOFF=1 OPENROUTER_API_KEY=... \
 *     node scripts/llm-bakeoff.mjs [--job path/to/job.txt] [--resume path/to/resume.txt]
 *
 * Without a custom job/resume the harness uses the built-in fixture so
 * repeated runs are comparable.
 *
 * Output: a markdown file at scripts/bakeoff-results/<timestamp>.md plus
 * a table to stdout.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Opt-in gate
// ---------------------------------------------------------------------------

if (process.env.RUN_LLM_BAKEOFF !== "1") {
  console.error("Bake-off is opt-in. Set RUN_LLM_BAKEOFF=1 to run. (Costs real tokens.)");
  process.exit(0); // exit cleanly so this file is safe to include in `npm test`
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is required for the bake-off.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Model catalog — mirrors api/src/services/ai.ts FREE_FALLBACK_MODELS so
// a model drop in one place stays aligned.
// ---------------------------------------------------------------------------

const MODELS = [
  "google/gemma-4-31b-it:free",
  "openrouter/elephant-alpha",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "openai/gpt-oss-120b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "z-ai/glm-4.5-air:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "qwen/qwen3-coder:free",
];

// ---------------------------------------------------------------------------
// Built-in fixture — realistic React SWE job + matching resume.
// ---------------------------------------------------------------------------

const FIXTURE_JOB = `Title: Senior Frontend Engineer
Company: GlobalCo
Location: Remote, USA

We're hiring a Senior Frontend Engineer to own our design-system migration
to Next.js App Router. You'll work closely with Product + Design to ship
end-to-end features in React + TypeScript, own the component library that
the rest of the org builds against, and lead code review for 4 other
frontend engineers.

Requirements:
- 5+ years React in production
- 3+ years TypeScript
- Experience with Next.js App Router or a comparable SSR framework
- Strong CSS fundamentals (flexbox, grid, design tokens)
- Hands-on experience with performance work (LCP, hydration, code splitting)

Nice to have:
- GraphQL (Apollo or urql)
- A/B testing frameworks (GrowthBook, LaunchDarkly)
- Mentorship or tech-lead experience
`;

const FIXTURE_RESUME = `Name: Jane Doe
Title: Senior Frontend Engineer

Summary: Senior frontend engineer with 8 years building large React apps.

Experience:
- Senior Engineer at Acme (2022 - Present)
  - Led the Next.js App Router migration — cut LCP from 4.2s to 1.8s
  - Owned the design-system component library consumed by 60+ internal apps
  - Drove migration from Redux to Zustand, dropping bundle by 18%
- Frontend Engineer at BetaCo (2019 - 2022)
  - Built A/B testing framework on top of GrowthBook
  - Shipped a GraphQL migration across 40+ components using Apollo

Skills: React, TypeScript, Next.js, GraphQL (Apollo), CSS, Zustand, Redux
`;

// ---------------------------------------------------------------------------
// CLI — allow overriding with --job / --resume
// ---------------------------------------------------------------------------

function getFlag(name) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

const jobFile = getFlag("job");
const resumeFile = getFlag("resume");
const jobText = jobFile ? readFileSync(resolve(jobFile), "utf8") : FIXTURE_JOB;
const resumeText = resumeFile ? readFileSync(resolve(resumeFile), "utf8") : FIXTURE_RESUME;

// ---------------------------------------------------------------------------
// Schemas — duplicated tiny so this script has zero internal imports
// ---------------------------------------------------------------------------

const AnalyzeResponse = z.object({
  score: z.number().min(0).max(100),
  summaryRecommendations: z.union([z.string(), z.array(z.string())]),
});

const TailorResponse = z.object({
  oldScore: z.number().min(0).max(100),
  newScore: z.number().min(0).max(100),
  markdownResume: z.string().min(100),
  summaryRecommendations: z.union([z.string(), z.array(z.string())]),
});

// ---------------------------------------------------------------------------
// OpenRouter call
// ---------------------------------------------------------------------------

async function callOpenRouter(model, systemPrompt, userMessage, temperature = 0.3) {
  const start = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hired.video",
      "X-Title": "hired.video",
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      usage: { include: true },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });
  const latencyMs = Date.now() - start;
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, latencyMs, error: `${res.status}: ${errText.slice(0, 200)}` };
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "";
  const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    return { ok: false, latencyMs, error: "JSON parse: " + err.message, raw: content };
  }
  return {
    ok: true,
    latencyMs,
    parsed,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
    modelReturned: json.model ?? model,
  };
}

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

const ANALYZE_SYSTEM = `You are a professional resume analyst. Evaluate how well a resume matches a job description and return a JSON response.
Scoring criteria: Skills 40%, Experience 30%, Education 15%, Keywords 15%.
Always return valid JSON with integer score 0-100 and actionable recommendations.`;

const TAILOR_SYSTEM = `You are an expert resume writer. Return JSON: { "oldScore", "newScore", "markdownResume", "summaryRecommendations" }.
Do not fabricate experience. Keep the same person's real history; reorder and rephrase to match the job.`;

async function runAnalyze(model) {
  const userMessage = `Job Description:\n${jobText}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<2-4 bullet points>" }`;
  const r = await callOpenRouter(model, ANALYZE_SYSTEM, userMessage, 0.3);
  if (!r.ok) return { ...r, schemaOk: false };
  const check = AnalyzeResponse.safeParse(r.parsed);
  return {
    ...r,
    schemaOk: check.success,
    score: check.success ? check.data.score : null,
  };
}

async function runTailor(model) {
  const userMessage = `Job Description:\n${jobText}\n\n---\n\nOriginal Resume:\n${resumeText}\n\n---\n\nReturn JSON: { "oldScore": <0-100>, "newScore": <0-100>, "markdownResume": "<full tailored resume in Markdown>", "summaryRecommendations": "<3-5 bullet points>" }`;
  const r = await callOpenRouter(model, TAILOR_SYSTEM, userMessage, 0.5);
  if (!r.ok) return { ...r, schemaOk: false };
  const check = TailorResponse.safeParse(r.parsed);
  const pct = (s) => (typeof s === "string" ? s.length : 0);
  return {
    ...r,
    schemaOk: check.success,
    newScore: check.success ? check.data.newScore : null,
    oldScore: check.success ? check.data.oldScore : null,
    resumeLen: check.success ? pct(check.data.markdownResume) : pct(r.parsed?.markdownResume ?? ""),
    preservesParent: check.success && check.data.markdownResume.toLowerCase().includes("jane doe"),
    addsJobKeywords:
      check.success &&
      /next\.?js/i.test(check.data.markdownResume) &&
      /typescript/i.test(check.data.markdownResume),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function fmt(v) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "boolean") return v ? "\u2713" : "\u2717";
  return String(v);
}

function renderAnalyzeTable(rows) {
  const header =
    "| Model | Score | Latency (ms) | Prompt tokens | Completion tokens | Schema OK |\n" +
    "|-------|-------|--------------|---------------|-------------------|-----------|";
  const body = rows
    .map(
      (r) =>
        `| ${r.model} | ${fmt(r.score)} | ${fmt(r.latencyMs)} | ${fmt(r.promptTokens)} | ${fmt(r.completionTokens)} | ${fmt(r.schemaOk)} |`,
    )
    .join("\n");
  return `${header}\n${body}`;
}

function renderTailorTable(rows) {
  const header =
    "| Model | Old | New | Δ | Resume len | Preserves parent | Adds job keywords | Latency (ms) | Schema OK |\n" +
    "|-------|-----|-----|---|------------|------------------|-------------------|--------------|-----------|";
  const body = rows
    .map(
      (r) =>
        `| ${r.model} | ${fmt(r.oldScore)} | ${fmt(r.newScore)} | ${
          r.oldScore != null && r.newScore != null ? fmt(r.newScore - r.oldScore) : "-"
        } | ${fmt(r.resumeLen)} | ${fmt(r.preservesParent)} | ${fmt(r.addsJobKeywords)} | ${fmt(r.latencyMs)} | ${fmt(r.schemaOk)} |`,
    )
    .join("\n");
  return `${header}\n${body}`;
}

(async () => {
  console.log(`Running bake-off against ${MODELS.length} models...\n`);

  const analyzeRows = [];
  const tailorRows = [];
  for (const model of MODELS) {
    process.stdout.write(`  ${model.padEnd(48)} `);
    const [a, t] = await Promise.all([runAnalyze(model), runTailor(model)]);
    analyzeRows.push({ model, ...a });
    tailorRows.push({ model, ...t });
    console.log(`analyze=${a.schemaOk ? "ok" : "x"} tailor=${t.schemaOk ? "ok" : "x"}`);
  }

  const report = [
    `# LLM Bake-off Results`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Job length: ${jobText.length} chars`,
    `Resume length: ${resumeText.length} chars`,
    ``,
    `## Analyze`,
    ``,
    renderAnalyzeTable(analyzeRows),
    ``,
    `## Tailor`,
    ``,
    renderTailorTable(tailorRows),
    ``,
  ].join("\n");

  const outDir = resolve(__dirname, "bakeoff-results");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(outDir, `${stamp}.md`);
  writeFileSync(outPath, report, "utf8");

  console.log("\n" + report);
  console.log(`\nReport written to ${outPath}`);
})();
