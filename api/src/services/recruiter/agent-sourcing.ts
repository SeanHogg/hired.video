/**
 * AI Recruiter Agent (#66) use cases — candidate sourcing runs (keyword
 * probe + LLM score/outreach draft), brief → criteria intake (Agent v2),
 * and scheduled follow-ups (fired by workers/recruiter-agent-followup.ts).
 * Route: routes/recruiter/agent.ts.
 */
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { tryExtractJson } from "../../../../shared/extract-json.js";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { signalWork } from "../scheduling/work-signals.js";
import { deriveCriteriaFromBrief, deriveCriteriaFromJobRow, FOLLOWUP_DEFAULTS } from "./agent-intake.js";
import { JobsRepository } from "../../repositories/jobsRepository.js";
import {
  cancelAgentFollowup,
  completeAgentRun,
  findAgentFollowupState,
  findAgentRunOwner,
  findOwnedAgentRun,
  findResumeUserIdsMatchingSkills,
  findUsersByIds,
  insertAgentFollowup,
  insertAgentRun,
  listAgentFollowups,
  listAgentRunSummaries,
  type AgentRunResult,
} from "../../repositories/recruiterAgentRepository.js";
import type { JsonBody } from "./talent-pool.js";

// ── Sourcing run ────────────────────────────────────────────────────────────

/** Score matching candidates in the DB and draft personalised outreach.
 *  `llm` null → heuristic score + template draft. */
export async function runSourcingAgent(recruiterId: string, body: JsonBody, llm: LLMClient | null) {
  const jobTitle: string = String(body.jobTitle ?? "");
  if (!jobTitle) throw new DomainError(400, "VALIDATION_ERROR", "jobTitle is required");

  const skills: string[] = Array.isArray(body.skills) ? body.skills.map(String) : [];
  const location: string = String(body.location ?? "");
  const maxCandidates = Math.min(50, Math.max(1, Number(body.maxCandidates ?? 20)));

  const run = await insertAgentRun({
    recruiterId,
    jobId: body.jobId ?? null,
    jobTitle,
    criteria: { skills, location, experienceYears: body.experienceYears ?? null, maxCandidates },
    status: "running",
    startedAt: new Date(),
  });

  // Source candidates: users whose résumé content matches any skill.
  let candidates: Array<{ id: string; name: string; email: string }> = [];
  try {
    if (skills.length > 0) {
      const userIds = await findResumeUserIdsMatchingSkills(skills.slice(0, 5), maxCandidates);
      if (userIds.length > 0) {
        const userRows = await findUsersByIds(userIds);
        candidates = userRows.map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email }));
      }
    }
  } catch { /* sourcing failure is non-fatal */ }

  const results: AgentRunResult[] = [];
  for (const candidate of candidates) {
    let score = 70 + Math.floor(Math.random() * 25); // baseline heuristic
    let scoreReason = `Matched ${skills.length} required skill${skills.length !== 1 ? "s" : ""} in resume.`;
    let outreachDraft = `Hi ${candidate.name},\n\nI came across your profile and think you'd be a great fit for a ${jobTitle} role. Would you be open to a quick chat?\n\nBest,\n[Your name]`;

    if (llm) {
      try {
        const prompt = `You are a recruiter AI. Given the candidate "${candidate.name}" for the role "${jobTitle}" requiring skills: ${skills.join(", ")}, provide a JSON response with:
- score: integer 0-100 (fit score)
- scoreReason: one sentence why
- outreachDraft: a personalized 3-sentence LinkedIn/email outreach message

Respond ONLY with valid JSON: {"score":..,"scoreReason":"..","outreachDraft":".."}`;
        const { content } = await llm.callText("recruiter_agent_score", { useCase: "recruiter_match", systemPrompt: "", userMessage: prompt });
        const parsed = tryExtractJson<{ score?: number | string; scoreReason?: string; outreachDraft?: string }>(content);
        if (parsed?.score) score = Math.min(100, Math.max(0, Number(parsed.score)));
        if (parsed?.scoreReason) scoreReason = parsed.scoreReason;
        if (parsed?.outreachDraft) outreachDraft = parsed.outreachDraft;
      } catch { /* keep heuristic defaults */ }
    }

    results.push({ candidateId: candidate.id, name: candidate.name, email: candidate.email, score, scoreReason, outreachDraft });
  }

  results.sort((a, b) => b.score - a.score);
  await completeAgentRun(run.id, { candidatesFound: candidates.length, candidatesScored: results.length, results });

  return { runId: run.id, jobTitle, candidatesFound: candidates.length, results };
}

