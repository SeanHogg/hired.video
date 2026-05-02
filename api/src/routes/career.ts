import { Hono } from "hono";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLM, getApiKey } from "../services/adapters/ai.js";
import { extractJson as extractJsonShared } from "../services/resume/parse.js";

export const careerRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string { return c.var.user?.sub as string; }
function ok<T>(data: T) { return { success: true as const, data }; }

const ResilienceRequestSchema = z.object({
  currentRole: z.string().min(2).max(200),
  yearsExperience: z.number().int().min(0).max(50).optional(),
  topSkills: z.array(z.string()).max(10).optional().default([]),
  industry: z.string().max(100).optional(),
});

// POST /api/career/resilience-score — generate AI career resilience report (gap #103)
careerRoutes.post("/resilience-score", async (c) => {
  const userId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = ResilienceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const { currentRole, yearsExperience, topSkills, industry } = parsed.data;

  const apiKey = getApiKey((c.env as any) ?? {});

  // Heuristic fallback risk scores by role category
  const fallbackScore = getFallbackRiskScore(currentRole);
  let reportJson: any = buildFallbackReport(currentRole, fallbackScore, topSkills ?? []);

  if (apiKey) {
    try {
      const prompt = buildResiliencePrompt(currentRole, yearsExperience, topSkills ?? [], industry);
      const raw = await callLLM(apiKey, {
        useCase: "career",
        systemPrompt: RESILIENCE_SYSTEM_PROMPT,
        userMessage: prompt,
      });
      const parsed = extractJson(raw);
      if (parsed) reportJson = parsed;
    } catch { /* use fallback */ }
  }

  const riskScore = reportJson.riskScore ?? fallbackScore;
  const shareToken = randomBytes(16).toString("hex");

  const db = getDb();
  const [report] = await db.insert(schema.careerResilienceReports).values({
    userId,
    currentRole,
    riskScore,
    reportJson,
    shareToken,
  } as any).returning();

  return c.json(ok({ ...report, report: reportJson }), 201);
});

// GET /api/career/resilience-reports — list user's past reports
careerRoutes.get("/resilience-reports", async (c) => {
  const db = getDb();
  const reports = await db.select().from(schema.careerResilienceReports)
    .where(eq(schema.careerResilienceReports.userId, uid(c)))
    .orderBy(desc(schema.careerResilienceReports.createdAt))
    .limit(10);
  return c.json(ok(reports));
});

