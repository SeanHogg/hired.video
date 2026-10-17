/**
 * Career resilience report (gap #103) — how exposed a role is to AI
 * displacement, with skill gaps, adjacent roles and a retraining roadmap.
 * The `career-resilience` AI tool asks the LLM; with no provider it serves
 * the heuristic report below. Reports persist with a share token
 * (GET /api/career/resilience-report/:token).
 */
import { z } from "zod";
import { getPrompt } from "../../../../shared/ai-prompts/index.js";

export const ResilienceRequestSchema = z.object({
  currentRole: z.string().min(2).max(200),
  yearsExperience: z.number().int().min(0).max(50).optional(),
  topSkills: z.array(z.string()).max(10).optional().default([]),
  industry: z.string().max(100).optional(),
});

/** The report JSON (LLM output is loosely shaped — `riskScore` is the one
 *  field the persistence row reads). */
export type ResilienceReport = Record<string, unknown> & { riskScore?: number };

export const RESILIENCE_SYSTEM_PROMPT = getPrompt("career-resilience").render({});

export function buildResiliencePrompt(role: string, years?: number, skills?: string[], industry?: string): string {
  return `Role: ${role}
${years !== undefined ? `Years of experience: ${years}` : ""}
${skills && skills.length > 0 ? `Current skills: ${skills.join(", ")}` : ""}
${industry ? `Industry: ${industry}` : ""}

Assess this professional's AI displacement risk and generate a career resilience report.`;
}

export function getFallbackRiskScore(role: string): number {
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

export function buildFallbackReport(role: string, score: number, skills: string[]): ResilienceReport {
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