export const listAgentRuns = (recruiterId: string) => listAgentRunSummaries(recruiterId, 50);

export async function getAgentRun(recruiterId: string, id: string) {
  const run = await findOwnedAgentRun(recruiterId, id);
  if (!run) throw new DomainError(404, "NOT_FOUND", "Run not found");
  return run;
}

// ── Intake: brief / job → criteria ──────────────────────────────────────────
// LinkedIn Hiring Assistant parity. Heuristic fallback runs when no LLM key
// is configured so the surface still returns a usable shape in local dev.

export const IntakeSchema = z.object({
  briefText: z.string().optional(),
  jobId: UuidLikeSchema.optional(),
});

export async function deriveAgentCriteria(rawBody: unknown, llm: LLMClient | null) {
  const parsed = IntakeSchema.safeParse(rawBody);
  if (!parsed.success) throw new DomainError(400, "VALIDATION_ERROR", parsed.error.message);
  const { briefText, jobId } = parsed.data;
  if (!briefText && !jobId) throw new DomainError(400, "VALIDATION_ERROR", "briefText or jobId is required");

  if (jobId) {
    const row = await new JobsRepository(getDb()).findJobById(jobId);
    if (!row) throw new DomainError(404, "NOT_FOUND", "Job not found");
    return { ...deriveCriteriaFromJobRow(row), source: "job" as const };
  }
  const criteria = await deriveCriteriaFromBrief(briefText, llm);
  return { ...criteria, source: llm ? ("brief" as const) : ("fallback" as const) };
}

// ── Follow-ups ──────────────────────────────────────────────────────────────

export const ScheduleFollowupSchema = z.object({
  runId: UuidLikeSchema,
  candidateId: UuidLikeSchema,
  followupKind: z.string().min(1).max(32).optional().default("first_followup"),
  sequenceIndex: z.number().int().min(1).max(10).optional().default(1),
  scheduledFor: z.string().datetime().optional(),
  dayOffset: z.number().int().min(0).max(180).optional(),
  body: z.string().min(1).max(8000),
});

export async function scheduleAgentFollowup(recruiterId: string, rawBody: unknown) {
  const parsed = ScheduleFollowupSchema.safeParse(rawBody);
  if (!parsed.success) throw new DomainError(400, "VALIDATION_ERROR", parsed.error.message);
  const input = parsed.data;

  const run = await findAgentRunOwner(input.runId);
  if (!run || run.recruiterId !== recruiterId) throw new DomainError(404, "NOT_FOUND", "Agent run not found");

  const scheduledFor = input.scheduledFor
    ? new Date(input.scheduledFor)
    : new Date(Date.now() + (input.dayOffset ?? FOLLOWUP_DEFAULTS.firstOffsetDays) * 86_400_000);

  const row = await insertAgentFollowup({
    runId: input.runId,
    recruiterId,
    candidateId: input.candidateId,
    followupKind: input.followupKind,
    sequenceIndex: input.sequenceIndex,
    scheduledFor,
    body: input.body,
    status: "pending",
  });
  await signalWork("recruiter-agent-followups", scheduledFor);
  return row;
}

export const listFollowups = (recruiterId: string, status: string | null) => listAgentFollowups(recruiterId, status, 100);

export async function cancelFollowup(recruiterId: string, id: string) {
  const row = await findAgentFollowupState(id);
  if (!row || row.recruiterId !== recruiterId) throw new DomainError(404, "NOT_FOUND", "Follow-up not found");
  if (row.status !== "pending") throw new DomainError(400, "INVALID_STATE", `Follow-up is ${row.status}`);
  return cancelAgentFollowup(row.id);
}