// GET /api/career/resilience-report/:token — public shareable report
careerRoutes.get("/resilience-report/:token", async (c) => {
  const db = getDb();
  const [report] = await db.select().from(schema.careerResilienceReports)
    .where(eq(schema.careerResilienceReports.shareToken, c.req.param("token")))
    .limit(1);
  if (!report) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Report not found" } }, 404);
  // Return without userId for public access
  const { userId: _uid, ...publicReport } = report;
  return c.json(ok(publicReport));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RESILIENCE_SYSTEM_PROMPT = `You are an expert labour economist and AI impact analyst. Assess career resilience based on a professional's current role.

Return ONLY valid JSON (no markdown, no explanation) matching this schema:
{
  "riskScore": number 0-100 (higher = more AI displacement risk),
  "riskLabel": "Low Risk" | "Moderate Risk" | "High Risk" | "Critical Risk",
  "summary": string (2-3 sentences explaining the risk level),
  "displacementFactors": string[] (3-5 specific reasons for the risk score),
  "skillGaps": [{ "skill": string, "importance": "Critical" | "High" | "Medium", "timeToLearn": string }],
  "adjacentRoles": [{ "title": string, "salaryDelta": string, "transitionDifficulty": "Easy" | "Moderate" | "Hard", "aiSafeScore": number }],
  "retrainingRoadmap": [{ "step": number, "action": string, "timeframe": string, "resource": string }],
  "marketSignals": string[] (2-3 observable trends supporting the assessment),
  "salaryTrajectory": { "current": string, "in2Years": string, "in5Years": string }
}`;

function buildResiliencePrompt(role: string, years?: number, skills?: string[], industry?: string): string {
  return `Role: ${role}
${years !== undefined ? `Years of experience: ${years}` : ""}
${skills && skills.length > 0 ? `Current skills: ${skills.join(", ")}` : ""}
${industry ? `Industry: ${industry}` : ""}

Assess this professional's AI displacement risk and generate a career resilience report.`;
}

function getFallbackRiskScore(role: string): number {
  const r = role.toLowerCase();
  if (/data entry|bookkeeping|cashier|teller|transcri|toll|typist/.test(r)) return 88;
  if (/analyst|accountant|paralegal|radiolog|audit/.test(r)) return 65;
  if (/software|engineer|developer|architect|devops/.test(r)) return 35;
  if (/nurse|doctor|therapist|teacher|counselor|coach/.test(r)) return 22;
  if (/creative|designer|artist|writer|director|strategist/.test(r)) return 40;
  if (/manager|executive|ceo|cto|vp|president/.test(r)) return 30;
  if (/recruiter|hr|talent/.test(r)) return 55;
  return 50;
}

function buildFallbackReport(role: string, score: number, skills: string[]): any {
  const label = score >= 75 ? "Critical Risk" : score >= 55 ? "High Risk" : score >= 35 ? "Moderate Risk" : "Low Risk";
  return {
    riskScore: score,
    riskLabel: label,
    summary: `As a ${role}, you face ${label.toLowerCase()} from AI automation. ${score >= 55 ? "Many tasks in this role are candidates for AI augmentation or replacement." : "Your role involves skills that are harder for AI to replicate, but staying current is important."}`,
    displacementFactors: [
      "Routine and structured tasks within this role are automatable",
      "AI tools can handle many knowledge-retrieval and synthesis tasks",
      "Increasing AI adoption across this function industry-wide",
    ],
    skillGaps: [
      { skill: "AI Tool Proficiency", importance: "Critical", timeToLearn: "1-2 months" },
      { skill: "Data Interpretation", importance: "High", timeToLearn: "2-3 months" },
      { skill: "Strategic Thinking", importance: "High", timeToLearn: "Ongoing" },
    ],
    adjacentRoles: [
      { title: `Senior ${role}`, salaryDelta: "+15%", transitionDifficulty: "Easy", aiSafeScore: score - 10 },
      { title: "AI Implementation Specialist", salaryDelta: "+25%", transitionDifficulty: "Moderate", aiSafeScore: 30 },
      { title: "Product Manager", salaryDelta: "+20%", transitionDifficulty: "Moderate", aiSafeScore: 28 },
    ],
    retrainingRoadmap: [
      { step: 1, action: "Complete an AI fundamentals course", timeframe: "Month 1-2", resource: "Coursera AI for Everyone" },
      { step: 2, action: "Build proficiency in 2 AI productivity tools relevant to your domain", timeframe: "Month 2-3", resource: "Platform skill assessments" },
      { step: 3, action: "Take on an AI-adjacent project at work to demonstrate adaptability", timeframe: "Month 3-6", resource: "Internal projects" },
    ],
    marketSignals: [
      "AI adoption in this function is accelerating across Fortune 500 companies",
      "Job postings for this role increasingly require AI tool proficiency",
    ],
    salaryTrajectory: {
      current: "Market rate",
      in2Years: score >= 55 ? "-5% to +5% (stagnant without reskilling)" : "+5% to +15%",
      in5Years: score >= 55 ? "-15% to +10% (high variance)" : "+10% to +30%",
    },
  };
}

/** Extract JSON from LLM output — delegates to shared resume-parse utility.
 *  Returns null instead of throwing on failure for backward compat. */
function extractJson(text: string): any | null {
  try {
    return extractJsonShared(text);
  } catch {
    return null;
  }
}
