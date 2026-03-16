import { Hono } from "hono";
import { z } from "zod";
import type { Variables } from "../types/index.js";

export const resumeRoastRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

const RoastRequestSchema = z.object({
  resumeText: z.string().min(20).max(10000),
});

const RoastResponseSchema = z.object({
  score: z.number().min(0).max(10),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  roast: z.string(),
  fixes: z.array(z.string()),
  improvedExamples: z.array(z.object({ original: z.string(), improved: z.string() })),
});

type RoastResponse = z.infer<typeof RoastResponseSchema>;

function buildMockRoast(resumeText: string): RoastResponse {
  const wordCount = resumeText.split(/\s+/).length;
  const hasNumbers = /\d+%|\d+x|\$\d+|\d+ (?:million|billion|k\b)/i.test(resumeText);
  const hasBullets = resumeText.includes("•") || resumeText.includes("-") || resumeText.includes("*");
  let score = 5.0;
  if (hasNumbers) score += 1.5;
  if (hasBullets) score += 0.5;
  if (wordCount < 150) score -= 1.5;
  if (wordCount > 600) score -= 0.5;
  score = Math.min(9.8, Math.max(2.0, score));

  return {
    score: Math.round(score * 10) / 10,
    strengths: [
      "Clear structure with recognisable sections",
      hasNumbers ? "Quantified achievements present" : "Relevant experience listed",
      "Professional tone maintained throughout",
    ],
    weaknesses: [
      !hasNumbers ? "No quantified achievements — hiring managers scan for numbers" : "Some bullet points lack specifics",
      wordCount < 200 ? "Too brief — add more detail to key roles" : "Some sections could be more concise",
      "Action verbs could be stronger (replace 'responsible for' with 'Led', 'Drove', 'Delivered')",
    ],
    roast: `Your resume reads like a terms-of-service agreement — technically complete but nobody actually reads it. ${!hasNumbers ? "Where are the numbers? '5 years of experience' tells me nothing. '5 years building systems that process 10M events/day' tells me everything." : "You have some numbers, but they're hiding. Make them the first thing I see."} ${wordCount < 200 ? "It's shorter than a LinkedIn bio. Give me something to work with." : ""}`,
    fixes: [
      "Start every bullet with a strong past-tense action verb (Led, Drove, Architected, Reduced, Grew)",
      "Add at least one measurable result per role (%, $, x, users)",
      "Remove 'responsible for' and 'worked on' — replace with what you actually delivered",
      "Put your most impressive achievement in the first bullet of your most recent role",
    ],
    improvedExamples: [
      {
        original: "Responsible for managing the team and overseeing the project",
        improved: "Led a team of 6 engineers, delivering the project 2 weeks ahead of schedule and 10% under budget",
      },
      {
        original: "Worked on improving the application performance",
        improved: "Reduced p99 API latency by 40% (800ms → 480ms) through query optimisation and Redis caching",
      },
    ],
  };
}

async function callOpenRouterRoast(resumeText: string, apiKey: string): Promise<RoastResponse> {
  const systemPrompt = `You are a brutally honest but constructive career coach specialising in tech resumes. Analyse the provided resume and return a JSON object with this exact shape:
{
  "score": <number 0-10>,
  "strengths": [<3 specific strengths>],
  "weaknesses": [<3 specific weaknesses>],
  "roast": "<a single witty but constructive roast paragraph>",
  "fixes": [<4 actionable specific fixes>],
  "improvedExamples": [{ "original": "<direct quote>", "improved": "<improved version>" }, ...]
}

Rules:
- score: be honest and calibrated (6-7 is a good resume, 8-9 is exceptional, 1-3 is genuinely problematic)
- roast: be sharp and memorable — this is the viral hook — but keep it useful
- fixes: specific, actionable, not generic advice
- improvedExamples: take 1–2 actual bullet points from the resume and rewrite them
- Return ONLY valid JSON`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hired.video",
      "X-Title": "hired.video Resume Roast",
    },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5",
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Roast this resume:\n\n${resumeText.slice(0, 6000)}` },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");

  const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const parsed = RoastResponseSchema.safeParse(JSON.parse(stripped));
  if (!parsed.success) throw new Error("LLM returned invalid roast schema");
  return parsed.data;
}

// POST /api/resume/roast — no auth required (public tool)
resumeRoastRoutes.post("/roast", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RoastRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "resumeText is required (20–10 000 chars)", parsed.error.flatten()), 400);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  try {
    const roast = apiKey
      ? await callOpenRouterRoast(parsed.data.resumeText, apiKey)
      : buildMockRoast(parsed.data.resumeText);

    return c.json(ok(roast));
  } catch (err) {
    console.error("[resume/roast] error:", err);
    // Always fall back to mock rather than returning an error to the user
    return c.json(ok(buildMockRoast(parsed.data.resumeText)));
  }
});
