/**
 * Resume Roast (public loss-leader on the marketing site) — request/response
 * schemas, the deterministic no-LLM roast, and the LLM call. The HTTP
 * adapter is POST /api/resumes/roast (routes/resumes/ai.ts).
 */
import { z } from "zod";
import { getPrompt } from "../../../../shared/ai-prompts/index.js";
import type { LLMClient } from "../adapters/llm-client.js";

export const RoastRequestSchema = z.object({
  resumeText: z.string().min(20).max(50000),
});

const RoastResponseSchema = z.object({
  score: z.number().min(0).max(10),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  roast: z.string(),
  fixes: z.array(z.string()),
  improvedExamples: z.array(z.object({ original: z.string(), improved: z.string() })),
});

export type RoastResponse = z.infer<typeof RoastResponseSchema>;

export function buildMockRoast(resumeText: string): RoastResponse {
  const lines = resumeText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;

  const bulletLines = lines.filter((l) => /^[-•▪▸►◦‣*\d.]+\s+/.test(l));
  const hasBullets = bulletLines.length > 0;

  // Extract metrics but avoid treating phone numbers as metrics
  const rawMetrics = Array.from(resumeText.matchAll(/\b\d+(?:\.\d+)?(?:%|k|m|b|x)?\b/gi)).map((m) => m[0]);
  const metrics = rawMetrics.filter((m) => {
    const digits = m.replace(/\D/g, "");
    // Ignore things that look like a phone number (10+ digits)
    if (digits.length >= 10) return false;
    return true;
  });
  const hasNumbers = metrics.length > 0;

  const verbs = Array.from(resumeText.matchAll(/\b(lead|led|manage|managed|build|built|design|designed|deliver|delivered|drive|drove|improve|improved|reduce|reduced|optimi[sz]e|launched|created)\b/gi)).map((m) => m[0].toLowerCase());
  const uniqueVerbs = Array.from(new Set(verbs));

  const scoreBase = 5.5 + (hasNumbers ? 1.0 : 0) + (hasBullets ? 0.7 : 0) + (uniqueVerbs.length > 2 ? 0.8 : 0) - (wordCount < 180 ? 1 : 0) - (wordCount > 700 ? 0.5 : 0);
  const score = Math.min(9.8, Math.max(2.0, scoreBase));

  const firstMetric = metrics[0] ?? "a measurable result";

  // Pick short, bullet-like lines for improved examples (fallback to sentences)
  const candidateLines = bulletLines.length > 0 ? bulletLines : [];
  if (candidateLines.length === 0) {
    const sentences = resumeText
      .split(/[.?!]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    candidateLines.push(...sentences.slice(0, 2));
  }
  const firstBullet = candidateLines[0] ?? "a key accomplishment";
  const secondBullet = candidateLines[1] ?? candidateLines[0] ?? "a key accomplishment";

  const strengths: string[] = [];
  if (hasBullets) strengths.push(`Uses bullet points to highlight accomplishments`);
  if (hasNumbers) strengths.push(`Includes measurable results (e.g. ${firstMetric})`);
  if (uniqueVerbs.length > 0) strengths.push(`Uses action verbs like ${uniqueVerbs.slice(0, 3).join(", ")}`);
  if (strengths.length < 3) strengths.push("Clear structure with recognisable sections");

  const weaknesses: string[] = [];
  if (!hasNumbers) weaknesses.push("No quantifiable impact — hiring managers scan for numbers");
  if (!hasBullets) weaknesses.push("Lacks bullet points — it reads like a paragraph instead of achievements");
  if (uniqueVerbs.length === 0) weaknesses.push("Weak verbs (responsible for, helped) make achievements bland");
  if (wordCount < 180) weaknesses.push("Too short — add more detail about what you delivered");
  if (weaknesses.length < 3) weaknesses.push("Some sections could be more concise and focused on outcomes");

  const roastLines: string[] = [];
  roastLines.push(
    hasNumbers
      ? `Great, you include some hard numbers (${firstMetric}) — now put them front and center.`
      : `There's almost no measurable impact; '5 years of experience' means nothing without outcomes.`
  );
  if (!hasBullets) roastLines.push("This reads like a bio, not a resume. Bullet points make recruiters actually read it.");
  if (uniqueVerbs.length === 0) roastLines.push("Swap 'responsible for' / 'worked on' for real action verbs like 'Led', 'Built', 'Delivered'.");
  roastLines.push("Make the first bullet under your most recent job the one you want the hiring manager to remember.");

  function improvePhrase(text: string): string {
    let improved = text;
    improved = improved.replace(/\bresponsible for\b/gi, "led");
    improved = improved.replace(/\bworked on\b/gi, "delivered");
    improved = improved.replace(/\bhelped (?:with|to?)\b/gi, "led");
    if (!/\d/.test(improved)) {
      // add a generic metric if missing
      improved = improved.replace(/\.$/, " — drove a 20% improvement.");
      if (improved === text) improved += " — delivered measurable impact.";
    }
    return improved;
  }

  const sanitizeExample = (text: string): string => {
    let out = text.trim();
    if (out.length > 120) out = out.slice(0, 117).trim() + "...";
    return out;
  };

  const improvedExamples = [firstBullet, secondBullet].map((orig) => {
    const original = sanitizeExample(orig);
    const improved = sanitizeExample(improvePhrase(orig));
    return { original, improved };
  });

  const fixes = [
    hasBullets ? "Keep using bullets, but lead with the result (e.g., 'Increased revenue by 30%')" : "Turn responsibilities into bullet-point achievements with measurable outcomes",
    hasNumbers ? "Move your strongest metric to the top of each role" : "Add at least one number per role (%, $ impact, team size, users)",
    uniqueVerbs.length > 0 ? "Swap weak verbs for stronger, outcome-focused verbs (e.g., 'led', 'delivered', 'scaled')" : "Start bullets with strong action verbs (Led, Built, Optimized, Drove)",
    "Write the resume as a story: what you delivered, how you did it, and why it mattered.",
  ];

  return {
    score: Math.round(score * 10) / 10,
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    roast: roastLines.join(" "),
    fixes,
    improvedExamples,
  };
}

const ROAST_SYSTEM_PROMPT = getPrompt("resume-roast").render({});

/** The LLM roast (throws on a configured-but-failed call). */
export async function roastWithLlm(llm: LLMClient, resumeText: string): Promise<RoastResponse> {
  const { data } = await llm.callJson(
    "resume_roast",
    {
      useCase: "resume_roast",
      systemPrompt: ROAST_SYSTEM_PROMPT,
      userMessage: `Roast this resume:

${resumeText.slice(0, 6000)}`,
    },
    RoastResponseSchema,
  );
  return data;
}
